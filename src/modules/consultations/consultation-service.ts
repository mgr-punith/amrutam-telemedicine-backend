import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-error.js';
import { assertResourceAccess } from '../../middleware/authorize.js';
import type { AuthenticatedPrincipal } from '../auth/auth-types.js';
import type { CancelConsultationRequest } from './consultation-contracts.js';
import type { ConsultationRepository } from './consultation-repository.js';

export class ConsultationService {
  public constructor(private readonly repository: ConsultationRepository) {}

  public async get(principal: AuthenticatedPrincipal, consultationId: string) {
    const consultation = await this.requireAccess(principal, consultationId);
    const view = await this.repository.findView(consultation.id);
    if (view === null) {
      throw new NotFoundError('The consultation was not found.');
    }
    return view;
  }

  public async start(
    principal: AuthenticatedPrincipal,
    consultationId: string,
    requestId: string,
    now = new Date(),
  ) {
    const consultation = await this.requireAccess(principal, consultationId);
    if (principal.role !== 'DOCTOR' || consultation.doctorUserId !== principal.userId) {
      throw new ForbiddenError('Only the assigned doctor can start this consultation.');
    }
    const result = await this.repository.transition({
      consultationId,
      expectedStatus: 'CONFIRMED',
      nextStatus: 'IN_PROGRESS',
      actorId: principal.userId,
      actorRole: 'DOCTOR',
      action: 'consultation.started',
      requestId,
      now,
    });
    if (result === null) {
      throw new ConflictError(
        'CONSULTATION_NOT_CONFIRMED',
        'Only a confirmed consultation can be started.',
      );
    }
    return result;
  }

  public async complete(
    principal: AuthenticatedPrincipal,
    consultationId: string,
    requestId: string,
    now = new Date(),
  ) {
    const consultation = await this.requireAccess(principal, consultationId);
    if (principal.role !== 'DOCTOR' || consultation.doctorUserId !== principal.userId) {
      throw new ForbiddenError('Only the assigned doctor can complete this consultation.');
    }
    const result = await this.repository.transition({
      consultationId,
      expectedStatus: 'IN_PROGRESS',
      nextStatus: 'COMPLETED',
      actorId: principal.userId,
      actorRole: 'DOCTOR',
      action: 'consultation.completed',
      requestId,
      now,
    });
    if (result === null) {
      throw new ConflictError(
        'CONSULTATION_NOT_IN_PROGRESS',
        'Only an in-progress consultation can be completed.',
      );
    }
    return result;
  }

  public async cancel(
    principal: AuthenticatedPrincipal,
    consultationId: string,
    input: CancelConsultationRequest,
    requestId: string,
    now = new Date(),
  ) {
    await this.requireAccess(principal, consultationId);
    const result = await this.repository.cancel({
      consultationId,
      actorId: principal.userId,
      actorRole: principal.role as 'PATIENT' | 'DOCTOR',
      reason: input.reason,
      requestId,
      now,
    });
    if (result === null) {
      throw new ConflictError(
        'CONSULTATION_NOT_CANCELLABLE',
        'Only pending-payment or confirmed consultations can be cancelled.',
      );
    }
    return result;
  }

  private async requireAccess(principal: AuthenticatedPrincipal, consultationId: string) {
    if (principal.role === 'ADMIN') {
      throw new ForbiddenError('Admins can access aggregate analytics only.');
    }
    const consultation = await this.repository.findForAccess(consultationId);
    if (consultation === null) {
      throw new NotFoundError('The consultation was not found.');
    }
    assertResourceAccess(principal, {
      patientUserId: consultation.patientId,
      doctorUserId: consultation.doctorUserId,
    });
    return consultation;
  }
}
