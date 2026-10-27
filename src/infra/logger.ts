import pino, { type Logger } from 'pino';

import type { Environment } from '../config/environment.js';

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
  '*.password',
  '*.token',
  '*.refreshToken',
  '*.phone',
  '*.dob',
  '*.prescription',
  '*.mfaCode',
  '*.mfaSecret',
];

export function createLogger(environment: Pick<Environment, 'logLevel'>): Logger {
  return pino({
    level: environment.logLevel,
    redact: {
      paths: REDACTED_PATHS,
      censor: '[REDACTED]',
    },
  });
}
