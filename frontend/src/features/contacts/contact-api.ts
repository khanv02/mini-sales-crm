import type {
  Contact,
  ContactCreateRequest,
  ContactListResponse,
  ContactUpdateRequest,
} from '@pulse/shared';
import { ApiClientError, apiFetchAuth } from '../../lib/api/client';

/** Filters accepted by `GET /contacts` (FR-03.2); empty strings mean "not set". */
export interface ContactFilters {
  search: string;
  source: string;
  ownerId: string;
}

export const contactKeys = {
  all: ['contacts'] as const,
  list: (filters: ContactFilters) => ['contacts', filters] as const,
};

const PAGE_SIZE = 20;

function buildListQuery(filters: ContactFilters, cursor: string | null): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (filters.search) params.set('search', filters.search);
  if (filters.source) params.set('source', filters.source);
  if (filters.ownerId) params.set('ownerId', filters.ownerId);
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export function fetchContacts(
  filters: ContactFilters,
  cursor: string | null,
): Promise<ContactListResponse> {
  return apiFetchAuth<ContactListResponse>(`/api/v1/contacts?${buildListQuery(filters, cursor)}`);
}

/** Up to 100 contacts for pickers; `GET /contacts` caps `limit` at 100 (FR-03.2). */
export function fetchContactOptions(): Promise<Contact[]> {
  return apiFetchAuth<ContactListResponse>('/api/v1/contacts?limit=100&sort=name').then(
    (response) => response.data,
  );
}

export function createContact(body: ContactCreateRequest): Promise<Contact> {
  return apiFetchAuth<Contact>('/api/v1/contacts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateContact(id: string, body: ContactUpdateRequest): Promise<Contact> {
  return apiFetchAuth<Contact>(`/api/v1/contacts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteContact(id: string): Promise<void> {
  return apiFetchAuth<void>(`/api/v1/contacts/${id}`, { method: 'DELETE' });
}

/**
 * User-facing copy stays Vietnamese (AGENTS.md section 2). Known API error
 * codes get a product message; anything else falls back to the server text.
 */
export function contactErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'CONTACT_EMAIL_EXISTS':
        return 'Email này đã được dùng cho một khách hàng khác.';
      case 'CONTACT_NOT_FOUND':
        return 'Khách hàng không còn tồn tại.';
      case 'INVALID_OWNER':
        return 'Người phụ trách phải là thành viên đang hoạt động trong tổ chức.';
      case 'VALIDATION_ERROR':
        return 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.';
      default:
        return error.message;
    }
  }
  return fallback;
}
