import { z } from 'zod';
import { USER_ROLES } from '../constants';
import { booleanQuerySchema, emailSchema, nameSchema, paginationSchema } from './common';
import { passwordSchema } from './auth';

export const userRoleSchema = z.enum(USER_ROLES);

export const userListQuerySchema = paginationSchema.extend({
  role: userRoleSchema.optional(),
  active: booleanQuerySchema.optional(),
});

export const userCreateSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
  role: userRoleSchema,
});

/** `PATCH /users/:id`: at least one of name/role/active must be present. */
export const userUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    role: userRoleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one of name, role or active.',
  });

export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserCreateRequest = z.infer<typeof userCreateSchema>;
export type UserUpdateRequest = z.infer<typeof userUpdateSchema>;
