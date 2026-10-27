import { z } from 'zod';

export const consultationIdParamsSchema = z.object({ id: z.uuid() }).strict();

export const consultationCancellationReasonSchema = z.enum([
  'PATIENT_REQUEST',
  'DOCTOR_UNAVAILABLE',
  'SCHEDULING_CONFLICT',
  'OTHER',
]);

export const cancelConsultationRequestSchema = z
  .object({
    reason: consultationCancellationReasonSchema,
  })
  .strict();

export type CancelConsultationRequest = z.infer<typeof cancelConsultationRequestSchema>;
