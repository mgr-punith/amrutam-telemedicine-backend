import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

describe('Stage 4 consultation, prescription, audit, and analytics flow', () => {
  let infrastructure: InfrastructureHarness;
  let prisma: PrismaClient;
  let app: ReturnType<typeof createContainer>['app'];
  let patientToken: string;
  let outsiderToken: string;
  let doctorToken: string;
  let adminToken: string;
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

    patientToken = await login('patient@amrutam.local');
    doctorToken = await login('doctor@amrutam.local', true);
    adminToken = await login('admin@amrutam.local', true);
    outsiderToken = requireString(
      (
        await request(app).post('/api/v1/auth/register').send({
          email: 'outside.patient@example.com',
          password: 'OutsidePatient!2031',
          fullName: 'Outside Patient',
          phone: '+919123456780',
          dob: '1991-02-03',
        })
      ).body,
      'accessToken',
    );
  }, 120_000);

  afterAll(async () => {
    await cleanup();
  });

  it('enforces ownership, completes the lifecycle, stores ciphertext, and audits prescription reads', async () => {
    const booking = await createConfirmedConsultation('2031-04-01T10:00:00.000Z', 'stage4-flow');

    const ownerRead = await request(app)
      .get(`/api/v1/consultations/${booking.consultationId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body).toMatchObject({ status: 'CONFIRMED' });

    const idorRead = await request(app)
      .get(`/api/v1/consultations/${booking.consultationId}`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(idorRead.status).toBe(403);

    const adminRead = await request(app)
      .get(`/api/v1/consultations/${booking.consultationId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRead.status).toBe(403);

    const patientStart = await request(app)
      .post(`/api/v1/consultations/${booking.consultationId}/start`)
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', 'stage4-patient-start')
      .send({});
    expect(patientStart.status).toBe(403);

    const start = await request(app)
      .post(`/api/v1/consultations/${booking.consultationId}/start`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', 'stage4-doctor-start')
      .send({});
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({ status: 'IN_PROGRESS' });

    const complete = await request(app)
      .post(`/api/v1/consultations/${booking.consultationId}/complete`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', 'stage4-doctor-complete')
      .send({});
    expect(complete.status).toBe(200);
    expect(complete.body).toMatchObject({ status: 'COMPLETED' });

    const content = 'Ashwagandha tablet: one dose after dinner for seven days.';
    const createPrescription = await request(app)
      .post(`/api/v1/consultations/${booking.consultationId}/prescriptions`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', 'stage4-prescription-create')
      .send({ content });
    expect(createPrescription.status).toBe(201);
    expect(createPrescription.body).not.toHaveProperty('content');
    expect(createPrescription.body).toMatchObject({ version: 1 });
    const storedIdempotency = await prisma.idempotencyKey.findUniqueOrThrow({
      where: {
        userId_key: {
          userId: '10000000-0000-4000-8000-000000000002',
          key: 'stage4-prescription-create',
        },
      },
    });
    expect(JSON.stringify(storedIdempotency.responseBody)).not.toContain(content);

    const revisedContent = 'Ashwagandha tablet: one dose after dinner for five days.';
    const createRevisedPrescription = await request(app)
      .post(`/api/v1/consultations/${booking.consultationId}/prescriptions`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', 'stage4-prescription-create-v2')
      .send({ content: revisedContent });
    expect(createRevisedPrescription.status).toBe(201);
    expect(createRevisedPrescription.body).toMatchObject({ version: 2 });

    const storedPrescriptions = await prisma.prescription.findMany({
      where: { consultationId: booking.consultationId },
      orderBy: { version: 'asc' },
    });
    expect(storedPrescriptions).toHaveLength(2);
    expect(storedPrescriptions[0]?.contentEnc).not.toContain(content);
    expect(storedPrescriptions[0]?.contentEnc).not.toBe(content);
    expect(storedPrescriptions[0]?.encKeyVersion).not.toHaveLength(0);
    expect(storedPrescriptions[1]?.contentEnc).not.toContain(revisedContent);

    const patientRead = await request(app)
      .get(`/api/v1/consultations/${booking.consultationId}/prescriptions`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patientRead.status).toBe(200);
    expect(patientRead.body).toEqual({
      prescriptions: [
        expect.objectContaining({ version: 1, content }),
        expect.objectContaining({ version: 2, content: revisedContent }),
      ],
    });

    const outsiderRead = await request(app)
      .get(`/api/v1/consultations/${booking.consultationId}/prescriptions`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(outsiderRead.status).toBe(403);

    const adminPrescriptionRead = await request(app)
      .get(`/api/v1/consultations/${booking.consultationId}/prescriptions`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminPrescriptionRead.status).toBe(403);

    const actions = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'consultation.started',
            'consultation.completed',
            'prescription.created',
            'prescription.read',
          ],
        },
      },
      select: { action: true, metadata: true },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'consultation.started',
        'consultation.completed',
        'prescription.created',
        'prescription.read',
      ]),
    );
    expect(JSON.stringify(actions)).not.toContain(content);
  });

  it('cancels pending and paid consultations with atomic slot/payment compensation', async () => {
    const pendingSlotId = await createBookableSlot('2031-04-02T10:00:00.000Z', 'pending-cancel');
    const pendingBooking = await createBooking(pendingSlotId, 'pending-cancel');
    const pendingCancel = await request(app)
      .post(`/api/v1/consultations/${pendingBooking.consultationId}/cancel`)
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'PATIENT_REQUEST' });
    expect(pendingCancel.status).toBe(200);
    expect(pendingCancel.body).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'PATIENT_REQUEST',
    });
    expect(
      await prisma.payment.findUnique({ where: { id: pendingBooking.paymentId } }),
    ).toMatchObject({
      status: 'EXPIRED',
    });
    expect(
      await prisma.availabilitySlot.findUnique({ where: { id: pendingSlotId } }),
    ).toMatchObject({
      status: 'AVAILABLE',
      heldUntil: null,
    });

    const confirmed = await createConfirmedConsultation(
      '2031-04-03T10:00:00.000Z',
      'confirmed-cancel',
    );
    const confirmedCancel = await request(app)
      .post(`/api/v1/consultations/${confirmed.consultationId}/cancel`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', 'stage4-confirmed-cancel')
      .send({ reason: 'DOCTOR_UNAVAILABLE' });
    expect(confirmedCancel.status).toBe(200);
    expect(await prisma.payment.findUnique({ where: { id: confirmed.paymentId } })).toMatchObject({
      status: 'REFUNDED',
    });
    expect(
      await prisma.availabilitySlot.findUnique({ where: { id: confirmed.slotId } }),
    ).toMatchObject({
      status: 'AVAILABLE',
      heldUntil: null,
    });
  });

  it('returns aggregate-only admin analytics and audits access', async () => {
    const patientResponse = await request(app)
      .get('/api/v1/admin/analytics/overview')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patientResponse.status).toBe(403);

    const response = await request(app)
      .get('/api/v1/admin/analytics/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      users: { total: 4, patients: 2, doctors: 1, admins: 1 },
      doctorProfiles: { total: 1, verified: 1 },
      prescriptions: { total: 2 },
    });
    expect(JSON.stringify(response.body)).not.toContain('patient@amrutam.local');
    expect(JSON.stringify(response.body)).not.toContain('Ashwagandha');
    expect(await prisma.auditLog.count({ where: { action: 'admin.analytics.viewed' } })).toBe(1);
  });

  async function createConfirmedConsultation(startTime: string, keyPrefix: string) {
    const slotId = await createBookableSlot(startTime, keyPrefix);
    const booking = await createBooking(slotId, keyPrefix);
    const paymentResponse = await request(app)
      .post(`/api/v1/dev/payments/${booking.paymentId}/simulate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `${keyPrefix}-payment-success`)
      .send({ status: 'SUCCEEDED' });
    expect(paymentResponse.status).toBe(200);
    return { ...booking, slotId };
  }

  async function createBooking(slotId: string, keyPrefix: string) {
    const response = await request(app)
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', `${keyPrefix}-booking`)
      .send({ slotId, mode: 'VIDEO' });
    expect(response.status).toBe(201);
    return {
      consultationId: requireString(response.body, 'id'),
      paymentId: requireString(requireRecord(response.body, 'payment'), 'id'),
    };
  }

  async function createBookableSlot(startTime: string, keyPrefix: string): Promise<string> {
    const start = new Date(startTime);
    const response = await request(app)
      .post('/api/v1/availability/slots')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', `${keyPrefix}-slot`)
      .send({
        startTime,
        endTime: new Date(start.getTime() + 30 * 60 * 1_000).toISOString(),
      });
    expect(response.status).toBe(201);
    return requireString(response.body, 'id');
  }

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
