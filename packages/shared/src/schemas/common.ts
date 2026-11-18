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

/** Query-string boolean (`?active=false`) that only accepts the literals true/false. */
export const booleanQuerySchema = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Date-only string (`YYYY-MM-DD`), used by query filters and date fields. */
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.');

/** ISO-8601 timestamp with an explicit offset, e.g. `2026-11-18T09:00:00Z` or `2026-11-18T16:00:00+07:00`. */
export const isoDateTimeSchema = z.string().datetime({ offset: true });

/** True when a PATCH body carries at least one field. */
export function hasDefinedField(value: Record<string, unknown>): boolean {
  return Object.values(value).some((field) => field !== undefined);
}

export type PaginationInput = z.infer<typeof paginationSchema>;
export type ApiErrorSchema = z.infer<typeof apiErrorSchema>;
