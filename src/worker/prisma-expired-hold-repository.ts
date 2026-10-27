import { Prisma, type PrismaClient } from '@prisma/client';

import type { ExpiredHoldRepository } from './expired-hold-repository.js';

interface ExpiredHold {
  readonly consultationId: string;
  readonly paymentId: string;
  readonly slotId: string;
}

export class PrismaExpiredHoldRepository implements ExpiredHoldRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public expireDueHolds(
    input: Parameters<ExpiredHoldRepository['expireDueHolds']>[0],
  ): ReturnType<ExpiredHoldRepository['expireDueHolds']> {
    return this.prisma.$transaction(
      async (transaction) => {
        const expiredHolds = await transaction.$queryRaw<ExpiredHold[]>(Prisma.sql`
          SELECT consultations.id AS "consultationId",
                 payments.id AS "paymentId",
                 availability_slots.id AS "slotId"
          FROM consultations
          INNER JOIN payments ON payments.consultation_id = consultations.id
          INNER JOIN availability_slots ON availability_slots.id = consultations.slot_id
          WHERE consultations.status = 'PENDING_PAYMENT'::"ConsultationStatus"
            AND payments.status = 'PENDING'::"PaymentStatus"
            AND availability_slots.status = 'HELD'::"SlotStatus"
            AND availability_slots.held_until <= ${input.now}
          ORDER BY availability_slots.held_until
          LIMIT 100
          FOR UPDATE OF consultations, payments, availability_slots SKIP LOCKED
        `);

        for (const hold of expiredHolds) {
          const paymentUpdate = await transaction.payment.updateMany({
            where: { id: hold.paymentId, status: 'PENDING' },
            data: { status: 'EXPIRED', updatedAt: input.now },
          });
          const consultationUpdate = await transaction.consultation.updateMany({
            where: { id: hold.consultationId, status: 'PENDING_PAYMENT' },
            data: { status: 'EXPIRED', version: { increment: 1 }, updatedAt: input.now },
          });
          const slotUpdate = await transaction.availabilitySlot.updateMany({
            where: { id: hold.slotId, status: 'HELD', heldUntil: { lte: input.now } },
            data: {
              status: 'AVAILABLE',
              heldUntil: null,
              version: { increment: 1 },
              updatedAt: input.now,
            },
          });
          if (
            paymentUpdate.count !== 1 ||
            consultationUpdate.count !== 1 ||
            slotUpdate.count !== 1
          ) {
            throw new Error('Expired hold compensation invariants were not satisfied.');
          }
          await transaction.auditLog.create({
            data: {
              actorId: null,
              actorRole: null,
              action: 'booking.hold_expired',
              resourceType: 'consultation',
              resourceId: hold.consultationId,
              requestId: input.requestId,
              metadata: { paymentId: hold.paymentId, slotId: hold.slotId },
            },
          });
        }
        return expiredHolds.length;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
    );
  }
}
