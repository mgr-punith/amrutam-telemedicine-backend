import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  formatDevelopmentSecrets,
  generateDevelopmentSecrets,
} from '../../scripts/generate-development-secrets.js';
import { createContainer } from '../../src/container.js';
import { TotpService } from '../../src/infra/crypto/totp-service.js';
import { ExpiredHoldService } from '../../src/worker/expired-hold-service.js';
import { PrismaExpiredHoldRepository } from '../../src/worker/prisma-expired-hold-repository.js';
import { startInfrastructureHarness, type InfrastructureHarness } from './container-harness.js';

const executeFile = promisify(execFile);

describe('Stage 5 observability and worker compensation', () => {
  let infrastructure: InfrastructureHarness;
  let prisma: PrismaClient;
  let app: ReturnType<typeof createContainer>['app'];
  let metrics: ReturnType<typeof createContainer>['metrics'];
  let patientToken: string;
  let doctorToken: string;
  let cleanup = (): Promise<void> => Promise.resolve();

  beforeAll(async () => {
    infrastructure = await startInfrastructureHarness();
    cleanup = () => infrastructure.stop();
    const securityEnvironment = parseEnvironment(
      formatDevelopmentSecrets(generateDevelopmentSecrets()),
    );
    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '3000',
      METRICS_PORT: '9100',
      LOG_LEVEL: 'silent',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
      DATABASE_URL: infrastructure.databaseUrl,
      REDIS_URL: infrastructure.redisUrl,
      ...securityEnvironment,
    });
    await runNpmScript('db:migrate');
    await runNpmScript('db:seed');
    const container = createContainer({ readinessChecks: [] });
    app = container.app;
    prisma = container.prisma;
    metrics = container.metrics;
    cleanup = async () => {
      await prisma.$disconnect();
      await infrastructure.stop();
    };

    patientToken = await login('patient@amrutam.local');
    doctorToken = await login('doctor@amrutam.local', true);
  }, 120_000);

  afterAll(async () => {
    await cleanup();
  });

  it('atomically expires abandoned holds and exposes safe Prometheus proof', async () => {
    const slotResponse = await request(app)
      .post('/api/v1/availability/slots')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', 'stage5-expiry-slot')
      .send({
        startTime: '2031-05-01T10:00:00.000Z',
        endTime: '2031-05-01T10:30:00.000Z',
      });
    expect(slotResponse.status).toBe(201);
    const slotId = requireString(slotResponse.body, 'id');

    const bookingResponse = await request(app)
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', 'stage5-expiry-booking')
      .send({ slotId, mode: 'VIDEO' });
    expect(bookingResponse.status).toBe(201);
    const consultationId = requireString(bookingResponse.body, 'id');
    const paymentId = requireString(requireRecord(bookingResponse.body, 'payment'), 'id');

    const expiredAt = new Date('2030-01-01T00:00:00.000Z');
    await prisma.availabilitySlot.update({
      where: { id: slotId },
      data: { heldUntil: expiredAt },
    });
    const service = new ExpiredHoldService(new PrismaExpiredHoldRepository(prisma), metrics);
    await expect(service.scan(new Date('2030-01-01T00:01:00.000Z'))).resolves.toBe(1);

    expect(await prisma.consultation.findUnique({ where: { id: consultationId } })).toMatchObject({
      status: 'EXPIRED',
    });
    expect(await prisma.payment.findUnique({ where: { id: paymentId } })).toMatchObject({
      status: 'EXPIRED',
    });
    expect(await prisma.availabilitySlot.findUnique({ where: { id: slotId } })).toMatchObject({
      status: 'AVAILABLE',
      heldUntil: null,
    });
    expect(
      await prisma.auditLog.count({
        where: { action: 'booking.hold_expired', resourceId: consultationId },
      }),
    ).toBe(1);

    const metricsOutput = await metrics.registry.metrics();
    expect(metricsOutput).toContain('amrutam_expired_holds_total');
    expect(metricsOutput).toContain('amrutam_booking_attempts_total');
    expect(metricsOutput).toContain('/api/v1/consultations');
    expect(metricsOutput).not.toContain(consultationId);
    expect(metricsOutput).not.toContain(paymentId);
  });

  async function login(email: string, requiresMfa = false): Promise<string> {
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email,
        password: requireEnvironmentValue(process.env, 'AMRUTAM_DEMO_PASSWORD'),
      });
    expect(loginResponse.status).toBe(200);
    if (!requiresMfa) {
      return requireString(loginResponse.body, 'accessToken');
    }
    const mfaCode = new TotpService({ issuer: 'Amrutam' }).generateCode(
      requireEnvironmentValue(process.env, 'AMRUTAM_DEMO_MFA_SECRET'),
    );
    const verifyResponse = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${requireString(loginResponse.body, 'mfaToken')}`)
      .send({ code: mfaCode });
    expect(verifyResponse.status).toBe(200);
    return requireString(verifyResponse.body, 'accessToken');
  }
});

async function runNpmScript(script: 'db:migrate' | 'db:seed'): Promise<void> {
  await executeFile('npm', ['run', script], {
    cwd: process.cwd(),
    env: process.env,
    timeout: 60_000,
  });
}

function parseEnvironment(output: string): NodeJS.ProcessEnv {
  return Object.fromEntries(
    output.split('\n').map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
  );
}

function requireEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  key: 'AMRUTAM_DEMO_MFA_SECRET' | 'AMRUTAM_DEMO_PASSWORD',
): string {
  const value =
    key === 'AMRUTAM_DEMO_MFA_SECRET'
      ? environment.AMRUTAM_DEMO_MFA_SECRET
      : environment.AMRUTAM_DEMO_PASSWORD;
  if (value === undefined) {
    throw new Error(`${key} is missing from the test environment.`);
  }
  return value;
}

function requireRecord(body: unknown, key: string): Readonly<Record<string, unknown>> {
  const value = findValue(body, key);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${key} to be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireString(body: unknown, key: string): string {
  const value = findValue(body, key);
  if (typeof value !== 'string') {
    throw new Error(`Expected ${key} to be a string.`);
  }
  return value;
}

function findValue(body: unknown, key: string): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error(`Expected an object containing ${key}.`);
  }
  return Object.entries(body).find(([candidate]) => candidate === key)?.[1];
}
