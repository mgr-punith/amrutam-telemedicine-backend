import { z } from 'zod';

import {
  loginRequestSchema,
  mfaCodeRequestSchema,
  mfaVerifyRequestSchema,
  refreshTokenRequestSchema,
  registerRequestSchema,
} from '../modules/auth/auth-contracts.js';

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
      version: '0.2.0',
      description: 'Security-first telemedicine backend demonstration API.',
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local Docker environment' }],
    tags: [{ name: 'Health' }, { name: 'Authentication' }],
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
): Readonly<Record<string, unknown>> {
  return {
    tags: ['Authentication'],
    operationId,
    summary,
    security: [{ [scheme]: [] }],
    ...(schemaName === undefined ? {} : { requestBody: requestBody(schemaName) }),
    responses: withCommonErrors(responses),
  };
}

function withCommonErrors(
  responses: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    ...responses,
    '400': jsonResponse('Validation failed', { $ref: '#/components/schemas/Error' }),
    '401': jsonResponse('Authentication failed', { $ref: '#/components/schemas/Error' }),
    '409': jsonResponse('Request conflicts with current state', {
      $ref: '#/components/schemas/Error',
    }),
    '429': jsonResponse('Rate limit exceeded', { $ref: '#/components/schemas/Error' }),
  };
}
