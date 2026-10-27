import type { UserRole } from '../auth/auth-types.js';
import type { EncryptedPrescription, PrescriptionConsultation } from './prescription-types.js';

export interface PrescriptionRepository {
  findConsultation(consultationId: string): Promise<PrescriptionConsultation | null>;
  createVersion(input: {
    readonly consultationId: string;
    readonly doctorUserId: string;
    readonly contentEnc: string;
    readonly encKeyVersion: string;
    readonly requestId: string;
    readonly now: Date;
  }): Promise<EncryptedPrescription | null>;
  listWithAudit(input: {
    readonly consultationId: string;
    readonly actorId: string;
    readonly actorRole: Extract<UserRole, 'PATIENT' | 'DOCTOR'>;
    readonly requestId: string;
  }): Promise<readonly EncryptedPrescription[]>;
}
