import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/infra/logger.js';
import { HealthController } from '../../src/modules/health/health-controller.js';
import { HealthService, type ReadinessCheck } from '../../src/modules/health/health-service.js';

const errorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        requestId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

function buildApp(readinessChecks: readonly ReadinessCheck[] = []) {
  const logger = createLogger({ logLevel: 'silent' });
  const healthController = new HealthController(new HealthService(readinessChecks));

  return createApp({
    environment: { corsAllowedOrigins: ['http://localhost:3001'] },
    logger,
    healthController,
  });
}

describe('health endpoints', () => {
  it('reports the process as live and propagates a valid request ID', async () => {
    const response = await request(buildApp())
      .get('/health/live')
      .set('X-Request-Id', 'test-request-123');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'alive' });
    expect(response.headers['x-request-id']).toBe('test-request-123');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('reports ready when every injected dependency is healthy', async () => {
    const response = await request(
      buildApp([{ name: 'postgres', check: () => Promise.resolve() }]),
    ).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', checks: { postgres: 'up' } });
  });

  it('reports unavailable when an injected dependency is unhealthy', async () => {
    const response = await request(
      buildApp([{ name: 'redis', check: () => Promise.reject(new Error('unavailable')) }]),
    ).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not_ready', checks: { redis: 'down' } });
  });

  it('returns the stable error envelope for unknown routes', async () => {
    const response = await request(buildApp()).get('/does-not-exist');
    const body = errorEnvelopeSchema.parse(response.body);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('The requested resource was not found.');
  });

  it('returns a safe client error for malformed JSON', async () => {
    const response = await request(buildApp())
      .post('/health/live')
      .set('Content-Type', 'application/json')
      .send('{');
    const body = errorEnvelopeSchema.parse(response.body);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON');
    expect(body.error.message).toBe('The request body must contain valid JSON.');
  });

  it('rejects request bodies larger than 100 KB without leaking internals', async () => {
    const response = await request(buildApp())
      .post('/health/live')
      .set('Content-Type', 'application/json')
      .send({ content: 'x'.repeat(101 * 1024) });
    const body = errorEnvelopeSchema.parse(response.body);

    expect(response.status).toBe(413);
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(body.error.message).toBe('The request body exceeds the 100 KB limit.');
  });
});
