import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

export function createHttpLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (request) => request.requestId,
    customProps: (request) => ({
      requestId: request.requestId,
    }),
  });
}
