import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-error.js';
import type { AuthenticatedPrincipal } from '../auth/auth-types.js';
import type {
  CreateAvailabilitySlotRequest,
  DoctorSearchQuery,
  SlotListQuery,
} from './doctor-contracts.js';
import { SlotOverlapError, type DoctorRepository } from './doctor-repository.js';

const MAX_SLOT_DURATION_MS = 4 * 60 * 60 * 1_000;

export class DoctorService {
  public constructor(private readonly repository: DoctorRepository) {}

  public search(query: DoctorSearchQuery) {
    return this.repository.searchVerified(query);
  }

  public async get(doctorId: string) {
    const doctor = await this.repository.findVerifiedById(doctorId);
    if (doctor === null) {
      throw new NotFoundError('The verified doctor was not found.');
    }
    return doctor;
  }

  public listSlots(doctorId: string, query: SlotListQuery, now = new Date()) {
    return this.repository.listAvailableSlots(doctorId, query, now);
  }

  public async createSlot(
    principal: AuthenticatedPrincipal,
    input: CreateAvailabilitySlotRequest,
    requestId: string,
    now = new Date(),
  ) {
    const doctor = await this.repository.findByUserId(principal.userId);
    if (doctor === null) {
      throw new ForbiddenError('Only doctor accounts can create availability.');
    }
    if (doctor.verificationStatus !== 'VERIFIED') {
      throw new ForbiddenError('Doctor verification is required before creating availability.');
    }
    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);
    if (startTime <= now) {
      throw new ConflictError('SLOT_IN_PAST', 'Availability must start in the future.');
    }
    if (endTime.getTime() - startTime.getTime() > MAX_SLOT_DURATION_MS) {
      throw new ConflictError('SLOT_TOO_LONG', 'Availability cannot exceed four hours.');
    }

    try {
      const slot = await this.repository.createSlot(doctor.id, input);
      await this.repository.writeAudit({
        actorId: principal.userId,
        actorRole: 'DOCTOR',
        action: 'availability.created',
        resourceType: 'availability_slot',
        resourceId: slot.id,
        requestId,
        metadata: { doctorId: doctor.id },
      });
      return slot;
    } catch (error: unknown) {
      if (error instanceof SlotOverlapError) {
        throw new ConflictError('SLOT_OVERLAP', error.message);
      }
      throw error;
    }
  }

  public async verifyDoctor(
    principal: AuthenticatedPrincipal,
    doctorId: string,
    requestId: string,
  ) {
    const found = await this.repository.verifyDoctor(doctorId);
    if (!found) {
      throw new NotFoundError('The doctor was not found.');
    }
    await this.repository.writeAudit({
      actorId: principal.userId,
      actorRole: 'ADMIN',
      action: 'doctor.verified',
      resourceType: 'doctor',
      resourceId: doctorId,
      requestId,
    });
    return { id: doctorId, verificationStatus: 'VERIFIED' as const };
  }
}
