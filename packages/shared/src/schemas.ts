import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().trim().toLowerCase().email().max(320);
export const nameSchema = z.string().trim().min(1).max(120);

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
  requestId: z.string().min(1),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type ApiErrorSchema = z.infer<typeof apiErrorSchema>;
