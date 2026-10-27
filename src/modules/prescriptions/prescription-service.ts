import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-error.js';
import type { FieldEncryption } from '../../infra/crypto/field-encryption.js';
import { assertResourceAccess } from '../../middleware/authorize.js';
import type { AuthenticatedPrincipal } from '../auth/auth-types.js';
import type { CreatePrescriptionRequest } from './prescription-contracts.js';
import type { PrescriptionRepository } from './prescription-repository.js';
import type {
  EncryptedPrescription,
  PrescriptionMetadata,
  PrescriptionView,
} from './prescription-types.js';

export class PrescriptionService {
  public constructor(
    private readonly repository: PrescriptionRepository,
    private readonly encryption: FieldEncryption,
  ) {}

  public async create(
    principal: AuthenticatedPrincipal,
    consultationId: string,
    input: CreatePrescriptionRequest,
    requestId: string,
    now = new Date(),
  ): Promise<PrescriptionMetadata> {
    const consultation = await this.requireAccess(principal, consultationId);
    if (principal.role !== 'DOCTOR' || consultation.doctorUserId !== principal.userId) {
      throw new ForbiddenError('Only the assigned doctor can create a prescription.');
    }
    if (consultation.status !== 'COMPLETED') {
      throw new ConflictError(
        'CONSULTATION_NOT_COMPLETED',
        'Prescriptions can be created only after consultation completion.',
      );
    }

    const encrypted = this.encryption.encrypt(input.content);
    const prescription = await this.repository.createVersion({
      consultationId,
      doctorUserId: principal.userId,
      contentEnc: encrypted.ciphertext,
      encKeyVersion: encrypted.keyVersion,
      requestId,
      now,
    });
    if (prescription === null) {
      throw new ConflictError(
        'CONSULTATION_NOT_COMPLETED',
        'Prescriptions can be created only after consultation completion.',
      );
    }
    return this.toMetadata(prescription);
  }

  public async list(
    principal: AuthenticatedPrincipal,
    consultationId: string,
    requestId: string,
  ): Promise<{ readonly prescriptions: readonly PrescriptionView[] }> {
    await this.requireAccess(principal, consultationId);
    const prescriptions = await this.repository.listWithAudit({
      consultationId,
      actorId: principal.userId,
      actorRole: principal.role as 'PATIENT' | 'DOCTOR',
      requestId,
    });
    return { prescriptions: prescriptions.map((prescription) => this.toView(prescription)) };
  }

  private async requireAccess(principal: AuthenticatedPrincipal, consultationId: string) {
    if (principal.role === 'ADMIN') {
      throw new ForbiddenError('Admins cannot read or create prescription content.');
    }
    const consultation = await this.repository.findConsultation(consultationId);
    if (consultation === null) {
      throw new NotFoundError('The consultation was not found.');
    }
    assertResourceAccess(principal, {
      patientUserId: consultation.patientId,
      doctorUserId: consultation.doctorUserId,
    });
    return consultation;
  }

  private toView(prescription: EncryptedPrescription): PrescriptionView {
    return {
      ...this.toMetadata(prescription),
      content: this.encryption.decrypt({
        ciphertext: prescription.contentEnc,
        keyVersion: prescription.encKeyVersion,
      }),
    };
  }

  private toMetadata(prescription: EncryptedPrescription): PrescriptionMetadata {
    return {
      id: prescription.id,
      consultationId: prescription.consultationId,
      version: prescription.version,
      createdAt: prescription.createdAt.toISOString(),
    };
  }
}
