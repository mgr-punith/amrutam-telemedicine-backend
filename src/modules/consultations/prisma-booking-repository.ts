import { randomUUID } from 'node:crypto';

import { Prisma, type PrismaClient } from '@prisma/client';

import type { BookingRepository } from './booking-repository.js';
import type { PendingBooking } from './booking-types.js';

interface ClaimedSlot {
  readonly id: string;
  readonly doctorId: string;
  readonly startTime: Date;
}

export class PrismaBookingRepository implements BookingRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public createPendingBooking(
    input: Parameters<BookingRepository['createPendingBooking']>[0],
  ): Promise<PendingBooking | null> {
    return this.prisma.$transaction(
      async (transaction) => {
        const claimedSlots = await transaction.$queryRaw<ClaimedSlot[]>(Prisma.sql`
          UPDATE availability_slots
          SET status = 'HELD'::"SlotStatus",
              held_until = ${new Date(input.now.getTime() + 10 * 60 * 1_000)},
              version = version + 1,
              updated_at = ${input.now}
          WHERE id = ${input.slotId}::uuid
            AND status = 'AVAILABLE'::"SlotStatus"
            AND start_time > ${input.now}
            AND EXISTS (
              SELECT 1
              FROM doctors
              WHERE doctors.id = availability_slots.doctor_id
                AND doctors.verification_status = 'VERIFIED'::"DoctorVerificationStatus"
            )
          RETURNING id, doctor_id AS "doctorId", start_time AS "startTime"
        `);
        const slot = claimedSlots.at(0);
        if (slot === undefined) {
          return null;
        }

        const doctor = await transaction.doctor.findUniqueOrThrow({
          where: { id: slot.doctorId },
          select: { consultationFeeMinor: true, currency: true },
        });
        const providerReference = `mock_${randomUUID()}`;
        const consultation = await transaction.consultation.create({
          data: {
            patientId: input.patientId,
            doctorId: slot.doctorId,
            slotId: slot.id,
            mode: input.mode,
            scheduledAt: slot.startTime,
            payment: {
              create: {
                amountMinor: doctor.consultationFeeMinor,
                currency: doctor.currency,
                provider: 'MOCK',
                providerRef: providerReference,
              },
            },
          },
          include: { payment: true },
        });
        const payment = consultation.payment;
        if (payment === null) {
          throw new Error('Pending booking was created without a payment.');
        }

        await transaction.auditLog.create({
          data: {
            actorId: input.patientId,
            actorRole: 'PATIENT',
            action: 'booking.created',
            resourceType: 'consultation',
            resourceId: consultation.id,
            requestId: input.requestId,
            metadata: { slotId: slot.id, doctorId: slot.doctorId },
          },
        });

        return {
          id: consultation.id,
          patientId: consultation.patientId,
          doctorId: consultation.doctorId,
          slotId: consultation.slotId,
          status: 'PENDING_PAYMENT',
          mode: consultation.mode,
          scheduledAt: consultation.scheduledAt.toISOString(),
          payment: {
            id: payment.id,
            status: 'PENDING',
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            providerReference: payment.providerRef,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 5_000 },
    );
  }
}
