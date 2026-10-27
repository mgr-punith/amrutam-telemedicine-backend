import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  CreateAvailabilitySlotRequest,
  DoctorSearchQuery,
  SlotListQuery,
} from './doctor-contracts.js';
import { SlotOverlapError, type DoctorRepository } from './doctor-repository.js';
import type { AvailabilitySlotView, DoctorDetail, DoctorSummary } from './doctor-types.js';

const doctorInclude = {
  user: { select: { profile: { select: { fullName: true } } } },
} satisfies Prisma.DoctorInclude;

export class PrismaDoctorRepository implements DoctorRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async searchVerified(query: DoctorSearchQuery): Promise<readonly DoctorSummary[]> {
    const doctors = await this.prisma.doctor.findMany({
      where: {
        verificationStatus: 'VERIFIED',
        ...(query.specialization === undefined
          ? {}
          : { specialization: { contains: query.specialization, mode: 'insensitive' } }),
        ...(query.city === undefined ? {} : { city: { equals: query.city, mode: 'insensitive' } }),
        ...(query.language === undefined ? {} : { languages: { has: query.language } }),
        ...(query.maxFeeMinor === undefined
          ? {}
          : { consultationFeeMinor: { lte: query.maxFeeMinor } }),
        ...(query.search === undefined
          ? {}
          : {
              OR: [
                { specialization: { contains: query.search, mode: 'insensitive' } },
                { city: { contains: query.search, mode: 'insensitive' } },
                {
                  user: {
                    profile: { fullName: { contains: query.search, mode: 'insensitive' } },
                  },
                },
              ],
            }),
      },
      include: doctorInclude,
      orderBy: [{ ratingAvg: 'desc' }, { experienceYears: 'desc' }, { id: 'asc' }],
      take: query.limit,
    });
    return doctors.map(toDoctorSummary);
  }

  public async findVerifiedById(doctorId: string): Promise<DoctorDetail | null> {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: doctorId, verificationStatus: 'VERIFIED' },
      include: doctorInclude,
    });
    return doctor === null
      ? null
      : { ...toDoctorSummary(doctor), qualifications: doctor.qualifications };
  }

  public async listAvailableSlots(
    doctorId: string,
    query: SlotListQuery,
    now: Date,
  ): Promise<readonly AvailabilitySlotView[]> {
    const slots = await this.prisma.availabilitySlot.findMany({
      where: {
        doctorId,
        status: 'AVAILABLE',
        startTime: {
          gte: query.from === undefined ? now : new Date(query.from),
          ...(query.to === undefined ? {} : { lt: new Date(query.to) }),
        },
        doctor: { verificationStatus: 'VERIFIED' },
      },
      orderBy: { startTime: 'asc' },
      take: query.limit,
    });
    return slots.map(toAvailabilitySlot);
  }

  public findByUserId(userId: string) {
    return this.prisma.doctor.findUnique({
      where: { userId },
      select: { id: true, verificationStatus: true },
    });
  }

  public async createSlot(
    doctorId: string,
    input: CreateAvailabilitySlotRequest,
  ): Promise<AvailabilitySlotView> {
    try {
      const slot = await this.prisma.availabilitySlot.create({
        data: {
          doctorId,
          startTime: new Date(input.startTime),
          endTime: new Date(input.endTime),
        },
      });
      return toAvailabilitySlot(slot);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2004')
      ) {
        throw new SlotOverlapError();
      }
      throw error;
    }
  }

  public async verifyDoctor(doctorId: string): Promise<boolean> {
    const result = await this.prisma.doctor.updateMany({
      where: { id: doctorId, verificationStatus: { not: 'VERIFIED' } },
      data: { verificationStatus: 'VERIFIED' },
    });
    if (result.count === 1) {
      return true;
    }
    return (await this.prisma.doctor.count({ where: { id: doctorId } })) === 1;
  }

  public async writeAudit(event: Parameters<DoctorRepository['writeAudit']>[0]): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: event.actorId,
        actorRole: event.actorRole,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        requestId: event.requestId,
        metadata: event.metadata ?? {},
      },
    });
  }
}

function toDoctorSummary(
  doctor: Prisma.DoctorGetPayload<{ include: typeof doctorInclude }>,
): DoctorSummary {
  return {
    id: doctor.id,
    fullName: doctor.user.profile?.fullName ?? 'Doctor',
    specialization: doctor.specialization,
    experienceYears: doctor.experienceYears,
    consultationFeeMinor: doctor.consultationFeeMinor,
    currency: doctor.currency,
    city: doctor.city,
    languages: doctor.languages,
    ratingAvg: Number(doctor.ratingAvg),
    ratingCount: doctor.ratingCount,
    verificationStatus: 'VERIFIED',
  };
}

function toAvailabilitySlot(slot: {
  readonly id: string;
  readonly doctorId: string;
  readonly startTime: Date;
  readonly endTime: Date;
}): AvailabilitySlotView {
  return {
    id: slot.id,
    doctorId: slot.doctorId,
    startTime: slot.startTime.toISOString(),
    endTime: slot.endTime.toISOString(),
    status: 'AVAILABLE',
  };
}
