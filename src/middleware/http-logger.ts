import { context, trace } from '@opentelemetry/api';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

import { normalizeHttpRoute } from '../infra/observability/http-route.js';

export function createHttpLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    quietReqLogger: true,
    quietResLogger: true,
    genReqId: (request) => request.requestId,
    customProps: () => {
      const span = trace.getSpan(context.active())?.spanContext();
      return span === undefined ? {} : { traceId: span.traceId, spanId: span.spanId };
    },
    customSuccessObject: (request, response, value: unknown) => ({
      requestId: request.requestId,
      method: request.method,
      route: normalizeHttpRoute(originalUrl(request)),
      statusCode: response.statusCode,
      durationMs: responseDuration(value),
    }),
    customErrorObject: (request, response, _error, value: unknown) => ({
      requestId: request.requestId,
      method: request.method,
      route: normalizeHttpRoute(originalUrl(request)),
      statusCode: response.statusCode,
      durationMs: responseDuration(value),
      errorType: 'HttpRequestError',
    }),
  });
}

function originalUrl(request: { url?: string }): string | undefined {
  return 'originalUrl' in request && typeof request.originalUrl === 'string'
    ? request.originalUrl
    : request.url;
}

function responseDuration(value: unknown): number | undefined {
  if (typeof value === 'object' && value !== null && 'responseTime' in value) {
    const duration = value.responseTime;
    if (typeof duration === 'number' && Number.isFinite(duration)) return duration;
  }
  return undefined;
}
