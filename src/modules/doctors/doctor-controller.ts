import type { RequestHandler } from 'express';

import { UnauthorizedError } from '../../common/errors/app-error.js';
import {
  createAvailabilitySlotRequestSchema,
  doctorIdParamsSchema,
  doctorSearchQuerySchema,
  slotListQuerySchema,
} from './doctor-contracts.js';
import type { DoctorService } from './doctor-service.js';

export class DoctorController {
  public constructor(private readonly service: DoctorService) {}

  public readonly search: RequestHandler = async (request, response) => {
    const doctors = await this.service.search(doctorSearchQuerySchema.parse(request.query));
    response.status(200).json({ doctors });
  };

  public readonly get: RequestHandler = async (request, response) => {
    const { id } = doctorIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.get(id));
  };

  public readonly listSlots: RequestHandler = async (request, response) => {
    const { id } = doctorIdParamsSchema.parse(request.params);
    const slots = await this.service.listSlots(id, slotListQuerySchema.parse(request.query));
    response.status(200).json({ slots });
  };

  public readonly createSlot: RequestHandler = async (request, response) => {
    if (request.auth === undefined) {
      throw new UnauthorizedError();
    }
    const slot = await this.service.createSlot(
      request.auth,
      createAvailabilitySlotRequestSchema.parse(request.body),
      request.requestId,
    );
    response.status(201).json(slot);
  };

  public readonly verify: RequestHandler = async (request, response) => {
    if (request.auth === undefined) {
      throw new UnauthorizedError();
    }
    const { id } = doctorIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.verifyDoctor(request.auth, id, request.requestId));
  };
}
