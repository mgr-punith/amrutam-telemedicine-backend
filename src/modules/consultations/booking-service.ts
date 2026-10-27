import { ConflictError } from '../../common/errors/app-error.js';
import type { AuthenticatedPrincipal } from '../auth/auth-types.js';
import type { CreateConsultationRequest } from './booking-contracts.js';
import type { BookingRepository } from './booking-repository.js';

export class BookingService {
  public constructor(private readonly repository: BookingRepository) {}

  public async create(
    principal: AuthenticatedPrincipal,
    input: CreateConsultationRequest,
    requestId: string,
    now = new Date(),
  ) {
    const booking = await this.repository.createPendingBooking({
      patientId: principal.userId,
      slotId: input.slotId,
      mode: input.mode,
      requestId,
      now,
    });
    if (booking === null) {
      throw new ConflictError('SLOT_UNAVAILABLE', 'The selected slot is no longer available.');
    }
    return booking;
  }
}
