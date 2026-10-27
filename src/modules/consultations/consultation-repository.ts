import type { CancelConsultationRequest } from './consultation-contracts.js';
import type {
  ConsultationAccessRecord,
  ConsultationStatus,
  ConsultationView,
} from './consultation-types.js';

export interface ConsultationRepository {
  findForAccess(consultationId: string): Promise<ConsultationAccessRecord | null>;
  findView(consultationId: string): Promise<ConsultationView | null>;
  transition(input: {
    readonly consultationId: string;
    readonly expectedStatus: ConsultationStatus;
    readonly nextStatus: ConsultationStatus;
    readonly actorId: string;
    readonly actorRole: 'DOCTOR';
    readonly action: 'consultation.started' | 'consultation.completed';
    readonly requestId: string;
    readonly now: Date;
  }): Promise<ConsultationView | null>;
  cancel(input: {
    readonly consultationId: string;
    readonly actorId: string;
    readonly actorRole: 'PATIENT' | 'DOCTOR';
    readonly reason: CancelConsultationRequest['reason'];
    readonly requestId: string;
    readonly now: Date;
  }): Promise<ConsultationView | null>;
}
