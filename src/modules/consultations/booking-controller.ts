import type { RequestHandler } from 'express';

import { UnauthorizedError } from '../../common/errors/app-error.js';
import { createConsultationRequestSchema } from './booking-contracts.js';
import type { BookingService } from './booking-service.js';

export class BookingController {
  public constructor(private readonly service: BookingService) {}

  public readonly create: RequestHandler = async (request, response) => {
    if (request.auth === undefined) {
      throw new UnauthorizedError();
    }
    const booking = await this.service.create(
      request.auth,
      createConsultationRequestSchema.parse(request.body),
      request.requestId,
    );
    response.status(201).json(booking);
  };
}
