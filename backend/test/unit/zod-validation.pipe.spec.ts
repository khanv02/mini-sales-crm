import { z } from 'zod';
import { AppError } from '../../src/common/errors/app-error';
import { ZodValidationPipe } from '../../src/common/validation/zod-validation.pipe';

const schema = z.object({
  email: z.string().email(),
  limit: z.number().int().min(1),
});

describe('ZodValidationPipe', () => {
  it('returns parsed, normalised input', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ email: 'a@example.test', limit: 10 })).toEqual({
      email: 'a@example.test',
      limit: 10,
    });
  });

  it('throws VALIDATION_ERROR with field details', () => {
    const pipe = new ZodValidationPipe(schema);
    expect.assertions(3);
    try {
      pipe.transform({ email: 'not-an-email', limit: 0 });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe('VALIDATION_ERROR');
      expect(appError.details?.fields).toMatchObject({
        email: expect.any(Array),
        limit: expect.any(Array),
      });
    }
  });
});
