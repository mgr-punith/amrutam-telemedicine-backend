import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

import { normalizeHttpRoute } from '../infra/observability/http-route.js';

export function createHttpLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (request) => request.requestId,
    customProps: (request) => ({
      requestId: request.requestId,
    }),
    customSuccessObject: (request, response) => ({
      requestId: request.requestId,
      method: request.method,
      route: normalizeHttpRoute(request.url),
      statusCode: response.statusCode,
    }),
    customErrorObject: (request, response, error) => ({
      requestId: request.requestId,
      method: request.method,
      route: normalizeHttpRoute(request.url),
      statusCode: response.statusCode,
      err: error,
    }),
  });
}
