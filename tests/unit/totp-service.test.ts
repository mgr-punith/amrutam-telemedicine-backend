import { describe, expect, it } from 'vitest';

import { TotpService } from '../../src/infra/crypto/totp-service.js';

describe('TotpService', () => {
  it('generates secrets, otpauth URIs, and valid time-based codes', () => {
    const service = new TotpService({ issuer: 'Amrutam', allowedWindow: 0 });
    const secret = service.generateSecret();
    const now = new Date('2026-10-27T05:00:00.000Z');
    const code = service.generateCode(secret, now);

    expect(secret).toMatch(/^[A-Z2-7]+$/u);
    expect(service.createOtpAuthUri('doctor@example.com', secret)).toContain(
      'otpauth://totp/Amrutam%3Adoctor%40example.com',
    );
    expect(service.verifyCode(secret, code, now)).toBe(true);
    expect(service.verifyCode(secret, '000000', now)).toBe(code === '000000');
  });

  it('matches the RFC 6238 SHA-1 test vector', () => {
    const service = new TotpService({
      issuer: 'Amrutam',
      periodSeconds: 30,
      digits: 8,
      allowedWindow: 0,
    });
    const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    expect(service.generateCode(rfcSecret, new Date(59_000))).toBe('94287082');
  });
});
