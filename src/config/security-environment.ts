import { createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { parseEncryptionKeys } from '../infra/crypto/field-encryption.js';

const securityEnvironmentSchema = z
  .object({
    AMRUTAM_ENCRYPTION_KEYS: z.string().min(1),
    AMRUTAM_ACTIVE_ENCRYPTION_KEY_VERSION: z.string().min(1),
    AMRUTAM_JWT_PRIVATE_KEY_BASE64: z.string().min(1),
    AMRUTAM_JWT_PUBLIC_KEY_BASE64: z.string().min(1),
    AMRUTAM_JWT_KEY_ID: z.string().min(1),
    AMRUTAM_JWT_ISSUER: z.string().min(1),
    AMRUTAM_JWT_AUDIENCE: z.string().min(1),
    AMRUTAM_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600),
    AMRUTAM_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(86_400).max(7_776_000),
    AMRUTAM_TOTP_ISSUER: z.string().min(1),
    AMRUTAM_PAYMENT_WEBHOOK_SECRET: z.string().min(32),
  })
  .strict();

const SECURITY_KEYS = new Set(Object.keys(securityEnvironmentSchema.shape));

export interface SecurityEnvironment {
  readonly encryptionKeys: ReadonlyMap<string, Buffer>;
  readonly activeEncryptionKeyVersion: string;
  readonly jwtPrivateKeyPem: string;
  readonly jwtPublicKeyPem: string;
  readonly jwtKeyId: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  readonly totpIssuer: string;
  readonly paymentWebhookSecret: string;
}

export function loadSecurityEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): SecurityEnvironment {
  const selected = Object.fromEntries(
    Object.entries(source).filter(([key]) => SECURITY_KEYS.has(key)),
  );
  const parsed = securityEnvironmentSchema.safeParse(selected);
  if (!parsed.success) {
    throw new Error(`Invalid security configuration:\n${z.prettifyError(parsed.error)}`);
  }

  const encryptionKeys = parseEncryptionKeys(parsed.data.AMRUTAM_ENCRYPTION_KEYS);
  if (!encryptionKeys.has(parsed.data.AMRUTAM_ACTIVE_ENCRYPTION_KEY_VERSION)) {
    throw new Error('The active encryption key version is not configured.');
  }

  const jwtPrivateKeyPem = decodeCanonicalBase64(
    parsed.data.AMRUTAM_JWT_PRIVATE_KEY_BASE64,
    'JWT private key',
  );
  const jwtPublicKeyPem = decodeCanonicalBase64(
    parsed.data.AMRUTAM_JWT_PUBLIC_KEY_BASE64,
    'JWT public key',
  );
  const privateKey = createPrivateKey(jwtPrivateKeyPem);
  const configuredPublicKey = createPublicKey(jwtPublicKeyPem);
  const derivedPublicKey = createPublicKey(privateKey);
  const configuredPublicDer = configuredPublicKey.export({ type: 'spki', format: 'der' });
  const derivedPublicDer = derivedPublicKey.export({ type: 'spki', format: 'der' });
  if (
    configuredPublicDer.length !== derivedPublicDer.length ||
    !timingSafeEqual(configuredPublicDer, derivedPublicDer)
  ) {
    throw new Error('The JWT private and public keys do not form a matching key pair.');
  }

  return {
    encryptionKeys,
    activeEncryptionKeyVersion: parsed.data.AMRUTAM_ACTIVE_ENCRYPTION_KEY_VERSION,
    jwtPrivateKeyPem,
    jwtPublicKeyPem,
    jwtKeyId: parsed.data.AMRUTAM_JWT_KEY_ID,
    jwtIssuer: parsed.data.AMRUTAM_JWT_ISSUER,
    jwtAudience: parsed.data.AMRUTAM_JWT_AUDIENCE,
    accessTokenTtlSeconds: parsed.data.AMRUTAM_ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: parsed.data.AMRUTAM_REFRESH_TOKEN_TTL_SECONDS,
    totpIssuer: parsed.data.AMRUTAM_TOTP_ISSUER,
    paymentWebhookSecret: parsed.data.AMRUTAM_PAYMENT_WEBHOOK_SECRET,
  };
}

function decodeCanonicalBase64(value: string, name: string): string {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error(`${name} must use canonical base64 encoding.`);
  }
  return decoded.toString('utf8');
}
