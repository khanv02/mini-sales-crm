import type {
  Activity,
  ActivityCreateRequest,
  ActivityListResponse,
  ActivityUpdateRequest,
  ActivityTypeValue,
} from '@pulse/shared';
import { ApiClientError, apiFetchAuth } from '../../lib/api/client';

export const activityKeys = {
  all: ['activities'] as const,
  timeline: (dealId: string, type: ActivityTypeValue | 'ALL') =>
    ['activities', dealId, type] as const,
};

const TIMELINE_PAGE_SIZE = 50;

function timelineQuery(type?: ActivityTypeValue, cursor?: string | null): string {
  const params = new URLSearchParams({ limit: String(TIMELINE_PAGE_SIZE) });
  if (type) params.set('type', type);
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

/** `GET /deals/:id/activities` (FR-07.3): newest first, optionally filtered by type. */
export function fetchDealActivities(
  dealId: string,
  type: ActivityTypeValue | undefined,
  cursor: string | null,
): Promise<ActivityListResponse> {
  return apiFetchAuth<ActivityListResponse>(
    `/api/v1/deals/${dealId}/activities?${timelineQuery(type, cursor)}`,
  );
}

export function createActivity(
  dealId: string,
  body: ActivityCreateRequest,
): Promise<Activity> {
  return apiFetchAuth<Activity>(`/api/v1/deals/${dealId}/activities`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateActivity(id: string, body: ActivityUpdateRequest): Promise<Activity> {
  return apiFetchAuth<Activity>(`/api/v1/activities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** User-facing copy stays Vietnamese; unknown codes fall back to the server message. */
export function activityErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'TASK_DUE_REQUIRED':
        return 'Công việc cần có hạn hoàn thành.';
      case 'TASK_ASSIGNEE_REQUIRED':
        return 'Công việc cần có người phụ trách.';
      case 'INVALID_OWNER':
        return 'Người phụ trách phải là thành viên đang hoạt động trong tổ chức.';
      case 'ACTIVITY_NOT_FOUND':
        return 'Hoạt động không còn tồn tại.';
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
