import { z } from 'zod';

export const doctorIdParamsSchema = z.object({ id: z.uuid() }).strict();

export const doctorSearchQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(100).optional(),
    specialization: z.string().trim().min(1).max(100).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    language: z.string().trim().min(1).max(40).optional(),
    maxFeeMinor: z.coerce.number().int().min(0).max(10_000_000).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const slotListQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine((value) => value.from === undefined || value.to === undefined || value.from < value.to, {
    message: '`from` must be before `to`.',
  });

export const createAvailabilitySlotRequestSchema = z
  .object({
    startTime: z.iso.datetime({ offset: true }),
    endTime: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((value) => value.startTime < value.endTime, {
    message: 'The slot end time must be after the start time.',
  });

export type DoctorSearchQuery = z.infer<typeof doctorSearchQuerySchema>;
export type SlotListQuery = z.infer<typeof slotListQuerySchema>;
export type CreateAvailabilitySlotRequest = z.infer<typeof createAvailabilitySlotRequestSchema>;
