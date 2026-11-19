import type {
  Activity,
  ActivityListResponse,
  TaskStatusValue,
  TaskUpdateRequest,
} from '@pulse/shared';
import { ApiClientError, apiFetchAuth } from '../../lib/api/client';

export const taskKeys = {
  all: ['tasks'] as const,
  list: (status: TaskStatusValue) => ['tasks', status] as const,
};

const TASK_PAGE_SIZE = 50;

/** `GET /tasks` (FR-07.4): the projection over TASK activities, newest due date first. */
export function fetchTasks(
  status: TaskStatusValue,
  cursor: string | null,
): Promise<ActivityListResponse> {
  const params = new URLSearchParams({ status, limit: String(TASK_PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  return apiFetchAuth<ActivityListResponse>(`/api/v1/tasks?${params.toString()}`);
}

export function updateTask(id: string, body: TaskUpdateRequest): Promise<Activity> {
  return apiFetchAuth<Activity>(`/api/v1/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** User-facing copy stays Vietnamese; unknown codes fall back to the server message. */
export function taskErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'ACTIVITY_NOT_FOUND':
        return 'Công việc không còn tồn tại.';
      case 'TASK_ASSIGNEE_REQUIRED':
        return 'Công việc cần có người phụ trách.';
      case 'TASK_DUE_REQUIRED':
        return 'Công việc cần có hạn hoàn thành.';
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
