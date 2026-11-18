import type { Contact as ContactModel } from '@prisma/client';
import type { Contact as ContactResponse } from '@pulse/shared';

/** API projection of a contact row (docs/api/openapi.yaml `Contact`). */
export function toContact(contact: ContactModel): ContactResponse {
  return {
    id: contact.id,
    orgId: contact.orgId,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    source: contact.source,
    ownerId: contact.ownerId,
    deletedAt: contact.deletedAt?.toISOString() ?? null,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

/** Audit snapshot (FR-03): the business fields only, never internal columns. */
export function contactAuditSnapshot(
  contact: Pick<ContactModel, 'name' | 'email' | 'phone' | 'company' | 'source' | 'ownerId'>,
): Record<string, unknown> {
  return {
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    source: contact.source,
    ownerId: contact.ownerId,
  };
}

/** Snapshot restricted to the fields a PATCH touched, used for the `before` side of the audit diff. */
export function contactFieldSnapshot(
  contact: Pick<ContactModel, 'name' | 'email' | 'phone' | 'company' | 'source'>,
  fields: readonly string[],
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in contact) {
      snapshot[field] = contact[field as keyof typeof contact];
    }
  }
  return snapshot;
}
