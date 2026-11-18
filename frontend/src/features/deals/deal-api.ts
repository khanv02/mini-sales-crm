import type {
  Deal,
  DealAssignRequest,
  DealCreateRequest,
  DealListResponse,
  DealMoveRequest,
  DealUpdateRequest,
} from '@pulse/shared';
import { ApiClientError, apiFetchAuth } from '../../lib/api/client';

export interface Assignee {
  id: string;
  label: string;
}

export const dealKeys = {
  all: ['deals'] as const,
  board: (pipelineId: string) => ['deals', pipelineId] as const,
};

const BOARD_PAGE_SIZE = 100;

export function fetchDeals(pipelineId: string, cursor: string | null): Promise<DealListResponse> {
  const params = new URLSearchParams({ pipelineId, limit: String(BOARD_PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  return apiFetchAuth<DealListResponse>(`/api/v1/deals?${params.toString()}`);
}

export function moveDeal(id: string, body: DealMoveRequest): Promise<Deal> {
  return apiFetchAuth<Deal>(`/api/v1/deals/${id}/move`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function createDeal(body: DealCreateRequest): Promise<Deal> {
  return apiFetchAuth<Deal>('/api/v1/deals', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateDeal(id: string, body: DealUpdateRequest): Promise<Deal> {
  return apiFetchAuth<Deal>(`/api/v1/deals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function assignDeal(id: string, body: DealAssignRequest): Promise<Deal> {
  return apiFetchAuth<Deal>(`/api/v1/deals/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** User-facing copy stays Vietnamese; unknown codes fall back to the server message. */
export function dealErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'DEAL_VERSION_CONFLICT':
        return 'Deal đã được người khác cập nhật. Bảng đã được tải lại.';
      case 'LOST_REASON_REQUIRED':
        return 'Cần nhập lý do thua trước khi chuyển sang stage thua.';
      case 'CURRENCY_MISMATCH':
        return 'Tiền tệ của deal phải trùng với tiền tệ của tổ chức.';
      case 'INVALID_STAGE':
        return 'Stage không thuộc quy trình đã chọn.';
      case 'STAGE_NOT_FOUND':
        return 'Stage không còn tồn tại.';
      case 'CONTACT_NOT_FOUND':
        return 'Khách hàng không còn tồn tại.';
      case 'INVALID_OWNER':
        return 'Người phụ trách phải là thành viên đang hoạt động trong tổ chức.';
      case 'DEAL_NOT_FOUND':
        return 'Deal không còn tồn tại.';
      case 'VALIDATION_ERROR':
        return 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.';
      default:
        return error.message;
    }
  }
  return fallback;
}
