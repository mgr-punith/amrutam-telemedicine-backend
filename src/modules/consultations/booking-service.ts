import { ConflictError } from '../../common/errors/app-error.js';
import type { AuthenticatedPrincipal } from '../auth/auth-types.js';
import type { ApplicationMetrics } from '../../infra/observability/metrics.js';
import { withActiveSpan } from '../../infra/observability/tracing.js';
import type { CreateConsultationRequest } from './booking-contracts.js';
import type { BookingRepository } from './booking-repository.js';

export class BookingService {
  public constructor(
    private readonly repository: BookingRepository,
    private readonly metrics?: ApplicationMetrics,
  ) {}

  public async create(
    principal: AuthenticatedPrincipal,
    input: CreateConsultationRequest,
    requestId: string,
    now = new Date(),
  ) {
    try {
      const booking = await withActiveSpan(
        'booking.claim_slot',
        { 'booking.mode': input.mode },
        () =>
          this.repository.createPendingBooking({
            patientId: principal.userId,
            slotId: input.slotId,
            mode: input.mode,
            requestId,
            now,
          }),
      );
      if (booking === null) {
        this.metrics?.recordBooking('unavailable');
        throw new ConflictError('SLOT_UNAVAILABLE', 'The selected slot is no longer available.');
      }
      this.metrics?.recordBooking('created');
      return booking;
    } catch (error: unknown) {
      if (!(error instanceof ConflictError)) {
        this.metrics?.recordBooking('error');
      }
      throw error;
    }
  }
}
