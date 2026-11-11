import { Prisma } from '@prisma/client';

/**
 * True when Prisma reports a unique-constraint violation. When `field` is given
 * the constraint target must mention it (Prisma does not model expression
 * indexes such as `lower(email)`, in which case any target is accepted).
 */
export function isUniqueConstraintViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  if (!field) {
    return true;
  }

  const target = error.meta?.target;
  const text = Array.isArray(target) ? target.join(',') : typeof target === 'string' ? target : '';
  return text.length === 0 || text.toLowerCase().includes(field.toLowerCase());
}
