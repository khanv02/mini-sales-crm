import type { ReportSummary } from '@pulse/shared';
import { ApiClientError, apiFetchAuth } from '../../lib/api/client';

export interface ReportFilters {
  from?: string;
  to?: string;
  ownerId?: string;
  pipelineId?: string;
}

export const reportKeys = {
  summary: (filters: ReportFilters) => ['reports', 'summary', filters] as const,
};

/** `GET /reports/summary` (FR-08.1): date-only filters; the API applies the org timezone. */
export function fetchReportSummary(filters: ReportFilters): Promise<ReportSummary> {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.ownerId) params.set('ownerId', filters.ownerId);
  if (filters.pipelineId) params.set('pipelineId', filters.pipelineId);
  const query = params.toString();
  return apiFetchAuth<ReportSummary>(
    `/api/v1/reports/summary${query ? `?${query}` : ''}`,
  );
}

/** User-facing copy stays Vietnamese; unknown codes fall back to the server message. */
export function reportErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'INVALID_DATE_RANGE':
        return 'Khoảng ngày không hợp lệ: ngày bắt đầu phải trước hoặc bằng ngày kết thúc.';
      case 'REPORT_RANGE_TOO_LARGE':
        return 'Khoảng ngày tối đa là 366 ngày.';
      case 'VALIDATION_ERROR':
        return 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.';
      default:
        return error.message;
    }
  }
  return fallback;
}
