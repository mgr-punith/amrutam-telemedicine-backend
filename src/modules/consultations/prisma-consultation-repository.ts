import { Prisma, type PrismaClient } from '@prisma/client';

import type { ConsultationRepository } from './consultation-repository.js';
import type { ConsultationView } from './consultation-types.js';

const consultationInclude = {
  doctor: { select: { userId: true } },
  payment: {
    select: { id: true, amountMinor: true, currency: true, status: true },
  },
} satisfies Prisma.ConsultationInclude;

export class PrismaConsultationRepository implements ConsultationRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findForAccess(consultationId: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: {
        id: true,
        patientId: true,
        doctorId: true,
        status: true,
        doctor: { select: { userId: true } },
      },
    });
    if (consultation === null) {
      return null;
    }
    return {
      id: consultation.id,
      patientId: consultation.patientId,
      doctorId: consultation.doctorId,
      doctorUserId: consultation.doctor.userId,
      status: consultation.status,
    };
  }

  public async findView(consultationId: string): Promise<ConsultationView | null> {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: consultationInclude,
    });
    return consultation === null ? null : toConsultationView(consultation);
  }

  public transition(
    input: Parameters<ConsultationRepository['transition']>[0],
  ): Promise<ConsultationView | null> {
    return this.prisma.$transaction(async (transaction) => {
      const update = await transaction.consultation.updateMany({
        where: { id: input.consultationId, status: input.expectedStatus },
        data: {
          status: input.nextStatus,
          version: { increment: 1 },
          ...(input.nextStatus === 'IN_PROGRESS' ? { startedAt: input.now } : {}),
          ...(input.nextStatus === 'COMPLETED' ? { endedAt: input.now } : {}),
          updatedAt: input.now,
        },
      });
      if (update.count !== 1) {
        return null;
      }
      await transaction.auditLog.create({
        data: {
          actorId: input.actorId,
          actorRole: input.actorRole,
          action: input.action,
          resourceType: 'consultation',
          resourceId: input.consultationId,
          requestId: input.requestId,
        },
      });
      const consultation = await transaction.consultation.findUniqueOrThrow({
        where: { id: input.consultationId },
        include: consultationInclude,
      });
      return toConsultationView(consultation);
    });
  }

  public cancel(
    input: Parameters<ConsultationRepository['cancel']>[0],
  ): Promise<ConsultationView | null> {
    return this.prisma.$transaction(
      async (transaction) => {
        const consultation = await transaction.consultation.findUnique({
          where: { id: input.consultationId },
          include: { payment: true, doctor: { select: { userId: true } } },
        });
        if (
          consultation === null ||
          (consultation.status !== 'PENDING_PAYMENT' && consultation.status !== 'CONFIRMED')
        ) {
          return null;
        }

        const updatedConsultation = await transaction.consultation.updateMany({
          where: { id: consultation.id, status: consultation.status },
          data: {
            status: 'CANCELLED',
            cancelReason: input.reason,
            endedAt: input.now,
            version: { increment: 1 },
            updatedAt: input.now,
          },
        });
        if (updatedConsultation.count !== 1) {
          return null;
        }

        const slotUpdate = await transaction.availabilitySlot.updateMany({
          where: { id: consultation.slotId, status: { in: ['HELD', 'BOOKED'] } },
          data: {
            status: 'AVAILABLE',
            heldUntil: null,
            version: { increment: 1 },
            updatedAt: input.now,
          },
        });
        if (slotUpdate.count !== 1) {
          throw new Error('Cancellation could not release the consultation slot.');
        }

        if (consultation.payment !== null) {
          const paymentStatus =
            consultation.payment.status === 'SUCCEEDED'
              ? 'REFUNDED'
              : consultation.payment.status === 'PENDING'
                ? 'EXPIRED'
                : consultation.payment.status;
          if (paymentStatus !== consultation.payment.status) {
            await transaction.payment.update({
              where: { id: consultation.payment.id },
              data: { status: paymentStatus, updatedAt: input.now },
            });
          }
        }

        await transaction.auditLog.create({
          data: {
            actorId: input.actorId,
            actorRole: input.actorRole,
            action: 'consultation.cancelled',
            resourceType: 'consultation',
            resourceId: consultation.id,
            requestId: input.requestId,
            metadata: { previousStatus: consultation.status },
          },
        });
        const result = await transaction.consultation.findUniqueOrThrow({
          where: { id: consultation.id },
          include: consultationInclude,
        });
        return toConsultationView(result);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 5_000 },
    );
  }
}

function toConsultationView(
  consultation: Prisma.ConsultationGetPayload<{ include: typeof consultationInclude }>,
): ConsultationView {
  return {
    id: consultation.id,
    patientId: consultation.patientId,
    doctorId: consultation.doctorId,
    doctorUserId: consultation.doctor.userId,
    slotId: consultation.slotId,
    status: consultation.status,
    mode: consultation.mode,
    scheduledAt: consultation.scheduledAt.toISOString(),
    startedAt: consultation.startedAt?.toISOString() ?? null,
    endedAt: consultation.endedAt?.toISOString() ?? null,
    cancelReason: consultation.cancelReason,
    version: consultation.version,
    payment:
      consultation.payment === null
        ? null
        : {
            id: consultation.payment.id,
            amountMinor: consultation.payment.amountMinor,
            currency: consultation.payment.currency,
            status: consultation.payment.status,
          },
  };
}
