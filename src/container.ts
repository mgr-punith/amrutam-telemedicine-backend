import { createConnection } from 'node:net';

import { PrismaClient } from '@prisma/client';

import { createApp } from './app.js';
import { loadEnvironment } from './config/environment.js';
import { loadSecurityEnvironment } from './config/security-environment.js';
import { FieldEncryption } from './infra/crypto/field-encryption.js';
import { PasswordHasher } from './infra/crypto/password-hasher.js';
import { TokenService } from './infra/crypto/token-service.js';
import { TotpService } from './infra/crypto/totp-service.js';
import { createLogger } from './infra/logger.js';
import { createAuthenticate } from './middleware/authenticate.js';
import { requireRoles } from './middleware/authorize.js';
import { createIdempotencyMiddleware } from './middleware/idempotency.js';
import { createRateLimit } from './middleware/rate-limit.js';
import { AuthController } from './modules/auth/auth-controller.js';
import { PrismaAuthRepository } from './modules/auth/prisma-auth-repository.js';
import { AuthService } from './modules/auth/auth-service.js';
import { BookingController } from './modules/consultations/booking-controller.js';
import { PrismaBookingRepository } from './modules/consultations/prisma-booking-repository.js';
import { BookingService } from './modules/consultations/booking-service.js';
import { DoctorController } from './modules/doctors/doctor-controller.js';
import { DoctorService } from './modules/doctors/doctor-service.js';
import { PrismaDoctorRepository } from './modules/doctors/prisma-doctor-repository.js';
import { HealthController } from './modules/health/health-controller.js';
import { HealthService, type ReadinessCheck } from './modules/health/health-service.js';
import { PrismaIdempotencyStore } from './modules/idempotency/prisma-idempotency-store.js';
import { PaymentController } from './modules/payments/payment-controller.js';
import { PrismaPaymentRepository } from './modules/payments/prisma-payment-repository.js';
import { PaymentService } from './modules/payments/payment-service.js';
import { createOpenApiDocument } from './openapi/document.js';

const DEPENDENCY_CHECK_TIMEOUT_MS = 2_000;

function createTcpReadinessCheck(name: string, urlValue: string): ReadinessCheck {
  const url = new URL(urlValue);
  const defaultPort = url.protocol === 'postgresql:' ? 5432 : 6379;
  const port = url.port === '' ? defaultPort : Number(url.port);

  return {
    name,
    async check(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host: url.hostname, port });
        const onError = (error: Error): void => {
          socket.destroy();
          reject(error);
        };

        socket.setTimeout(DEPENDENCY_CHECK_TIMEOUT_MS);
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('timeout', () => {
          onError(new Error(`${name} readiness check timed out`));
        });
        socket.once('error', onError);
      });
    },
  };
}

export interface ContainerOverrides {
  readonly readinessChecks?: readonly ReadinessCheck[];
  readonly prisma?: PrismaClient;
}

export function createContainer(overrides: ContainerOverrides = {}) {
  const environment = loadEnvironment();
  const securityEnvironment = loadSecurityEnvironment();
  const logger = createLogger(environment);
  const prisma = overrides.prisma ?? new PrismaClient();
  const readinessChecks = overrides.readinessChecks ?? [
    {
      name: 'postgres',
      async check(): Promise<void> {
        await prisma.$queryRaw`SELECT 1`;
      },
    },
    createTcpReadinessCheck('redis', environment.redisUrl),
  ];
  const healthService = new HealthService(readinessChecks);
  const healthController = new HealthController(healthService);
  const encryption = new FieldEncryption(
    securityEnvironment.encryptionKeys,
    securityEnvironment.activeEncryptionKeyVersion,
  );
  const tokenService = new TokenService({
    privateKeyPem: securityEnvironment.jwtPrivateKeyPem,
    publicKeyPem: securityEnvironment.jwtPublicKeyPem,
    keyId: securityEnvironment.jwtKeyId,
    issuer: securityEnvironment.jwtIssuer,
    audience: securityEnvironment.jwtAudience,
    accessTokenTtlSeconds: securityEnvironment.accessTokenTtlSeconds,
  });
  const authRepository = new PrismaAuthRepository(prisma);
  const authService = new AuthService(
    authRepository,
    new PasswordHasher(),
    encryption,
    tokenService,
    new TotpService({ issuer: securityEnvironment.totpIssuer }),
    {
      accessTokenTtlSeconds: securityEnvironment.accessTokenTtlSeconds,
      refreshTokenTtlSeconds: securityEnvironment.refreshTokenTtlSeconds,
    },
  );
  const authController = new AuthController(authService);
  const authenticateAccess = createAuthenticate(tokenService, { scopes: ['access'] });
  const idempotency = createIdempotencyMiddleware(new PrismaIdempotencyStore(prisma));
  const doctorController = new DoctorController(
    new DoctorService(new PrismaDoctorRepository(prisma)),
  );
  const bookingController = new BookingController(
    new BookingService(new PrismaBookingRepository(prisma)),
  );
  const paymentController = new PaymentController(
    new PaymentService(
      new PrismaPaymentRepository(prisma),
      securityEnvironment.paymentWebhookSecret,
    ),
  );
  const app = createApp({
    environment,
    logger,
    healthController,
    auth: {
      controller: authController,
      authenticateAccess,
      authenticateMfa: createAuthenticate(tokenService, { scopes: ['mfa'] }),
      authenticationRateLimit: createRateLimit({ windowMs: 15 * 60 * 1_000, limit: 20 }),
    },
    doctors: {
      controller: doctorController,
      authenticateAccess,
      requireDoctor: requireRoles('DOCTOR'),
      requireAdmin: requireRoles('ADMIN'),
      idempotency,
    },
    booking: {
      controller: bookingController,
      authenticateAccess,
      requirePatient: requireRoles('PATIENT'),
      idempotency,
    },
    payments: {
      controller: paymentController,
      authenticateAccess,
      requireAdmin: requireRoles('ADMIN'),
      idempotency,
      devSimulationEnabled: environment.nodeEnv !== 'production',
    },
    openApiDocument: createOpenApiDocument(),
    docsEnabled: environment.nodeEnv !== 'production',
  });

  return { app, environment, logger, prisma } as const;
}
