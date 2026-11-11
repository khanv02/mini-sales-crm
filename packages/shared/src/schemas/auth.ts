import { z } from 'zod';
import { emailSchema, nameSchema } from './common';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Password policy (FR-02.5): 12-128 characters, never trimmed (leading/trailing
 * spaces are kept as typed) and all-whitespace passwords are rejected.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`)
  .refine((value) => value.trim().length > 0, { message: 'Password cannot be blank.' });

export const orgNameSchema = z.string().trim().min(1).max(120);

export const registerRequestSchema = z.object({
  orgName: orgNameSchema,
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

/**
 * `POST /auth/refresh` / `POST /auth/logout`: the token normally travels in the
 * HttpOnly cookie (ADR-015); a body is optional, so an empty request is valid.
 */
export const refreshRequestSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .default({});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
