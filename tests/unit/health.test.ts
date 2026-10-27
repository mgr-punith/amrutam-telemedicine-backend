import { describe, expect, it } from 'vitest';

import { HealthService } from '../../src/modules/health/health-service.js';

describe('HealthService', () => {
  it('reports the process as alive', () => {
    const service = new HealthService([]);

    expect(service.liveness()).toEqual({ status: 'alive' });
  });

  it('reports ready when every dependency check succeeds', async () => {
    const service = new HealthService([
      { name: 'postgres', check: () => Promise.resolve() },
      { name: 'redis', check: () => Promise.resolve() },
    ]);

    await expect(service.readiness()).resolves.toEqual({
      status: 'ready',
      checks: { postgres: 'up', redis: 'up' },
    });
  });

  it('reports not ready without exposing dependency errors', async () => {
    const service = new HealthService([
      { name: 'postgres', check: () => Promise.resolve() },
      { name: 'redis', check: () => Promise.reject(new Error('connection details')) },
    ]);

    await expect(service.readiness()).resolves.toEqual({
      status: 'not_ready',
      checks: { postgres: 'up', redis: 'down' },
    });
  });
});
