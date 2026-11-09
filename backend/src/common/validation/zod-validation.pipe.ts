import type { PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';
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

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

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
