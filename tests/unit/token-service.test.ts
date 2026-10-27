import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createOpaqueToken,
  hashOpaqueToken,
  opaqueTokenMatches,
  TokenService,
} from '../../src/infra/crypto/token-service.js';

function buildTokenService(): TokenService {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return new TokenService({
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    keyId: 'test-key',
    issuer: 'amrutam-api',
    audience: 'amrutam-clients',
    accessTokenTtlSeconds: 900,
  });
}

describe('TokenService', () => {
  it('issues and verifies an algorithm-pinned access token', () => {
    const service = buildTokenService();
    const now = new Date('2026-10-27T05:00:00.000Z');
    const token = service.issueAccessToken('user-1', 'PATIENT', 'access', now);
    const claims = service.verifyAccessToken(token, new Date('2026-10-27T05:05:00.000Z'));

    expect(claims).toMatchObject({
      sub: 'user-1',
      role: 'PATIENT',
      scope: 'access',
      iss: 'amrutam-api',
      aud: 'amrutam-clients',
    });
  });

  it('rejects expired or modified tokens', () => {
    const service = buildTokenService();
    const now = new Date('2026-10-27T05:00:00.000Z');
    const token = service.issueAccessToken('user-1', 'DOCTOR', 'mfa', now);
    const [header, payload, signature] = splitToken(token);
    const modifiedSignature = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;

    expect(() => service.verifyAccessToken(token, new Date('2026-10-27T06:00:00.000Z'))).toThrow(
      'expired',
    );
    expect(() =>
      service.verifyAccessToken(`${header}.${payload}.${modifiedSignature}`, now),
    ).toThrow('signature');
  });

  it('rejects non-canonical base64url token segments', () => {
    const service = buildTokenService();
    const token = service.issueAccessToken('user-1', 'PATIENT');
    const [header, payload, signature] = splitToken(token);

    expect(() =>
      service.verifyAccessToken(`${header}.${payload}.${signature}=`, new Date()),
    ).toThrow('base64url');
  });

  it('creates opaque refresh tokens that are compared by hash', () => {
    const token = createOpaqueToken();
    const hash = hashOpaqueToken(token);

    expect(token).not.toBe(hash);
    expect(opaqueTokenMatches(token, hash)).toBe(true);
    expect(opaqueTokenMatches(`${token}x`, hash)).toBe(false);
    expect(opaqueTokenMatches(token, 'not-a-sha256-hash')).toBe(false);
  });
});

function splitToken(token: string): readonly [string, string, string] {
  const segments = token.split('.');
  const header = segments.at(0);
  const payload = segments.at(1);
  const signature = segments.at(2);
  if (
    segments.length !== 3 ||
    header === undefined ||
    payload === undefined ||
    signature === undefined
  ) {
    throw new Error('Test token is malformed.');
  }
  return [header, payload, signature];
}
