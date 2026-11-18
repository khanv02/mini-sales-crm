import type { Pipeline as PipelineModel, Stage as StageModel } from '@prisma/client';
import type { Pipeline, Stage } from '@pulse/shared';

/** API projection of a stage (docs/api/openapi.yaml `Stage`); `DECIMAL(20,10)` becomes a number. */
export function toStage(stage: StageModel): Stage {
  return {
    id: stage.id,
    orgId: stage.orgId,
    pipelineId: stage.pipelineId,
    name: stage.name,
    position: Number(stage.position),
    isWon: stage.isWon,
    isLost: stage.isLost,
  };
}

/** API projection of a pipeline with its stages in board order. */
export function toPipeline(pipeline: PipelineModel & { stages: StageModel[] }): Pipeline {
  return {
    id: pipeline.id,
    orgId: pipeline.orgId,
    name: pipeline.name,
    stages: pipeline.stages.map(toStage),
  };
}

/** Audit snapshot of the fields an Admin can change (FR-04). */
export function stageAuditSnapshot(
  stage: Pick<StageModel, 'name' | 'position' | 'isWon' | 'isLost'>,
): Record<string, unknown> {
  return {
    name: stage.name,
    position: Number(stage.position),
    isWon: stage.isWon,
    isLost: stage.isLost,
  };
}

/** Audit snapshot of a pipeline; stage creation rides along on `PIPELINE_CREATED`. */
export function pipelineAuditSnapshot(
  pipeline: PipelineModel & { stages?: StageModel[] },
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = { name: pipeline.name };
  if (pipeline.stages) {
    snapshot.stages = pipeline.stages.map((stage) => ({ name: stage.name, position: Number(stage.position) }));
  }
  return snapshot;
}
