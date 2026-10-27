import type { RequestHandler } from 'express';

import type { HealthService } from './health-service.js';

export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  public readonly live: RequestHandler = (_request, response) => {
    response.status(200).json(this.healthService.liveness());
  };

  public readonly ready: RequestHandler = async (_request, response) => {
    const readiness = await this.healthService.readiness();
    response.status(readiness.status === 'ready' ? 200 : 503).json(readiness);
  };
}
