import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from '../../src/openapi/document.js';

describe('OpenAPI document', () => {
  it('documents every Stage 2 authentication endpoint and bearer scheme', () => {
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
      ]),
    );
    expect(JSON.stringify(document)).toContain('accessBearer');
    expect(JSON.stringify(document)).toContain('mfaBearer');
  });
});
