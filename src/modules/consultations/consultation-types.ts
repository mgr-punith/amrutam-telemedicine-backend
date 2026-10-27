export type ConsultationStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'NO_SHOW';

export interface ConsultationAccessRecord {
  readonly id: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly doctorUserId: string;
  readonly status: ConsultationStatus;
}

export interface ConsultationView extends ConsultationAccessRecord {
  readonly slotId: string;
  readonly mode: 'VIDEO' | 'AUDIO' | 'CHAT';
  readonly scheduledAt: string;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly cancelReason: string | null;
  readonly version: number;
  readonly payment: {
    readonly id: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
  } | null;
}
