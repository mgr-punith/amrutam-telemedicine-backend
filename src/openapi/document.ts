import { z } from 'zod';

import {
  loginRequestSchema,
  mfaCodeRequestSchema,
  mfaVerifyRequestSchema,
  refreshTokenRequestSchema,
  registerRequestSchema,
} from '../modules/auth/auth-contracts.js';
import { createConsultationRequestSchema } from '../modules/consultations/booking-contracts.js';
import { cancelConsultationRequestSchema } from '../modules/consultations/consultation-contracts.js';
import {
  createAvailabilitySlotRequestSchema,
  doctorSearchQuerySchema,
  slotListQuerySchema,
} from '../modules/doctors/doctor-contracts.js';
import {
  paymentWebhookRequestSchema,
  simulatePaymentRequestSchema,
} from '../modules/payments/payment-contracts.js';
import { createPrescriptionRequestSchema } from '../modules/prescriptions/prescription-contracts.js';

type OpenApiDocument = Readonly<Record<string, unknown>>;

const sessionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accessToken', 'accessTokenExpiresInSeconds', 'refreshToken', 'refreshTokenExpiresAt'],
  properties: {
    accessToken: { type: 'string' },
    accessTokenExpiresInSeconds: { type: 'integer', minimum: 60 },
    refreshToken: { type: 'string' },
    refreshTokenExpiresAt: { type: 'string', format: 'date-time' },
  },
} as const;

const errorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: true,
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        requestId: { type: 'string' },
      },
    },
  },
} as const;

export function createOpenApiDocument(): OpenApiDocument {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Amrutam Telemedicine API',
      version: '0.4.0',
      description: 'Security-first telemedicine backend demonstration API.',
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local Docker environment' }],
    tags: [
      { name: 'Health' },
      { name: 'Authentication' },
      { name: 'Doctors' },
      { name: 'Booking' },
      { name: 'Consultations' },
      { name: 'Prescriptions' },
      { name: 'Payments' },
      { name: 'Admin' },
    ],
    paths: {
      '/health/live': {
        get: {
          tags: ['Health'],
          operationId: 'getLiveness',
          responses: {
            '200': jsonResponse('Process is alive', { $ref: '#/components/schemas/Liveness' }),
          },
        },
      },
      '/health/ready': {
        get: {
          tags: ['Health'],
          operationId: 'getReadiness',
          responses: {
            '200': jsonResponse('Dependencies are ready', {
              $ref: '#/components/schemas/Readiness',
            }),
            '503': jsonResponse('A dependency is unavailable', {
              $ref: '#/components/schemas/Readiness',
            }),
          },
        },
      },
      '/api/v1/auth/register': {
        post: authMutation('registerPatient', 'Register a patient', 'RegisterRequest', {
          '201': jsonResponse('Patient registered', { $ref: '#/components/schemas/Session' }),
        }),
      },
      '/api/v1/auth/login': {
        post: authMutation('login', 'Verify password credentials', 'LoginRequest', {
          '200': jsonResponse('Session or MFA challenge issued', {
            oneOf: [
              { $ref: '#/components/schemas/LoginSession' },
              { $ref: '#/components/schemas/MfaChallenge' },
            ],
          }),
        }),
      },
      '/api/v1/auth/mfa/enroll': {
        post: protectedMutation(
          'enrollMfa',
          'Create an encrypted TOTP enrollment',
          undefined,
          {
            '200': jsonResponse('MFA enrollment created', {
              $ref: '#/components/schemas/MfaEnrollment',
            }),
          },
          'mfaBearer',
        ),
      },
      '/api/v1/auth/mfa/activate': {
        post: protectedMutation(
          'activateMfa',
          'Verify enrollment and activate MFA',
          'MfaCodeRequest',
          { '200': jsonResponse('MFA activated', { $ref: '#/components/schemas/MfaActivation' }) },
          'mfaBearer',
        ),
      },
      '/api/v1/auth/mfa/verify': {
        post: protectedMutation(
          'verifyMfa',
          'Complete login using TOTP or a recovery code',
          'MfaVerifyRequest',
          { '200': jsonResponse('MFA verified', { $ref: '#/components/schemas/Session' }) },
          'mfaBearer',
        ),
      },
      '/api/v1/auth/refresh': {
        post: authMutation(
          'refreshSession',
          'Rotate an opaque refresh token',
          'RefreshTokenRequest',
          {
            '200': jsonResponse('Refresh token rotated', { $ref: '#/components/schemas/Session' }),
          },
        ),
      },
      '/api/v1/auth/logout': {
        post: protectedMutation(
          'logout',
          'Revoke the supplied refresh token',
          'RefreshTokenRequest',
          { '204': { description: 'Logged out' } },
          'accessBearer',
        ),
      },
      '/api/v1/doctors': {
        get: {
          tags: ['Doctors'],
          operationId: 'searchDoctors',
          summary: 'Search verified doctors',
          parameters: queryParameters(doctorSearchQuerySchema),
          responses: {
            '200': jsonResponse('Verified doctors', {
              type: 'object',
              required: ['doctors'],
              properties: {
                doctors: { type: 'array', items: { $ref: '#/components/schemas/DoctorSummary' } },
              },
            }),
            '400': errorResponse('Validation failed'),
          },
        },
      },
      '/api/v1/doctors/{id}': {
        get: {
          tags: ['Doctors'],
          operationId: 'getDoctor',
          summary: 'Get a verified doctor profile',
          parameters: [pathIdParameter('Doctor ID')],
          responses: {
            '200': jsonResponse('Verified doctor', { $ref: '#/components/schemas/DoctorDetail' }),
            '404': errorResponse('Doctor not found'),
          },
        },
      },
      '/api/v1/doctors/{id}/slots': {
        get: {
          tags: ['Doctors'],
          operationId: 'listDoctorSlots',
          summary: 'List future available slots for a verified doctor',
          parameters: [pathIdParameter('Doctor ID'), ...queryParameters(slotListQuerySchema)],
          responses: {
            '200': jsonResponse('Available slots', {
              type: 'object',
              required: ['slots'],
              properties: {
                slots: { type: 'array', items: { $ref: '#/components/schemas/AvailabilitySlot' } },
              },
            }),
            '400': errorResponse('Validation failed'),
          },
        },
      },
      '/api/v1/availability/slots': {
        post: protectedMutation(
          'createAvailabilitySlot',
          'Create availability for the authenticated verified doctor',
          'CreateAvailabilitySlotRequest',
          {
            '201': jsonResponse('Availability created', {
              $ref: '#/components/schemas/AvailabilitySlot',
            }),
          },
          'accessBearer',
          { tag: 'Doctors', idempotent: true },
        ),
      },
      '/api/v1/admin/doctors/{id}/verify': {
        post: protectedMutation(
          'verifyDoctor',
          'Verify a doctor profile',
          undefined,
          {
            '200': jsonResponse('Doctor verified', {
              type: 'object',
              required: ['id', 'verificationStatus'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                verificationStatus: { const: 'VERIFIED' },
              },
            }),
          },
          'accessBearer',
          { tag: 'Admin', idempotent: true, parameters: [pathIdParameter('Doctor ID')] },
        ),
      },
      '/api/v1/consultations': {
        post: protectedMutation(
          'createConsultation',
          'Atomically claim a slot and create pending consultation/payment records',
          'CreateConsultationRequest',
          {
            '201': jsonResponse('Pending booking created', {
              $ref: '#/components/schemas/PendingBooking',
            }),
          },
          'accessBearer',
          { tag: 'Booking', idempotent: true },
        ),
      },
      '/api/v1/consultations/{id}': {
        get: protectedQuery(
          'getConsultation',
          'Get an owned or assigned consultation',
          {
            '200': jsonResponse('Consultation details', {
              $ref: '#/components/schemas/Consultation',
            }),
          },
          { tag: 'Consultations', parameters: [pathIdParameter('Consultation ID')] },
        ),
      },
      '/api/v1/consultations/{id}/start': {
        post: protectedMutation(
          'startConsultation',
          'Start a confirmed consultation as the assigned doctor',
          undefined,
          {
            '200': jsonResponse('Consultation started', {
              $ref: '#/components/schemas/Consultation',
            }),
          },
          'accessBearer',
          {
            tag: 'Consultations',
            idempotent: true,
            parameters: [pathIdParameter('Consultation ID')],
          },
        ),
      },
      '/api/v1/consultations/{id}/complete': {
        post: protectedMutation(
          'completeConsultation',
          'Complete an in-progress consultation as the assigned doctor',
          undefined,
          {
            '200': jsonResponse('Consultation completed', {
              $ref: '#/components/schemas/Consultation',
            }),
          },
          'accessBearer',
          {
            tag: 'Consultations',
            idempotent: true,
            parameters: [pathIdParameter('Consultation ID')],
          },
        ),
      },
      '/api/v1/consultations/{id}/cancel': {
        post: protectedMutation(
          'cancelConsultation',
          'Cancel a pending-payment or confirmed consultation and compensate payment/slot state',
          'CancelConsultationRequest',
          {
            '200': jsonResponse('Consultation cancelled', {
              $ref: '#/components/schemas/Consultation',
            }),
          },
          'accessBearer',
          {
            tag: 'Consultations',
            idempotent: true,
            parameters: [pathIdParameter('Consultation ID')],
          },
        ),
      },
      '/api/v1/consultations/{id}/prescriptions': {
        post: protectedMutation(
          'createPrescription',
          'Create an encrypted prescription version after completion as the assigned doctor',
          'CreatePrescriptionRequest',
          {
            '201': jsonResponse('Encrypted prescription created', {
              $ref: '#/components/schemas/PrescriptionMetadata',
            }),
          },
          'accessBearer',
          {
            tag: 'Prescriptions',
            idempotent: true,
            parameters: [pathIdParameter('Consultation ID')],
          },
        ),
        get: protectedQuery(
          'listPrescriptions',
          'Read decrypted prescriptions as the patient or assigned doctor',
          {
            '200': jsonResponse('Authorized prescription versions', {
              type: 'object',
              additionalProperties: false,
              required: ['prescriptions'],
              properties: {
                prescriptions: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Prescription' },
                },
              },
            }),
          },
          { tag: 'Prescriptions', parameters: [pathIdParameter('Consultation ID')] },
        ),
      },
      '/api/v1/webhooks/payments': {
        post: {
          tags: ['Payments'],
          operationId: 'processPaymentWebhook',
          summary: 'Process a signed mock payment event',
          parameters: [
            {
              in: 'header',
              name: 'X-Payment-Signature',
              required: true,
              schema: { type: 'string', pattern: '^[a-f0-9]{64}$' },
              description: 'Hex HMAC-SHA256 of the exact raw JSON body.',
            },
          ],
          requestBody: requestBody('PaymentWebhookRequest'),
          responses: withCommonErrors({
            '200': jsonResponse('Event accepted or safely replayed', {
              $ref: '#/components/schemas/PaymentEventResponse',
            }),
          }),
        },
      },
      '/api/v1/dev/payments/{id}/simulate': {
        post: protectedMutation(
          'simulatePayment',
          'Simulate payment result outside production',
          'SimulatePaymentRequest',
          {
            '200': jsonResponse('Payment result applied', {
              $ref: '#/components/schemas/PaymentEventResponse',
            }),
          },
          'accessBearer',
          { tag: 'Payments', idempotent: true, parameters: [pathIdParameter('Payment ID')] },
        ),
      },
      '/api/v1/admin/analytics/overview': {
        get: protectedQuery(
          'getAdminAnalyticsOverview',
          'Get aggregate-only platform analytics',
          {
            '200': jsonResponse('Aggregate analytics overview', {
              $ref: '#/components/schemas/AdminAnalyticsOverview',
            }),
          },
          { tag: 'Admin' },
        ),
      },
    },
    components: {
      securitySchemes: {
        accessBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        mfaBearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT with scope=mfa',
          description: 'Use the mfaToken returned by password login.',
        },
      },
      schemas: {
        RegisterRequest: schemaFromZod(registerRequestSchema),
        LoginRequest: schemaFromZod(loginRequestSchema),
        MfaCodeRequest: schemaFromZod(mfaCodeRequestSchema),
        MfaVerifyRequest: schemaFromZod(mfaVerifyRequestSchema),
        RefreshTokenRequest: schemaFromZod(refreshTokenRequestSchema),
        CreateAvailabilitySlotRequest: schemaFromZod(createAvailabilitySlotRequestSchema),
        CreateConsultationRequest: schemaFromZod(createConsultationRequestSchema),
        CancelConsultationRequest: schemaFromZod(cancelConsultationRequestSchema),
        CreatePrescriptionRequest: schemaFromZod(createPrescriptionRequestSchema),
        PaymentWebhookRequest: schemaFromZod(paymentWebhookRequestSchema),
        SimulatePaymentRequest: schemaFromZod(simulatePaymentRequestSchema),
        Session: sessionSchema,
        LoginSession: {
          type: 'object',
          additionalProperties: false,
          required: ['mfaRequired', ...sessionSchema.required],
          properties: {
            mfaRequired: { const: false },
            ...sessionSchema.properties,
          },
        },
        MfaChallenge: {
          type: 'object',
          additionalProperties: false,
          required: ['mfaRequired', 'mfaEnrollmentRequired', 'mfaToken'],
          properties: {
            mfaRequired: { const: true },
            mfaEnrollmentRequired: { type: 'boolean' },
            mfaToken: { type: 'string' },
          },
        },
        MfaEnrollment: {
          type: 'object',
          additionalProperties: false,
          required: ['secret', 'otpAuthUri'],
          properties: { secret: { type: 'string' }, otpAuthUri: { type: 'string', format: 'uri' } },
        },
        MfaActivation: {
          type: 'object',
          additionalProperties: false,
          required: [...sessionSchema.required, 'recoveryCodes'],
          properties: {
            ...sessionSchema.properties,
            recoveryCodes: {
              type: 'array',
              items: { type: 'string' },
              minItems: 8,
              maxItems: 8,
            },
          },
        },
        Error: errorSchema,
        Liveness: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: { status: { const: 'alive' } },
        },
        Readiness: {
          type: 'object',
          additionalProperties: false,
          required: ['status', 'checks'],
          properties: {
            status: { enum: ['ready', 'not_ready'] },
            checks: { type: 'object', additionalProperties: { enum: ['up', 'down'] } },
          },
        },
        DoctorSummary: {
          type: 'object',
          required: [
            'id',
            'fullName',
            'specialization',
            'experienceYears',
            'consultationFeeMinor',
            'currency',
            'city',
            'languages',
            'ratingAvg',
            'ratingCount',
            'verificationStatus',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            fullName: { type: 'string' },
            specialization: { type: 'string' },
            experienceYears: { type: 'integer', minimum: 0 },
            consultationFeeMinor: { type: 'integer', minimum: 0 },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            city: { type: 'string' },
            languages: { type: 'array', items: { type: 'string' } },
            ratingAvg: { type: 'number', minimum: 0, maximum: 5 },
            ratingCount: { type: 'integer', minimum: 0 },
            verificationStatus: { const: 'VERIFIED' },
          },
        },
        DoctorDetail: {
          allOf: [
            { $ref: '#/components/schemas/DoctorSummary' },
            {
              type: 'object',
              required: ['qualifications'],
              properties: { qualifications: { type: 'array', items: { type: 'string' } } },
            },
          ],
        },
        AvailabilitySlot: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'doctorId', 'startTime', 'endTime', 'status'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            doctorId: { type: 'string', format: 'uuid' },
            startTime: { type: 'string', format: 'date-time' },
            endTime: { type: 'string', format: 'date-time' },
            status: { const: 'AVAILABLE' },
          },
        },
        PendingBooking: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'patientId',
            'doctorId',
            'slotId',
            'status',
            'mode',
            'scheduledAt',
            'payment',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            patientId: { type: 'string', format: 'uuid' },
            doctorId: { type: 'string', format: 'uuid' },
            slotId: { type: 'string', format: 'uuid' },
            status: { const: 'PENDING_PAYMENT' },
            mode: { enum: ['VIDEO', 'AUDIO', 'CHAT'] },
            scheduledAt: { type: 'string', format: 'date-time' },
            payment: {
              type: 'object',
              required: ['id', 'status', 'amountMinor', 'currency', 'providerReference'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                status: { const: 'PENDING' },
                amountMinor: { type: 'integer', minimum: 0 },
                currency: { type: 'string' },
                providerReference: { type: 'string' },
              },
            },
          },
        },
        Consultation: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'patientId',
            'doctorId',
            'doctorUserId',
            'slotId',
            'status',
            'mode',
            'scheduledAt',
            'startedAt',
            'endedAt',
            'cancelReason',
            'version',
            'payment',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            patientId: { type: 'string', format: 'uuid' },
            doctorId: { type: 'string', format: 'uuid' },
            doctorUserId: { type: 'string', format: 'uuid' },
            slotId: { type: 'string', format: 'uuid' },
            status: {
              enum: [
                'PENDING_PAYMENT',
                'CONFIRMED',
                'IN_PROGRESS',
                'COMPLETED',
                'CANCELLED',
                'EXPIRED',
                'NO_SHOW',
              ],
            },
            mode: { enum: ['VIDEO', 'AUDIO', 'CHAT'] },
            scheduledAt: { type: 'string', format: 'date-time' },
            startedAt: { type: ['string', 'null'], format: 'date-time' },
            endedAt: { type: ['string', 'null'], format: 'date-time' },
            cancelReason: {
              type: ['string', 'null'],
              enum: ['PATIENT_REQUEST', 'DOCTOR_UNAVAILABLE', 'SCHEDULING_CONFLICT', 'OTHER', null],
            },
            version: { type: 'integer', minimum: 0 },
            payment: {
              oneOf: [{ $ref: '#/components/schemas/ConsultationPayment' }, { type: 'null' }],
            },
          },
        },
        ConsultationPayment: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'amountMinor', 'currency', 'status'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            amountMinor: { type: 'integer', minimum: 0 },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            status: { enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'REFUNDED'] },
          },
        },
        PrescriptionMetadata: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'consultationId', 'version', 'createdAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            consultationId: { type: 'string', format: 'uuid' },
            version: { type: 'integer', minimum: 1 },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Prescription: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'consultationId', 'version', 'content', 'createdAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            consultationId: { type: 'string', format: 'uuid' },
            version: { type: 'integer', minimum: 1 },
            content: { type: 'string', minLength: 1, maxLength: 10_000 },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AdminAnalyticsOverview: {
          type: 'object',
          additionalProperties: false,
          required: [
            'generatedAt',
            'users',
            'doctorProfiles',
            'consultations',
            'payments',
            'prescriptions',
          ],
          properties: {
            generatedAt: { type: 'string', format: 'date-time' },
            users: { $ref: '#/components/schemas/UserAggregates' },
            doctorProfiles: { $ref: '#/components/schemas/DoctorAggregates' },
            consultations: { $ref: '#/components/schemas/ConsultationAggregates' },
            payments: { $ref: '#/components/schemas/PaymentAggregates' },
            prescriptions: {
              type: 'object',
              additionalProperties: false,
              required: ['total'],
              properties: { total: { type: 'integer', minimum: 0 } },
            },
          },
        },
        UserAggregates: aggregateCounts(['total', 'patients', 'doctors', 'admins']),
        DoctorAggregates: aggregateCounts(['total', 'verified']),
        ConsultationAggregates: {
          type: 'object',
          additionalProperties: false,
          required: ['total', 'byStatus'],
          properties: {
            total: { type: 'integer', minimum: 0 },
            byStatus: {
              type: 'object',
              additionalProperties: false,
              required: [
                'PENDING_PAYMENT',
                'CONFIRMED',
                'IN_PROGRESS',
                'COMPLETED',
                'CANCELLED',
                'EXPIRED',
                'NO_SHOW',
              ],
              properties: Object.fromEntries(
                [
                  'PENDING_PAYMENT',
                  'CONFIRMED',
                  'IN_PROGRESS',
                  'COMPLETED',
                  'CANCELLED',
                  'EXPIRED',
                  'NO_SHOW',
                ].map((status) => [status, { type: 'integer', minimum: 0 }]),
              ),
            },
          },
        },
        PaymentAggregates: {
          type: 'object',
          additionalProperties: false,
          required: [
            'succeeded',
            'refunded',
            'capturedAmountMinorByCurrency',
            'refundedAmountMinorByCurrency',
          ],
          properties: {
            succeeded: { type: 'integer', minimum: 0 },
            refunded: { type: 'integer', minimum: 0 },
            capturedAmountMinorByCurrency: {
              type: 'array',
              items: { $ref: '#/components/schemas/CurrencyAmount' },
            },
            refundedAmountMinorByCurrency: {
              type: 'array',
              items: { $ref: '#/components/schemas/CurrencyAmount' },
            },
          },
        },
        CurrencyAmount: {
          type: 'object',
          additionalProperties: false,
          required: ['currency', 'amountMinor'],
          properties: {
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            amountMinor: { type: 'integer', minimum: 0 },
          },
        },
        PaymentEventResponse: {
          type: 'object',
          additionalProperties: false,
          required: ['received', 'duplicate', 'paymentId'],
          properties: {
            received: { const: true },
            duplicate: { type: 'boolean' },
            paymentId: { type: ['string', 'null'], format: 'uuid' },
            paymentStatus: { enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'REFUNDED'] },
          },
        },
      },
    },
  };
}

function schemaFromZod(schema: z.ZodType): unknown {
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' });
  const openApiSchema = { ...jsonSchema };
  delete openApiSchema.$schema;
  return openApiSchema;
}

function jsonResponse(description: string, schema: unknown): Readonly<Record<string, unknown>> {
  return { description, content: { 'application/json': { schema } } };
}

function requestBody(schemaName: string): Readonly<Record<string, unknown>> {
  return {
    required: true,
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } },
  };
}

function authMutation(
  operationId: string,
  summary: string,
  schemaName: string,
  responses: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    tags: ['Authentication'],
    operationId,
    summary,
    requestBody: requestBody(schemaName),
    responses: withCommonErrors(responses),
  };
}

function protectedMutation(
  operationId: string,
  summary: string,
  schemaName: string | undefined,
  responses: Readonly<Record<string, unknown>>,
  scheme: 'accessBearer' | 'mfaBearer',
  options: {
    readonly tag?: string;
    readonly idempotent?: boolean;
    readonly parameters?: readonly unknown[];
  } = {},
): Readonly<Record<string, unknown>> {
  return {
    tags: [options.tag ?? 'Authentication'],
    operationId,
    summary,
    security: [{ [scheme]: [] }],
    ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
    ...(options.idempotent === true
      ? { parameters: [...(options.parameters ?? []), idempotencyKeyParameter()] }
      : {}),
    ...(schemaName === undefined ? {} : { requestBody: requestBody(schemaName) }),
    responses: withCommonErrors(responses),
  };
}

function protectedQuery(
  operationId: string,
  summary: string,
  responses: Readonly<Record<string, unknown>>,
  options: {
    readonly tag: string;
    readonly parameters?: readonly unknown[];
  },
): Readonly<Record<string, unknown>> {
  return {
    tags: [options.tag],
    operationId,
    summary,
    security: [{ accessBearer: [] }],
    ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
    responses: withCommonErrors(responses),
  };
}

function aggregateCounts(fields: readonly string[]): Readonly<Record<string, unknown>> {
  return {
    type: 'object',
    additionalProperties: false,
    required: fields,
    properties: Object.fromEntries(fields.map((field) => [field, { type: 'integer', minimum: 0 }])),
  };
}

function pathIdParameter(description: string): Readonly<Record<string, unknown>> {
  return {
    in: 'path',
    name: 'id',
    required: true,
    description,
    schema: { type: 'string', format: 'uuid' },
  };
}

function idempotencyKeyParameter(): Readonly<Record<string, unknown>> {
  return {
    in: 'header',
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' },
  };
}

function queryParameters(schema: z.ZodType): readonly Readonly<Record<string, unknown>>[] {
  const jsonSchema = schemaFromZod(schema);
  if (
    typeof jsonSchema !== 'object' ||
    jsonSchema === null ||
    !('properties' in jsonSchema) ||
    typeof jsonSchema.properties !== 'object' ||
    jsonSchema.properties === null
  ) {
    return [];
  }
  const required =
    'required' in jsonSchema && Array.isArray(jsonSchema.required) ? jsonSchema.required : [];
  const properties = jsonSchema.properties as Readonly<Record<string, unknown>>;
  return Object.entries(properties).map(([name, propertySchema]) => ({
    in: 'query',
    name,
    required: required.includes(name),
    schema: propertySchema,
  }));
}

function errorResponse(description: string): Readonly<Record<string, unknown>> {
  return jsonResponse(description, { $ref: '#/components/schemas/Error' });
}

function withCommonErrors(
  responses: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    ...responses,
    '400': jsonResponse('Validation failed', { $ref: '#/components/schemas/Error' }),
    '401': jsonResponse('Authentication failed', { $ref: '#/components/schemas/Error' }),
    '403': jsonResponse('Authorization failed', { $ref: '#/components/schemas/Error' }),
    '409': jsonResponse('Request conflicts with current state', {
      $ref: '#/components/schemas/Error',
    }),
    '422': jsonResponse('Idempotency key conflicts with a different request', {
      $ref: '#/components/schemas/Error',
    }),
    '429': jsonResponse('Rate limit exceeded', { $ref: '#/components/schemas/Error' }),
  };
}
