import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/u;

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const candidate = request.header('x-request-id');
  const requestId =
    candidate !== undefined && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();

  request.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
}
