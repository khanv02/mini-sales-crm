import { z } from 'zod';
import { ACTIVITY_TYPES, TASK_STATUSES } from '../constants';
import {
  dateOnlySchema,
  hasDefinedField,
  isoDateTimeSchema,
  paginationSchema,
  uuidSchema,
} from './common';

export const activityTypeSchema = z.enum(ACTIVITY_TYPES);

/** 1–10,000 characters (docs/data-model.md 4.8). */
export const activityContentSchema = z.string().trim().min(1).max(10_000);

/** `GET /deals/:id/activities`: timeline ordered by `created_at desc, id desc`, optionally filtered by type. */
export const activityListQuerySchema = paginationSchema.extend({
  type: activityTypeSchema.optional(),
});

/**
 * `POST /deals/:id/activities`. The schema only checks the shape: a `TASK` without `dueAt`/`assigneeId` is
 * rejected by the service with `TASK_DUE_REQUIRED`/`TASK_ASSIGNEE_REQUIRED` (docs/error-codes.md 5).
 */
export const activityCreateSchema = z.object({
  type: activityTypeSchema,
  content: activityContentSchema,
  dueAt: isoDateTimeSchema.optional(),
  assigneeId: uuidSchema.optional(),
});

/**
 * `PATCH /activities/:id`: `null` clears `dueAt`/`assigneeId`. Task invariants (required deadline and assignee,
 * `done_at` only on tasks) are enforced by the service and the database checks from `0003_workflow`.
 */
export const activityUpdateSchema = z
  .object({
    content: activityContentSchema.optional(),
    dueAt: isoDateTimeSchema.nullable().optional(),
    assigneeId: uuidSchema.nullable().optional(),
  })
  .refine(hasDefinedField, { message: 'Provide at least one of content, dueAt or assigneeId.' });

/** `GET /tasks`: projection over activities where `type='TASK'` (ADR-010). */
export const taskStatusSchema = z.enum(TASK_STATUSES);

export const taskListQuerySchema = paginationSchema.extend({
  status: taskStatusSchema.optional(),
  assigneeId: uuidSchema.optional(),
  dueFrom: dateOnlySchema.optional(),
  dueTo: dateOnlySchema.optional(),
});

/** `PATCH /tasks/:id`: `done` maps to `done_at`; marking a task done twice stays idempotent. */
export const taskUpdateSchema = z
  .object({
    done: z.boolean().optional(),
    content: activityContentSchema.optional(),
    dueAt: isoDateTimeSchema.optional(),
    assigneeId: uuidSchema.optional(),
  })
  .refine(hasDefinedField, { message: 'Provide at least one of done, content, dueAt or assigneeId.' });

export type ActivityTypeValue = z.infer<typeof activityTypeSchema>;
export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
export type ActivityCreateRequest = z.infer<typeof activityCreateSchema>;
export type ActivityUpdateRequest = z.infer<typeof activityUpdateSchema>;
export type TaskStatusValue = z.infer<typeof taskStatusSchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
export type TaskUpdateRequest = z.infer<typeof taskUpdateSchema>;
