import { z } from 'zod';

const boundedText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

export const registerRequestSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    password: z.string().min(12).max(128),
    fullName: boundedText(2, 100),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/u),
    dob: z.iso.date(),
    city: boundedText(1, 100).optional(),
    languages: z.array(boundedText(1, 40)).max(10).default([]),
  })
  .strict();

export const loginRequestSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();

export const mfaCodeRequestSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/u),
  })
  .strict();

export const mfaVerifyRequestSchema = z
  .object({
    code: z
      .string()
      .regex(/^\d{6}$/u)
      .optional(),
    recoveryCode: z.string().trim().min(12).max(64).optional(),
  })
  .strict()
  .refine((value) => (value.code === undefined) !== (value.recoveryCode === undefined), {
    message: 'Provide exactly one MFA code or recovery code.',
  });

export const refreshTokenRequestSchema = z
  .object({
    refreshToken: z.string().min(32).max(256),
  })
  .strict();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type MfaCodeRequest = z.infer<typeof mfaCodeRequestSchema>;
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;
