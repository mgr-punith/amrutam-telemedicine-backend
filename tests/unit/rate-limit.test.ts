import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createRateLimit } from '../../src/middleware/rate-limit.js';

describe('createRateLimit', () => {
  it('blocks requests beyond the configured limit', () => {
    const middleware = createRateLimit({ windowMs: 60_000, limit: 2 });
    const request = { ip: '127.0.0.1', socket: {} } as Request;
    const response = { setHeader: vi.fn() } as unknown as Response;
    const next = vi.fn();

    middleware(request, response, next as NextFunction);
    middleware(request, response, next as NextFunction);
    middleware(request, response, next as NextFunction);

    expect(next.mock.calls[0]?.[0]).toBeUndefined();
    expect(next.mock.calls[1]?.[0]).toBeUndefined();
    expect(next.mock.calls[2]?.[0]).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
