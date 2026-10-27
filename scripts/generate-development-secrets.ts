import { generateKeyPairSync, randomBytes } from 'node:crypto';

import { TotpService } from '../src/infra/crypto/totp-service.js';

export interface GeneratedDevelopmentSecrets {
  readonly encryptionKeys: string;
  readonly jwtPrivateKeyBase64: string;
  readonly jwtPublicKeyBase64: string;
  readonly paymentWebhookSecret: string;
  readonly demoPassword: string;
  readonly demoMfaSecret: string;
}

export function generateDevelopmentSecrets(): GeneratedDevelopmentSecrets {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  return {
    encryptionKeys: JSON.stringify({ v1: randomBytes(32).toString('base64') }),
    jwtPrivateKeyBase64: Buffer.from(privateKeyPem).toString('base64'),
    jwtPublicKeyBase64: Buffer.from(publicKeyPem).toString('base64'),
    paymentWebhookSecret: randomBytes(32).toString('base64url'),
    demoPassword: randomBytes(18).toString('base64url'),
    demoMfaSecret: new TotpService({ issuer: 'Amrutam' }).generateSecret(),
  };
}

export function formatDevelopmentSecrets(secrets: GeneratedDevelopmentSecrets): string {
  return [
    `AMRUTAM_ENCRYPTION_KEYS=${secrets.encryptionKeys}`,
    'AMRUTAM_ACTIVE_ENCRYPTION_KEY_VERSION=v1',
    `AMRUTAM_JWT_PRIVATE_KEY_BASE64=${secrets.jwtPrivateKeyBase64}`,
    `AMRUTAM_JWT_PUBLIC_KEY_BASE64=${secrets.jwtPublicKeyBase64}`,
    'AMRUTAM_JWT_KEY_ID=local-v1',
    'AMRUTAM_JWT_ISSUER=amrutam-api',
    'AMRUTAM_JWT_AUDIENCE=amrutam-clients',
    'AMRUTAM_ACCESS_TOKEN_TTL_SECONDS=900',
    'AMRUTAM_REFRESH_TOKEN_TTL_SECONDS=2592000',
    'AMRUTAM_TOTP_ISSUER=Amrutam',
    `AMRUTAM_PAYMENT_WEBHOOK_SECRET=${secrets.paymentWebhookSecret}`,
    `AMRUTAM_DEMO_PASSWORD=${secrets.demoPassword}`,
    `AMRUTAM_DEMO_MFA_SECRET=${secrets.demoMfaSecret}`,
  ].join('\n');
}

if (process.argv[1]?.endsWith('generate-development-secrets.ts') === true) {
  process.stdout.write(`${formatDevelopmentSecrets(generateDevelopmentSecrets())}\n`);
}
