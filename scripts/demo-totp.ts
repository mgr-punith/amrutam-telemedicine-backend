import 'dotenv/config';

import { TotpService } from '../src/infra/crypto/totp-service.js';

const secret = process.env.AMRUTAM_DEMO_MFA_SECRET;
if (secret === undefined || secret.length === 0) {
  throw new Error('Set AMRUTAM_DEMO_MFA_SECRET in your local environment before the demo.');
}

// Prints only the short-lived code. Never prints the enrollment secret or credentials.
process.stdout.write(
  `${new TotpService({ issuer: process.env.AMRUTAM_TOTP_ISSUER ?? 'Amrutam' }).generateCode(secret)}\n`,
);
