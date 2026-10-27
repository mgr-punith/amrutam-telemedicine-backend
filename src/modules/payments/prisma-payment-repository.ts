import { Prisma, type PrismaClient } from '@prisma/client';

import type { PaymentRepository, PaymentEventResult } from './payment-repository.js';

export class PrismaPaymentRepository implements PaymentRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public processEvent(
    input: Parameters<PaymentRepository['processEvent']>[0],
  ): Promise<PaymentEventResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        const insertedEvents = await transaction.$queryRaw<{ readonly providerEventId: string }[]>(
          Prisma.sql`
            INSERT INTO webhook_events (provider_event_id, payload_hash, processed_at)
            VALUES (${input.event.eventId}, ${input.payloadHash}, ${input.now})
            ON CONFLICT (provider_event_id) DO NOTHING
            RETURNING provider_event_id AS "providerEventId"
          `,
        );
        if (insertedEvents.length === 0) {
          const existingEvent = await transaction.webhookEvent.findUniqueOrThrow({
            where: { providerEventId: input.event.eventId },
          });
          if (existingEvent.payloadHash !== input.payloadHash) {
            return { kind: 'event_mismatch' };
          }
          const existingPayment = await transaction.payment.findUnique({
            where: { providerRef: input.event.providerReference },
            select: { id: true },
          });
          return { kind: 'duplicate', paymentId: existingPayment?.id ?? null };
        }

        const payment = await transaction.payment.findUnique({
          where: { providerRef: input.event.providerReference },
          include: { consultation: true },
        });
        if (payment === null) {
          return { kind: 'payment_not_found' };
        }

        if (payment.status !== 'PENDING') {
          return { kind: 'processed', paymentId: payment.id, paymentStatus: payment.status };
        }

        if (input.event.status === 'SUCCEEDED') {
          const paymentUpdate = await transaction.payment.updateMany({
            where: { id: payment.id, status: 'PENDING' },
            data: { status: 'SUCCEEDED', updatedAt: input.now },
          });
          const consultationUpdate = await transaction.consultation.updateMany({
            where: { id: payment.consultationId, status: 'PENDING_PAYMENT' },
            data: { status: 'CONFIRMED', version: { increment: 1 }, updatedAt: input.now },
          });
          const slotUpdate = await transaction.availabilitySlot.updateMany({
            where: { id: payment.consultation.slotId, status: 'HELD' },
            data: {
              status: 'BOOKED',
              heldUntil: null,
              version: { increment: 1 },
              updatedAt: input.now,
            },
          });
          assertTransitionCounts(paymentUpdate.count, consultationUpdate.count, slotUpdate.count);
        } else {
          const paymentStatus = input.event.status === 'FAILED' ? 'FAILED' : 'EXPIRED';
          const paymentUpdate = await transaction.payment.updateMany({
            where: { id: payment.id, status: 'PENDING' },
            data: { status: paymentStatus, updatedAt: input.now },
          });
          const consultationUpdate = await transaction.consultation.updateMany({
            where: { id: payment.consultationId, status: 'PENDING_PAYMENT' },
            data: { status: 'EXPIRED', version: { increment: 1 }, updatedAt: input.now },
          });
          const slotUpdate = await transaction.availabilitySlot.updateMany({
            where: { id: payment.consultation.slotId, status: 'HELD' },
            data: {
              status: 'AVAILABLE',
              heldUntil: null,
              version: { increment: 1 },
              updatedAt: input.now,
            },
          });
          assertTransitionCounts(paymentUpdate.count, consultationUpdate.count, slotUpdate.count);
        }

        await transaction.auditLog.create({
          data: {
            actorId: null,
            actorRole: null,
            action:
              input.event.status === 'SUCCEEDED'
                ? 'payment.succeeded'
                : input.event.status === 'FAILED'
                  ? 'payment.failed'
                  : 'payment.expired',
            resourceType: 'payment',
            resourceId: payment.id,
            requestId: input.requestId,
            metadata: { consultationId: payment.consultationId },
          },
        });

        return {
          kind: 'processed',
          paymentId: payment.id,
          paymentStatus: input.event.status,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 5_000 },
    );
  }

  public async findProviderReference(paymentId: string): Promise<string | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { providerRef: true },
    });
    return payment?.providerRef ?? null;
  }
}

function assertTransitionCounts(
  paymentCount: number,
  consultationCount: number,
  slotCount: number,
): void {
  if (paymentCount !== 1 || consultationCount !== 1 || slotCount !== 1) {
    throw new Error('Payment state transition invariants were not satisfied.');
  }
}
