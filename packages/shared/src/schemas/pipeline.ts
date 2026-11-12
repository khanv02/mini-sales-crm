import { z } from 'zod';
import { hasDefinedField } from './common';

export const pipelineNameSchema = z.string().trim().min(1).max(80);
export const stageNameSchema = z.string().trim().min(1).max(80);

/** Fractional position (`numeric(20,10)`); the server computes it when it is omitted. */
export const stagePositionSchema = z.number().finite().nonnegative();

const flagsAreExclusive = (value: { isWon?: boolean; isLost?: boolean }): boolean =>
  !(value.isWon && value.isLost);

export const stageCreateSchema = z
  .object({
    name: stageNameSchema,
    position: stagePositionSchema.optional(),
    isWon: z.boolean().optional(),
    isLost: z.boolean().optional(),
  })
  .refine(flagsAreExclusive, { message: 'A stage cannot be both won and lost.' });

/** `POST /pipelines`: stages may be created together with the pipeline. */
export const pipelineCreateSchema = z.object({
  name: pipelineNameSchema,
  stages: z.array(stageCreateSchema).optional(),
});

/** `PATCH /pipelines/:id`. */
export const pipelineUpdateSchema = z.object({ name: pipelineNameSchema });

/** `PATCH /stages/:id`: rename, reposition, toggle won/lost. */
export const stageUpdateSchema = z
  .object({
    name: stageNameSchema.optional(),
    position: stagePositionSchema.optional(),
    isWon: z.boolean().optional(),
    isLost: z.boolean().optional(),
  })
  .refine(hasDefinedField, { message: 'Provide at least one of name, position, isWon or isLost.' })
  .refine(flagsAreExclusive, { message: 'A stage cannot be both won and lost.' });

export type PipelineCreateRequest = z.infer<typeof pipelineCreateSchema>;
export type PipelineUpdateRequest = z.infer<typeof pipelineUpdateSchema>;
export type StageCreateRequest = z.infer<typeof stageCreateSchema>;
export type StageUpdateRequest = z.infer<typeof stageUpdateSchema>;
