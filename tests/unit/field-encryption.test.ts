import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { FieldEncryption, parseEncryptionKeys } from '../../src/infra/crypto/field-encryption.js';

describe('FieldEncryption', () => {
  it('encrypts with random IVs and decrypts by key version', () => {
    const v1 = randomBytes(32);
    const service = new FieldEncryption(new Map([['v1', v1]]), 'v1');

    const first = service.encrypt('restricted clinical value');
    const second = service.encrypt('restricted clinical value');

    expect(first.ciphertext).not.toContain('restricted clinical value');
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(service.decrypt(first)).toBe('restricted clinical value');
  });

  it('decrypts old ciphertext after rotating the active key', () => {
    const v1 = randomBytes(32);
    const v2 = randomBytes(32);
    const oldService = new FieldEncryption(new Map([['v1', v1]]), 'v1');
    const encrypted = oldService.encrypt('patient phone');
    const rotatedService = new FieldEncryption(
      new Map([
        ['v1', v1],
        ['v2', v2],
      ]),
      'v2',
    );

    expect(rotatedService.decrypt(encrypted)).toBe('patient phone');
    expect(rotatedService.encrypt('new value').keyVersion).toBe('v2');
  });

  it('parses base64 keys and rejects the wrong key length', () => {
    const valid = randomBytes(32).toString('base64');

    expect(parseEncryptionKeys(JSON.stringify({ v1: valid })).get('v1')).toHaveLength(32);
    expect(() => new FieldEncryption(parseEncryptionKeys('{"v1":"c2hvcnQ="}'), 'v1')).toThrow(
      'exactly 32 bytes',
    );
    expect(() => parseEncryptionKeys('{"v1":"not-base64"}')).toThrow('base64');
  });
});
