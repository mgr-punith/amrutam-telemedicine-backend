import type { CreateConsultationRequest } from './booking-contracts.js';
import type { PendingBooking } from './booking-types.js';

export interface BookingRepository {
  createPendingBooking(input: {
    readonly patientId: string;
    readonly slotId: string;
    readonly mode: CreateConsultationRequest['mode'];
    readonly requestId: string;
    readonly now: Date;
  }): Promise<PendingBooking | null>;
}
