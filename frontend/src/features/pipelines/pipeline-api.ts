import type {
  Pipeline,
  PipelineCreateRequest,
  PipelineUpdateRequest,
  Stage,
  StageCreateRequest,
  StageUpdateRequest,
} from '@pulse/shared';
import { ApiClientError, apiFetchAuth } from '../../lib/api/client';

export const pipelineKeys = {
  all: ['pipelines'] as const,
};

export function fetchPipelines(): Promise<Pipeline[]> {
  return apiFetchAuth<Pipeline[]>('/api/v1/pipelines');
}

export function createPipeline(body: PipelineCreateRequest): Promise<Pipeline> {
  return apiFetchAuth<Pipeline>('/api/v1/pipelines', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updatePipeline(id: string, body: PipelineUpdateRequest): Promise<Pipeline> {
  return apiFetchAuth<Pipeline>(`/api/v1/pipelines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deletePipeline(id: string): Promise<void> {
  return apiFetchAuth<void>(`/api/v1/pipelines/${id}`, { method: 'DELETE' });
}

export function createStage(pipelineId: string, body: StageCreateRequest): Promise<Stage> {
  return apiFetchAuth<Stage>(`/api/v1/pipelines/${pipelineId}/stages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateStage(id: string, body: StageUpdateRequest): Promise<Stage> {
  return apiFetchAuth<Stage>(`/api/v1/stages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteStage(id: string): Promise<void> {
  return apiFetchAuth<void>(`/api/v1/stages/${id}`, { method: 'DELETE' });
}

/**
 * The API exposes per-stage `position` updates only, so a drag reorder rewrites the
 * positions of the cards whose index changed. Positions are 1-based like the seed.
 */
export async function saveStageOrder(stages: Stage[], orderedIds: string[]): Promise<void> {
  const updates: Array<Promise<Stage>> = [];
  orderedIds.forEach((id, index) => {
    const stage = stages.find((item) => item.id === id);
    const position = index + 1;
    if (stage && stage.position !== position) {
      updates.push(updateStage(id, { position }));
    }
  });
  await Promise.all(updates);
}

/** User-facing copy stays Vietnamese; unknown codes fall back to the server message. */
export function pipelineErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'PIPELINE_NAME_DUPLICATED':
        return 'Tên quy trình đã tồn tại.';
      case 'STAGE_NAME_DUPLICATED':
        return 'Tên stage đã tồn tại trong quy trình này.';
      case 'PIPELINE_HAS_DEALS':
        return 'Quy trình còn deal, hãy chuyển hoặc xoá deal trước.';
      case 'STAGE_HAS_DEALS':
        return 'Stage còn deal, hãy chuyển hoặc xoá deal trước.';
      case 'LAST_STAGE':
        return 'Quy trình phải còn ít nhất một stage.';
      case 'WON_STAGE_REQUIRED':
        return 'Mỗi quy trình phải giữ đúng một stage thắng.';
      case 'LOST_STAGE_REQUIRED':
        return 'Mỗi quy trình phải giữ đúng một stage thua.';
      case 'PIPELINE_NOT_FOUND':
        return 'Quy trình không còn tồn tại.';
      case 'STAGE_NOT_FOUND':
        return 'Stage không còn tồn tại.';
      case 'VALIDATION_ERROR':
        return 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.';
      default:
        return error.message;
    }
  }
  return fallback;
}
