import { z } from 'zod';

export const createConsultationRequestSchema = z
  .object({
    slotId: z.uuid(),
    mode: z.enum(['VIDEO', 'AUDIO', 'CHAT']),
  })
  .strict();

export type CreateConsultationRequest = z.infer<typeof createConsultationRequestSchema>;
