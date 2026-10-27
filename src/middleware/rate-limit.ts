import type { RequestHandler } from 'express';

import { TooManyRequestsError } from '../common/errors/app-error.js';

export interface RateLimitOptions {
  readonly windowMs: number;
  readonly limit: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const entries = new Map<string, RateLimitEntry>();

  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const current = entries.get(key);
    const entry =
      current === undefined || current.resetAt <= now
        ? { count: 0, resetAt: now + options.windowMs }
        : current;
    entry.count += 1;
    entries.set(key, entry);

    const remaining = Math.max(0, options.limit - entry.count);
    response.setHeader('RateLimit-Limit', String(options.limit));
    response.setHeader('RateLimit-Remaining', String(remaining));
    response.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1_000)));

    if (entry.count > options.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1_000));
      response.setHeader('Retry-After', String(retryAfterSeconds));
      next(new TooManyRequestsError(retryAfterSeconds));
      return;
    }
    next();
  };
}
