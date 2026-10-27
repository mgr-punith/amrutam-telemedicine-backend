export interface PendingBooking {
  readonly id: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly slotId: string;
  readonly status: 'PENDING_PAYMENT';
  readonly mode: 'VIDEO' | 'AUDIO' | 'CHAT';
  readonly scheduledAt: string;
  readonly payment: {
    readonly id: string;
    readonly status: 'PENDING';
    readonly amountMinor: number;
    readonly currency: string;
    readonly providerReference: string;
  };
}
