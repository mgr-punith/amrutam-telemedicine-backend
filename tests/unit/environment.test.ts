import { describe, expect, it } from 'vitest';

import { loadEnvironment } from '../../src/config/environment.js';

const validEnvironment = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'silent',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001,http://localhost:3002',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/amrutam',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadEnvironment', () => {
  it('parses and normalizes the environment', () => {
    const environment = loadEnvironment(validEnvironment);

    expect(environment.port).toBe(3000);
    expect(environment.metricsPort).toBe(9100);
    expect(environment.corsAllowedOrigins).toEqual([
      'http://localhost:3001',
      'http://localhost:3002',
    ]);
  });

  it('fails fast when required configuration is missing', () => {
    expect(() => loadEnvironment({ NODE_ENV: 'test' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('rejects unknown application-prefixed configuration keys', () => {
    expect(() => loadEnvironment({ ...validEnvironment, AMRUTAM_UNKNOWN: 'nope' })).toThrow(
      'Invalid environment configuration',
    );
  });
});
