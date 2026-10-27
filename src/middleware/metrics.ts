import type { RequestHandler } from 'express';

import type { ApplicationMetrics } from '../infra/observability/metrics.js';
import { normalizeHttpRoute } from '../infra/observability/http-route.js';

export function createMetricsMiddleware(metrics: ApplicationMetrics): RequestHandler {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      metrics.recordHttp({
        method: request.method,
        route: normalizeHttpRoute(request.originalUrl),
        statusCode: response.statusCode,
        durationSeconds,
      });
    });
    next();
  };
}
