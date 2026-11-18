import { randomUUID } from 'node:crypto';
import type { Pipeline, Stage } from '@prisma/client';
import { prisma } from './prisma';

export type PipelineWithStages = Pipeline & { stages: Stage[] };

export async function createStage(input: {
  orgId: string;
  pipelineId: string;
  name?: string;
  position?: number;
  isWon?: boolean;
  isLost?: boolean;
}): Promise<Stage> {
  return prisma.stage.create({
    data: {
      orgId: input.orgId,
      pipelineId: input.pipelineId,
      name: input.name ?? `Stage ${randomUUID().slice(0, 8)}`,
      position: input.position ?? 1,
      isWon: input.isWon ?? false,
      isLost: input.isLost ?? false,
    },
  });
}

export async function createPipeline(input: {
  orgId: string;
  name?: string;
  stages?: Array<{ name?: string; position?: number; isWon?: boolean; isLost?: boolean }>;
}): Promise<PipelineWithStages> {
  return prisma.pipeline.create({
    data: {
      organization: { connect: { id: input.orgId } },
      name: input.name ?? `Pipeline ${randomUUID().slice(0, 8)}`,
      stages: input.stages?.length
        ? {
            create: input.stages.map((stage, index) => ({
              organization: { connect: { id: input.orgId } },
              name: stage.name ?? `Stage ${index + 1}`,
              position: stage.position ?? index + 1,
              isWon: stage.isWon ?? false,
              isLost: stage.isLost ?? false,
            })),
          }
        : undefined,
    },
    include: { stages: { orderBy: { position: 'asc' } } },
  });
}
