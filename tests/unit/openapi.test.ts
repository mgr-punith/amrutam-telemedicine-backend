import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from '../../src/openapi/document.js';

describe('OpenAPI document', () => {
  it('documents all 22 assignment business endpoints plus health checks', () => {
    const document = createOpenApiDocument();
    const paths = document.paths as Readonly<Record<string, unknown>>;

    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/auth/mfa/enroll',
        '/api/v1/auth/mfa/activate',
        '/api/v1/auth/mfa/verify',
        '/api/v1/auth/refresh',
        '/api/v1/auth/logout',
        '/api/v1/doctors',
        '/api/v1/doctors/{id}',
        '/api/v1/doctors/{id}/slots',
        '/api/v1/availability/slots',
        '/api/v1/admin/doctors/{id}/verify',
        '/api/v1/consultations',
        '/api/v1/consultations/{id}',
        '/api/v1/consultations/{id}/start',
        '/api/v1/consultations/{id}/complete',
        '/api/v1/consultations/{id}/cancel',
        '/api/v1/consultations/{id}/prescriptions',
        '/api/v1/webhooks/payments',
        '/api/v1/dev/payments/{id}/simulate',
        '/api/v1/admin/analytics/overview',
      ]),
    );
    const businessOperationCount = Object.entries(paths)
      .filter(([path]) => path.startsWith('/api/v1/'))
      .reduce((count, [, pathItem]) => {
        if (typeof pathItem !== 'object' || pathItem === null) {
          return count;
        }
        return (
          count +
          Object.keys(pathItem).filter((method) =>
            ['get', 'post', 'put', 'patch', 'delete'].includes(method),
          ).length
        );
      }, 0);
    expect(businessOperationCount).toBe(22);
    expect(JSON.stringify(document)).toContain('accessBearer');
    expect(JSON.stringify(document)).toContain('mfaBearer');
    expect(JSON.stringify(document)).toContain('Idempotency-Key');
    expect(JSON.stringify(document)).toContain('X-Payment-Signature');
  });
});
