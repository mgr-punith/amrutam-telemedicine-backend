import { describe, expect, it } from 'vitest';

import {
  mfaVerifyRequestSchema,
  registerRequestSchema,
} from '../../src/modules/auth/auth-contracts.js';

describe('authentication contracts', () => {
  it('normalizes bounded patient registration input', () => {
    const input = registerRequestSchema.parse({
      email: 'Patient@Example.com',
      password: 'a-secure-password',
      fullName: ' Demo Patient ',
      phone: '+919000000001',
      dob: '1990-01-15',
    });

    expect(input.email).toBe('patient@example.com');
    expect(input.fullName).toBe('Demo Patient');
    expect(input.languages).toEqual([]);
  });

  it('rejects unknown fields and ambiguous MFA verification input', () => {
    expect(() =>
      registerRequestSchema.parse({
        email: 'patient@example.com',
        password: 'a-secure-password',
        fullName: 'Demo Patient',
        phone: '+919000000001',
        dob: '1990-01-15',
        role: 'ADMIN',
      }),
    ).toThrow();
    expect(() =>
      mfaVerifyRequestSchema.parse({ code: '123456', recoveryCode: 'recovery-code' }),
    ).toThrow();
  });
});
