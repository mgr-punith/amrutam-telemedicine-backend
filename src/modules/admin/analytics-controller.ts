import type { RequestHandler } from 'express';

import { UnauthorizedError } from '../../common/errors/app-error.js';
import type { AnalyticsService } from './analytics-service.js';

export class AnalyticsController {
  public constructor(private readonly service: AnalyticsService) {}

  public readonly getOverview: RequestHandler = async (request, response) => {
    if (request.auth === undefined) {
      throw new UnauthorizedError();
    }
    response.status(200).json(await this.service.getOverview(request.auth, request.requestId));
  };
}
