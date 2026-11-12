import { z } from 'zod';
import { dateOnlySchema, emailSchema, hasDefinedField, paginationSchema, uuidSchema } from './common';

export const contactNameSchema = z.string().trim().min(1).max(200);
export const contactPhoneSchema = z.string().trim().max(30);
export const contactCompanySchema = z.string().trim().max(200);
export const contactSourceSchema = z.string().trim().max(50);

/** `GET /contacts`: search/filter + cursor. Date-ranges are checked by the service (`INVALID_DATE_RANGE`). */
export const contactListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  ownerId: uuidSchema.optional(),
  source: contactSourceSchema.optional(),
  createdFrom: dateOnlySchema.optional(),
  createdTo: dateOnlySchema.optional(),
  sort: z.enum(['createdAt', '-createdAt', 'name']).default('-createdAt'),
});

/** `POST /contacts`: `ownerId` is honoured for Manager/Admin only; Sales always own their contacts. */
export const contactCreateSchema = z.object({
  name: contactNameSchema,
  email: emailSchema.optional(),
  phone: contactPhoneSchema.optional(),
  company: contactCompanySchema.optional(),
  source: contactSourceSchema.optional(),
  ownerId: uuidSchema.optional(),
});

/** `PATCH /contacts/:id`: `null` clears an optional field; the owner cannot be changed here. */
export const contactUpdateSchema = z
  .object({
    name: contactNameSchema.optional(),
    email: emailSchema.nullable().optional(),
    phone: contactPhoneSchema.nullable().optional(),
    company: contactCompanySchema.nullable().optional(),
    source: contactSourceSchema.nullable().optional(),
  })
  .refine(hasDefinedField, { message: 'Provide at least one of name, email, phone, company or source.' });

export type ContactListQuery = z.infer<typeof contactListQuerySchema>;
export type ContactCreateRequest = z.infer<typeof contactCreateSchema>;
export type ContactUpdateRequest = z.infer<typeof contactUpdateSchema>;
