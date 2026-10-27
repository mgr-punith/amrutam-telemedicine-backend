import { describe, expect, it } from 'vitest';

import { PasswordHasher } from '../../src/infra/crypto/password-hasher.js';

describe('PasswordHasher', () => {
  it('uses Argon2id and verifies only the correct password', async () => {
    const hasher = new PasswordHasher();
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/u);
    await expect(hasher.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'wrong password')).resolves.toBe(false);
  });

  it('rejects passwords shorter than twelve characters', async () => {
    const hasher = new PasswordHasher();

    await expect(hasher.hash('too-short')).rejects.toThrow('at least 12 characters');
  });
});
