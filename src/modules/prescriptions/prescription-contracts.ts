import { z } from 'zod';

export const createPrescriptionRequestSchema = z
  .object({
    content: z.string().trim().min(1).max(10_000),
  })
  .strict();

export type CreatePrescriptionRequest = z.infer<typeof createPrescriptionRequestSchema>;
