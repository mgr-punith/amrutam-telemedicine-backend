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
import { idempotencyInternals } from '../../src/middleware/idempotency.js';
import { signPaymentWebhook } from '../../src/modules/payments/payment-service.js';
import { startInfrastructureHarness, type InfrastructureHarness } from './container-harness.js';

const executeFile = promisify(execFile);
const DOCTOR_ID = '20000000-0000-4000-8000-000000000002';

describe('Stage 3 doctor, booking, idempotency, and payment flow', () => {
  let infrastructure: InfrastructureHarness;
  let prisma: PrismaClient;
  let app: ReturnType<typeof createContainer>['app'];
  let patientToken: string;
  let doctorToken: string;
  let adminToken: string;
  let webhookSecret: string;
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
    webhookSecret = requireEnvironmentValue(securityEnvironment, 'AMRUTAM_PAYMENT_WEBHOOK_SECRET');
  }, 120_000);

  afterAll(async () => {
    await cleanup();
  });

  it('searches verified doctors, lists slots, creates availability idempotently, and verifies a pending doctor', async () => {
    const searchResponse = await request(app).get(
      '/api/v1/doctors?specialization=Ayurvedic&city=Bengaluru&language=English&maxFeeMinor=75000',
    );
    expect(searchResponse.status).toBe(200);
    expect(requireArray(searchResponse.body, 'doctors')).toHaveLength(1);

    const detailResponse = await request(app).get(`/api/v1/doctors/${DOCTOR_ID}`);
    expect(detailResponse.status).toBe(200);
    expect(requireString(detailResponse.body, 'specialization')).toBe('Ayurvedic Medicine');

    const seededSlotsResponse = await request(app).get(`/api/v1/doctors/${DOCTOR_ID}/slots`);
    expect(seededSlotsResponse.status).toBe(200);
    expect(requireArray(seededSlotsResponse.body, 'slots')).toHaveLength(3);

    const slotBody = {
      startTime: '2031-02-01T10:00:00.000Z',
      endTime: '2031-02-01T10:30:00.000Z',
    };
    const createResponse = await request(app)
      .post('/api/v1/availability/slots')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', 'doctor-slot-0001')
      .send(slotBody);
    expect(createResponse.status).toBe(201);

    const replayResponse = await request(app)
      .post('/api/v1/availability/slots')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', 'doctor-slot-0001')
      .send(slotBody);
    expect(replayResponse.status).toBe(201);
    expect(replayResponse.headers['idempotency-replayed']).toBe('true');
    expect(replayResponse.body).toEqual(createResponse.body);

    const mismatchResponse = await request(app)
      .post('/api/v1/availability/slots')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', 'doctor-slot-0001')
      .send({ ...slotBody, endTime: '2031-02-01T11:00:00.000Z' });
    expect(mismatchResponse.status).toBe(422);
    expect(mismatchResponse.body).toMatchObject({
      error: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });

    const inProgressBody = {
      startTime: '2031-02-01T12:00:00.000Z',
      endTime: '2031-02-01T12:30:00.000Z',
    };
    await prisma.idempotencyKey.create({
      data: {
        userId: '10000000-0000-4000-8000-000000000002',
        key: 'doctor-slot-in-progress',
        method: 'POST',
        path: '/api/v1/availability/slots',
        requestHash: idempotencyInternals.hashRequest({
          userId: '10000000-0000-4000-8000-000000000002',
          method: 'POST',
          path: '/api/v1/availability/slots',
          body: inProgressBody,
        }),
        expiresAt: new Date('2032-01-01T00:00:00.000Z'),
      },
    });
    const inProgressResponse = await request(app)
      .post('/api/v1/availability/slots')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', 'doctor-slot-in-progress')
      .send(inProgressBody);
    expect(inProgressResponse.status).toBe(409);
    expect(inProgressResponse.body).toMatchObject({
      error: { code: 'IDEMPOTENCY_IN_PROGRESS' },
    });

    const pendingDoctorId = '21000000-0000-4000-8000-000000000009';
    await prisma.user.create({
      data: {
        id: '11000000-0000-4000-8000-000000000009',
        email: 'pending.doctor@example.com',
        passwordHash: 'not-used-in-this-test',
        role: 'DOCTOR',
        profile: { create: { fullName: 'Pending Doctor' } },
        doctor: {
          create: {
            id: pendingDoctorId,
            specialization: 'General Ayurveda',
            experienceYears: 2,
            licenseNumber: 'PENDING-LICENSE-0009',
            consultationFeeMinor: 50000,
            city: 'Mysuru',
          },
        },
      },
    });
    const verifyResponse = await request(app)
      .post(`/api/v1/admin/doctors/${pendingDoctorId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(verifyResponse.status).toBe(200);
    expect(await prisma.doctor.findUnique({ where: { id: pendingDoctorId } })).toMatchObject({
      verificationStatus: 'VERIFIED',
    });
  });

  it('allows exactly one concurrent booking winner and compensates failed payment', async () => {
    const slotId = await createBookableSlot('2031-03-01T10:00:00.000Z');
    const bookingBody = { slotId, mode: 'VIDEO' };

    const missingKeyResponse = await request(app)
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(bookingBody);
    expect(missingKeyResponse.status).toBe(400);
    expect(missingKeyResponse.body).toMatchObject({
      error: { code: 'IDEMPOTENCY_KEY_REQUIRED' },
    });
    expect(await prisma.availabilitySlot.findUnique({ where: { id: slotId } })).toMatchObject({
      status: 'AVAILABLE',
    });

    const [first, second] = await Promise.all([
      request(app)
        .post('/api/v1/consultations')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', 'concurrent-booking-a')
        .send(bookingBody),
      request(app)
        .post('/api/v1/consultations')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', 'concurrent-booking-b')
        .send(bookingBody),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const winner = first.status === 201 ? first : second;
    const winnerKey = first.status === 201 ? 'concurrent-booking-a' : 'concurrent-booking-b';
    const consultationId = requireString(winner.body, 'id');
    const payment = requireRecord(winner.body, 'payment');
    const paymentId = requireString(payment, 'id');
    const providerReference = requireString(payment, 'providerReference');

    expect(await prisma.consultation.count({ where: { slotId } })).toBe(1);
    expect(await prisma.availabilitySlot.findUnique({ where: { id: slotId } })).toMatchObject({
      status: 'HELD',
    });

    const replay = await request(app)
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', winnerKey)
      .send(bookingBody);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(requireString(replay.body, 'id')).toBe(consultationId);

    const forged = await request(app)
      .post('/api/v1/webhooks/payments')
      .set('X-Payment-Signature', '0'.repeat(64))
      .send({
        eventId: 'payment-failed-event-0001',
        providerReference,
        status: 'FAILED',
      });
    expect(forged.status).toBe(401);
    expect(await prisma.payment.findUnique({ where: { id: paymentId } })).toMatchObject({
      status: 'PENDING',
    });

    const failedEvent = {
      eventId: 'payment-failed-event-0001',
      providerReference,
      status: 'FAILED' as const,
    };
    const failedResponse = await sendSignedWebhook(failedEvent);
    expect(failedResponse.status).toBe(200);
    expect(await prisma.payment.findUnique({ where: { id: paymentId } })).toMatchObject({
      status: 'FAILED',
    });
    expect(await prisma.consultation.findUnique({ where: { id: consultationId } })).toMatchObject({
      status: 'EXPIRED',
    });
    expect(await prisma.availabilitySlot.findUnique({ where: { id: slotId } })).toMatchObject({
      status: 'AVAILABLE',
      heldUntil: null,
    });

    const [duplicateA, duplicateB] = await Promise.all([
      sendSignedWebhook(failedEvent),
      sendSignedWebhook(failedEvent),
    ]);
    expect(duplicateA.status).toBe(200);
    expect(duplicateB.status).toBe(200);
    expect([duplicateA.body, duplicateB.body]).toEqual(
      expect.arrayContaining([expect.objectContaining({ duplicate: true })]),
    );

    const mismatchedPayload = await sendSignedWebhook({
      ...failedEvent,
      status: 'SUCCEEDED',
    });
    expect(mismatchedPayload.status).toBe(409);
    expect(
      await prisma.webhookEvent.count({ where: { providerEventId: failedEvent.eventId } }),
    ).toBe(1);
  });

  it('uses the non-production simulator to confirm payment success and book the slot', async () => {
    const slotId = await createBookableSlot('2031-03-02T10:00:00.000Z');
    const bookingResponse = await request(app)
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', 'successful-booking-0001')
      .send({ slotId, mode: 'AUDIO' });
    expect(bookingResponse.status).toBe(201);
    const consultationId = requireString(bookingResponse.body, 'id');
    const payment = requireRecord(bookingResponse.body, 'payment');
    const paymentId = requireString(payment, 'id');
    const successResponse = await request(app)
      .post(`/api/v1/dev/payments/${paymentId}/simulate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', 'simulate-payment-success-0001')
      .send({ status: 'SUCCEEDED' });
    expect(successResponse.status).toBe(200);
    expect(await prisma.payment.findUnique({ where: { id: paymentId } })).toMatchObject({
      status: 'SUCCEEDED',
    });
    expect(await prisma.consultation.findUnique({ where: { id: consultationId } })).toMatchObject({
      status: 'CONFIRMED',
    });
    expect(await prisma.availabilitySlot.findUnique({ where: { id: slotId } })).toMatchObject({
      status: 'BOOKED',
      heldUntil: null,
    });

    const actions = await prisma.auditLog.findMany({
      where: { resourceId: { in: [consultationId, paymentId] } },
      select: { action: true },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining(['booking.created', 'payment.succeeded']),
    );
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

  async function createBookableSlot(startTime: string): Promise<string> {
    const start = new Date(startTime);
    const response = await request(app)
      .post('/api/v1/availability/slots')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set(
        'Idempotency-Key',
        `slot-${start.toISOString().slice(0, 10)}-${String(start.getUTCHours())}`,
      )
      .send({
        startTime,
        endTime: new Date(start.getTime() + 30 * 60 * 1_000).toISOString(),
      });
    expect(response.status).toBe(201);
    return requireString(response.body, 'id');
  }

  async function sendSignedWebhook(event: {
    readonly eventId: string;
    readonly providerReference: string;
    readonly status: 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  }) {
    const rawBody = JSON.stringify(event);
    return request(app)
      .post('/api/v1/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set('X-Payment-Signature', signPaymentWebhook(Buffer.from(rawBody), webhookSecret))
      .send(rawBody);
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
  key: 'AMRUTAM_DEMO_MFA_SECRET' | 'AMRUTAM_DEMO_PASSWORD' | 'AMRUTAM_PAYMENT_WEBHOOK_SECRET',
): string {
  const value =
    key === 'AMRUTAM_DEMO_MFA_SECRET'
      ? environment.AMRUTAM_DEMO_MFA_SECRET
      : key === 'AMRUTAM_DEMO_PASSWORD'
        ? environment.AMRUTAM_DEMO_PASSWORD
        : environment.AMRUTAM_PAYMENT_WEBHOOK_SECRET;
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

function requireArray(body: unknown, key: string): readonly unknown[] {
  const value = findValue(body, key);
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${key} to be an array.`);
  }
  return value;
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
