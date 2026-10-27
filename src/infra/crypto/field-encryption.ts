import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface EncryptedValue {
  readonly keyVersion: string;
  readonly ciphertext: string;
}

export class FieldEncryption {
  public constructor(
    private readonly keys: ReadonlyMap<string, Buffer>,
    private readonly activeKeyVersion: string,
  ) {
    if (!keys.has(activeKeyVersion)) {
      throw new Error('The active encryption key version is not configured.');
    }

    for (const key of keys.values()) {
      if (key.length !== KEY_BYTES) {
        throw new Error('Every encryption key must contain exactly 32 bytes.');
      }
    }
  }

  public encrypt(plaintext: string): EncryptedValue {
    const key = this.getKey(this.activeKeyVersion);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      keyVersion: this.activeKeyVersion,
      ciphertext: [iv, authTag, encrypted].map((value) => value.toString('base64url')).join('.'),
    };
  }

  public decrypt(value: EncryptedValue): string {
    const parts = value.ciphertext.split('.');
    if (parts.length !== 3) {
      throw new Error('Encrypted value has an invalid format.');
    }

    const [ivEncoded, authTagEncoded, ciphertextEncoded] = parts;
    if (
      ivEncoded === undefined ||
      authTagEncoded === undefined ||
      ciphertextEncoded === undefined
    ) {
      throw new Error('Encrypted value has an invalid format.');
    }

    const iv = Buffer.from(ivEncoded, 'base64url');
    const authTag = Buffer.from(authTagEncoded, 'base64url');
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new Error('Encrypted value has invalid cryptographic parameters.');
    }

    const decipher = createDecipheriv(ALGORITHM, this.getKey(value.keyVersion), iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private getKey(version: string): Buffer {
    const key = this.keys.get(version);
    if (key === undefined) {
      throw new Error(`Encryption key version ${version} is not configured.`);
    }
    return key;
  }
}

export function parseEncryptionKeys(serializedKeys: string): ReadonlyMap<string, Buffer> {
  const parsed: unknown = JSON.parse(serializedKeys);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('ENCRYPTION_KEYS must be a JSON object.');
  }

  const keys = new Map<string, Buffer>();
  for (const [version, encodedKey] of Object.entries(parsed)) {
    if (typeof encodedKey !== 'string' || version.length === 0) {
      throw new Error('ENCRYPTION_KEYS contains an invalid key entry.');
    }
    const decodedKey = Buffer.from(encodedKey, 'base64');
    if (decodedKey.toString('base64') !== encodedKey) {
      throw new Error('ENCRYPTION_KEYS contains a non-canonical base64 key.');
    }
    keys.set(version, decodedKey);
  }

  if (keys.size === 0) {
    throw new Error('At least one encryption key must be configured.');
  }
  return keys;
}
