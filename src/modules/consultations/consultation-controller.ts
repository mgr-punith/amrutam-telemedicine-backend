import type { RequestHandler } from 'express';

import { UnauthorizedError } from '../../common/errors/app-error.js';
import {
  cancelConsultationRequestSchema,
  consultationIdParamsSchema,
} from './consultation-contracts.js';
import type { ConsultationService } from './consultation-service.js';

export class ConsultationController {
  public constructor(private readonly service: ConsultationService) {}

  public readonly get: RequestHandler = async (request, response) => {
    const principal = requirePrincipal(request);
    const { id } = consultationIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.get(principal, id));
  };

  public readonly start: RequestHandler = async (request, response) => {
    const principal = requirePrincipal(request);
    const { id } = consultationIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.start(principal, id, request.requestId));
  };

  public readonly complete: RequestHandler = async (request, response) => {
    const principal = requirePrincipal(request);
    const { id } = consultationIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.complete(principal, id, request.requestId));
  };

  public readonly cancel: RequestHandler = async (request, response) => {
    const principal = requirePrincipal(request);
    const { id } = consultationIdParamsSchema.parse(request.params);
    response
      .status(200)
      .json(
        await this.service.cancel(
          principal,
          id,
          cancelConsultationRequestSchema.parse(request.body),
          request.requestId,
        ),
      );
  };
}

function requirePrincipal(request: Express.Request) {
  if (request.auth === undefined) {
    throw new UnauthorizedError();
  }
  return request.auth;
}
