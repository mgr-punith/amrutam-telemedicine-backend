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
import { startInfrastructureHarness, type InfrastructureHarness } from './container-harness.js';

const executeFile = promisify(execFile);

describe('authentication API', () => {
  let infrastructure: InfrastructureHarness;
  let prisma: PrismaClient;
  let app: ReturnType<typeof createContainer>['app'];
  let demoMfaSecret: string;
  let cleanup = (): Promise<void> => Promise.resolve();

  beforeAll(async () => {
    infrastructure = await startInfrastructureHarness();
    cleanup = () => infrastructure.stop();
    const securityEnvironment = parseEnvironment(
      formatDevelopmentSecrets(generateDevelopmentSecrets()),
    );
    demoMfaSecret = requireEnvironmentValue(securityEnvironment, 'AMRUTAM_DEMO_MFA_SECRET');
    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '3000',
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
    cleanup = async () => {
      await prisma.$disconnect();
      await infrastructure.stop();
    };
  }, 120_000);

  afterAll(async () => {
    await cleanup();
  });

  it('registers and logs in a patient with encrypted protected fields and audit records', async () => {
    const registerResponse = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'new.patient@example.com',
        password: 'correct-horse-battery-staple',
        fullName: 'New Patient',
        phone: '+919000001234',
        dob: '1992-04-20',
        city: 'Mysuru',
        languages: ['English', 'Kannada'],
      });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body).toMatchObject({
      accessTokenExpiresInSeconds: 900,
    });
    expect(requireString(registerResponse.body, 'accessToken')).not.toHaveLength(0);
    expect(requireString(registerResponse.body, 'refreshToken')).not.toHaveLength(0);

    const patient = await prisma.user.findUnique({
      where: { email: 'new.patient@example.com' },
      include: { profile: true },
    });
    if (patient === null) {
      throw new Error('Registered patient was not persisted.');
    }
    expect(patient.profile?.phoneEnc).not.toContain('+919000001234');
    expect(patient.profile?.dobEnc).not.toContain('1992-04-20');
    expect(patient.passwordHash).not.toContain('correct-horse-battery-staple');

    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'new.patient@example.com',
      password: 'correct-horse-battery-staple',
    });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toMatchObject({ mfaRequired: false });

    const auditActions = await prisma.auditLog.findMany({
      where: { actorId: patient.id },
      select: { action: true },
    });
    expect(auditActions.map(({ action }) => action)).toEqual(
      expect.arrayContaining(['auth.registered', 'auth.login_succeeded']),
    );
  });

  it('completes doctor MFA, rotates refresh tokens, detects reuse, and logs out', async () => {
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'doctor@amrutam.local',
        password: requireEnvironmentValue(process.env, 'AMRUTAM_DEMO_PASSWORD'),
      });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toMatchObject({
      mfaRequired: true,
      mfaEnrollmentRequired: false,
    });

    const mfaToken = requireString(loginResponse.body, 'mfaToken');
    const mfaCode = new TotpService({ issuer: 'Amrutam' }).generateCode(demoMfaSecret);
    const verifyResponse = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ code: mfaCode });
    expect(verifyResponse.status).toBe(200);

    const accessToken = requireString(verifyResponse.body, 'accessToken');
    const originalRefreshToken = requireString(verifyResponse.body, 'refreshToken');
    const refreshResponse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefreshToken });
    expect(refreshResponse.status).toBe(200);
    const rotatedRefreshToken = requireString(refreshResponse.body, 'refreshToken');
    expect(rotatedRefreshToken).not.toBe(originalRefreshToken);

    const reuseResponse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefreshToken });
    expect(reuseResponse.status).toBe(401);

    const revokedFamilyResponse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotatedRefreshToken });
    expect(revokedFamilyResponse.status).toBe(401);

    const logoutResponse = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken: rotatedRefreshToken });
    expect(logoutResponse.status).toBe(204);

    const reuseAudit = await prisma.auditLog.findFirst({
      where: { action: 'auth.refresh_reuse_detected' },
    });
    expect(reuseAudit).not.toBeNull();
  });

  it('rejects unknown registration fields and serves Swagger outside production', async () => {
    const invalidResponse = await request(app).post('/api/v1/auth/register').send({
      email: 'attacker@example.com',
      password: 'correct-horse-battery-staple',
      fullName: 'Attacker',
      phone: '+919000009999',
      dob: '1990-01-01',
      role: 'ADMIN',
    });
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const docsResponse = await request(app).get('/docs/');
    expect(docsResponse.status).toBe(200);
    expect(docsResponse.text).toContain('<title>Amrutam Telemedicine API</title>');
    const schemaResponse = await request(app).get('/openapi.json');
    expect(schemaResponse.status).toBe(200);
    expect(requireString(schemaResponse.body, 'openapi')).toBe('3.1.0');
  });
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

function requireString(body: unknown, key: string): string {
  if (typeof body !== 'object' || body === null) {
    throw new Error(`Expected ${key} in the response body.`);
  }
  const record = body as Readonly<Record<string, unknown>>;
  const value = Object.entries(record).find(([candidate]) => candidate === key)?.[1];
  if (typeof value !== 'string') {
    throw new Error(`Expected ${key} in the response body.`);
  }
  return value;
}
