import type { RequestHandler } from 'express';

import { UnauthorizedError } from '../../common/errors/app-error.js';
import { consultationIdParamsSchema } from '../consultations/consultation-contracts.js';
import { createPrescriptionRequestSchema } from './prescription-contracts.js';
import type { PrescriptionService } from './prescription-service.js';

export class PrescriptionController {
  public constructor(private readonly service: PrescriptionService) {}

  public readonly create: RequestHandler = async (request, response) => {
    const principal = requirePrincipal(request);
    const { id } = consultationIdParamsSchema.parse(request.params);
    response
      .status(201)
      .json(
        await this.service.create(
          principal,
          id,
          createPrescriptionRequestSchema.parse(request.body),
          request.requestId,
        ),
      );
  };

  public readonly list: RequestHandler = async (request, response) => {
    const principal = requirePrincipal(request);
    const { id } = consultationIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.list(principal, id, request.requestId));
  };
}

function requirePrincipal(request: Express.Request) {
  if (request.auth === undefined) {
    throw new UnauthorizedError();
  }
  return request.auth;
}
