import { createHash } from 'node:crypto';

import type { RequestHandler } from 'express';

import {
  AppError,
  ConflictError,
  UnauthorizedError,
  UnprocessableEntityError,
} from '../common/errors/app-error.js';
import type { IdempotencyStore } from '../modules/idempotency/idempotency-store.js';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/u;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

export function createIdempotencyMiddleware(store: IdempotencyStore): RequestHandler {
  return async (request, response, next) => {
    try {
      if (request.auth === undefined) {
        throw new UnauthorizedError();
      }
      const userId = request.auth.userId;
      const key = request.header('idempotency-key');
      if (key === undefined || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
        throw new AppError(
          400,
          'IDEMPOTENCY_KEY_REQUIRED',
          'A valid Idempotency-Key header containing 8–128 safe characters is required.',
        );
      }

      const requestHash = hashRequest({
        userId,
        method: request.method,
        path: request.originalUrl,
        body: request.body,
      });
      const now = new Date();
      const claim = await store.claim({
        userId,
        key,
        method: request.method,
        path: request.originalUrl,
        requestHash,
        now,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      });

      if (claim.kind === 'mismatch') {
        throw new UnprocessableEntityError(
          'IDEMPOTENCY_KEY_REUSED',
          'The Idempotency-Key was already used for a different request.',
        );
      }
      if (claim.kind === 'in_progress') {
        throw new ConflictError(
          'IDEMPOTENCY_IN_PROGRESS',
          'A request with this Idempotency-Key is still in progress.',
        );
      }
      if (claim.kind === 'replay') {
        response.setHeader('Idempotency-Replayed', 'true');
        response.status(claim.responseStatus).json(claim.responseBody);
        return;
      }

      const originalJson = response.json.bind(response);
      let finalized = false;
      response.json = (body: unknown) => {
        if (finalized) {
          return response;
        }
        finalized = true;
        const persistence =
          response.statusCode >= 500
            ? store.abandon({ userId, key, requestHash })
            : store.complete({
                userId,
                key,
                requestHash,
                responseStatus: response.statusCode,
                responseBody: body,
              });
        void persistence
          .then(() => {
            originalJson(body);
          })
          .catch((error: unknown) => {
            response.json = originalJson;
            void store.abandon({ userId, key, requestHash }).finally(() => {
              next(error);
            });
          });
        return response;
      };
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}

function hashRequest(input: {
  readonly userId: string;
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}): string {
  return createHash('sha256')
    .update(
      canonicalize({
        userId: input.userId,
        method: input.method.toUpperCase(),
        path: input.path,
        body: input.body,
      }),
    )
    .digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === undefined) {
    return 'null';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => {
      const entry = Object.entries(record).find(([candidate]) => candidate === key);
      return `${JSON.stringify(key)}:${canonicalize(entry?.[1])}`;
    })
    .join(',')}}`;
}

export const idempotencyInternals = { canonicalize, hashRequest };
