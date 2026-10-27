import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from '../../src/openapi/document.js';

describe('OpenAPI document', () => {
  it('documents authentication and the Stage 3 doctor, booking, and payment endpoints', () => {
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
        '/api/v1/webhooks/payments',
        '/api/v1/dev/payments/{id}/simulate',
      ]),
    );
    expect(JSON.stringify(document)).toContain('accessBearer');
    expect(JSON.stringify(document)).toContain('mfaBearer');
    expect(JSON.stringify(document)).toContain('Idempotency-Key');
    expect(JSON.stringify(document)).toContain('X-Payment-Signature');
  });
});
