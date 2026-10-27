import { z } from 'zod';

export const paymentWebhookRequestSchema = z
  .object({
    eventId: z.string().trim().min(8).max(128),
    providerReference: z.string().trim().min(8).max(128),
    status: z.enum(['SUCCEEDED', 'FAILED', 'EXPIRED']),
  })
  .strict();

export const paymentIdParamsSchema = z.object({ id: z.uuid() }).strict();

export const simulatePaymentRequestSchema = z
  .object({ status: z.enum(['SUCCEEDED', 'FAILED', 'EXPIRED']) })
  .strict();

export type PaymentWebhookRequest = z.infer<typeof paymentWebhookRequestSchema>;
export type SimulatePaymentRequest = z.infer<typeof simulatePaymentRequestSchema>;
