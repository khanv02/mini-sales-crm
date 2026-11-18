import { z } from 'zod';
import { DEAL_STATUSES } from '../constants';
import { dateOnlySchema, paginationSchema, uuidSchema } from './common';

export const dealStatusSchema = z.enum(DEAL_STATUSES);

export const dealTitleSchema = z.string().trim().min(1).max(200);

/** `numeric(14,2)` with a non-negative check (docs/data-model.md 4.7). */
export const dealValueSchema = z.number().finite().min(0).max(999_999_999_999.99);

export const dealCurrencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a three-letter ISO 4217 currency code.');

export const dealLostReasonSchema = z.string().trim().min(1).max(500);

export const dealVersionSchema = z.number().int().min(1);

/** `GET /deals`: board/list filters plus cursor. */
export const dealListQuerySchema = paginationSchema.extend({
  pipelineId: uuidSchema.optional(),
  stageId: uuidSchema.optional(),
  ownerId: uuidSchema.optional(),
  status: dealStatusSchema.optional(),
  sort: z.enum(['createdAt', '-createdAt', 'name', 'value']).default('-createdAt'),
});

/** `POST /deals`: status/position/version are server-owned; currency must match the org. */
export const dealCreateSchema = z.object({
  contactId: uuidSchema,
  pipelineId: uuidSchema,
  stageId: uuidSchema,
  title: dealTitleSchema,
  value: dealValueSchema,
  currency: dealCurrencySchema.optional(),
  expectedClose: dateOnlySchema.optional(),
  ownerId: uuidSchema.optional(),
});

/** `PATCH /deals/:id`: optimistic lock via `version`; the owner is changed through `/assign` only. */
export const dealUpdateSchema = z.object({
  title: dealTitleSchema.optional(),
  value: dealValueSchema.optional(),
  expectedClose: dateOnlySchema.nullable().optional(),
  version: dealVersionSchema,
});

/** `PATCH /deals/:id/move`: the client sends the target stage and the card index. */
export const dealMoveSchema = z.object({
  stageId: uuidSchema,
  position: z.number().int().min(0),
  version: dealVersionSchema,
  lostReason: dealLostReasonSchema.optional(),
});

/** `PATCH /deals/:id/assign`: Manager/Admin only. */
export const dealAssignSchema = z.object({
  ownerId: uuidSchema,
  version: dealVersionSchema,
});

export type DealListQuery = z.infer<typeof dealListQuerySchema>;
export type DealCreateRequest = z.infer<typeof dealCreateSchema>;
export type DealUpdateRequest = z.infer<typeof dealUpdateSchema>;
export type DealMoveRequest = z.infer<typeof dealMoveSchema>;
export type DealAssignRequest = z.infer<typeof dealAssignSchema>;
