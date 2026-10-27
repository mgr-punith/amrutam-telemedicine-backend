import { Prisma, type PrismaClient } from '@prisma/client';

import type { PrescriptionRepository } from './prescription-repository.js';

export class PrismaPrescriptionRepository implements PrescriptionRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findConsultation(consultationId: string) {
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

  public createVersion(
    input: Parameters<PrescriptionRepository['createVersion']>[0],
  ): ReturnType<PrescriptionRepository['createVersion']> {
    return this.prisma.$transaction(
      async (transaction) => {
        const lockedConsultations = await transaction.$queryRaw<
          { readonly id: string; readonly doctorId: string; readonly patientId: string }[]
        >(Prisma.sql`
          SELECT consultations.id,
                 consultations.doctor_id AS "doctorId",
                 consultations.patient_id AS "patientId"
          FROM consultations
          INNER JOIN doctors ON doctors.id = consultations.doctor_id
          WHERE consultations.id = ${input.consultationId}::uuid
            AND consultations.status = 'COMPLETED'::"ConsultationStatus"
            AND doctors.user_id = ${input.doctorUserId}::uuid
          FOR UPDATE OF consultations
        `);
        const consultation = lockedConsultations.at(0);
        if (consultation === undefined) {
          return null;
        }

        const latest = await transaction.prescription.aggregate({
          where: { consultationId: consultation.id },
          _max: { version: true },
        });
        const prescription = await transaction.prescription.create({
          data: {
            consultationId: consultation.id,
            doctorId: consultation.doctorId,
            patientId: consultation.patientId,
            version: (latest._max.version ?? 0) + 1,
            contentEnc: input.contentEnc,
            encKeyVersion: input.encKeyVersion,
            createdAt: input.now,
          },
        });
        await transaction.auditLog.create({
          data: {
            actorId: input.doctorUserId,
            actorRole: 'DOCTOR',
            action: 'prescription.created',
            resourceType: 'prescription',
            resourceId: prescription.id,
            requestId: input.requestId,
            metadata: { consultationId: consultation.id, version: prescription.version },
          },
        });
        return prescription;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 5_000 },
    );
  }

  public listWithAudit(
    input: Parameters<PrescriptionRepository['listWithAudit']>[0],
  ): ReturnType<PrescriptionRepository['listWithAudit']> {
    return this.prisma.$transaction(async (transaction) => {
      const prescriptions = await transaction.prescription.findMany({
        where: { consultationId: input.consultationId },
        orderBy: { version: 'asc' },
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.actorId,
          actorRole: input.actorRole,
          action: 'prescription.read',
          resourceType: 'consultation',
          resourceId: input.consultationId,
          requestId: input.requestId,
          metadata: { prescriptionCount: prescriptions.length },
        },
      });
      return prescriptions;
    });
  }
}
