import type {
  CreateAvailabilitySlotRequest,
  DoctorSearchQuery,
  SlotListQuery,
} from './doctor-contracts.js';
import type { AvailabilitySlotView, DoctorDetail, DoctorSummary } from './doctor-types.js';

export interface DoctorRepository {
  searchVerified(query: DoctorSearchQuery): Promise<readonly DoctorSummary[]>;
  findVerifiedById(doctorId: string): Promise<DoctorDetail | null>;
  listAvailableSlots(
    doctorId: string,
    query: SlotListQuery,
    now: Date,
  ): Promise<readonly AvailabilitySlotView[]>;
  findByUserId(userId: string): Promise<{
    readonly id: string;
    readonly verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  } | null>;
  createSlot(doctorId: string, input: CreateAvailabilitySlotRequest): Promise<AvailabilitySlotView>;
  verifyDoctor(doctorId: string): Promise<boolean>;
  writeAudit(event: {
    readonly actorId: string;
    readonly actorRole: 'DOCTOR' | 'ADMIN';
    readonly action: string;
    readonly resourceType: 'doctor' | 'availability_slot';
    readonly resourceId: string;
    readonly requestId: string;
    readonly metadata?: Readonly<Record<string, string | number | boolean>>;
  }): Promise<void>;
}

export class SlotOverlapError extends Error {
  public constructor() {
    super('The availability slot overlaps an existing slot.');
    this.name = 'SlotOverlapError';
  }
}
