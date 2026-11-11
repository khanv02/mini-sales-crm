import type { PipeTransform } from '@nestjs/common';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';
import { AppError, ERROR_CODES } from '../errors/app-error';

export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    const messages = fields[key] ?? [];
    messages.push(issue.message);
    fields[key] = messages;
  }
  return fields;
}

/**
 * Validates with a zod schema and returns the parsed (normalised) value.
 *
 * The schema is typed with an `unknown` input so schemas that transform their
 * input (`z.coerce`, `z.enum(...).transform(...)`, `.default(...)`) are accepted.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid data.', {
        fields: zodFieldErrors(parsed.error),
      });
    }
    return parsed.data;
  }
}
