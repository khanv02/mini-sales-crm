import { Injectable } from '@nestjs/common';
import { Prisma, type Pipeline, type Stage } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export type PrismaLike = Prisma.TransactionClient | PrismaService;

export type PipelineWithStages = Pipeline & { stages: Stage[] };

export interface StageCreateData {
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
}

export type StageUpdateData = Partial<StageCreateData>;

const stageOrder = [{ position: 'asc' as const }, { id: 'asc' as const }];

/** Every method takes `orgId` from the caller's principal (C3); pipeline writes are Admin-only. */
@Injectable()
export class PipelineRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string): Promise<PipelineWithStages[]> {
    return this.prisma.pipeline.findMany({
      where: { orgId },
      include: { stages: { orderBy: stageOrder } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async findById(tx: PrismaLike, orgId: string, id: string): Promise<Pipeline | null> {
    return tx.pipeline.findFirst({ where: { orgId, id } });
  }

  async findByIdWithStages(tx: PrismaLike, orgId: string, id: string): Promise<PipelineWithStages | null> {
    return tx.pipeline.findFirst({ where: { orgId, id }, include: { stages: { orderBy: stageOrder } } });
  }

  /** Case-insensitive: the DB unique index is `(org_id, lower(name))`. */
  async pipelineNameExists(tx: PrismaLike, orgId: string, name: string, excludeId?: string): Promise<boolean> {
    const found = await tx.pipeline.findFirst({
      where: {
        orgId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return found !== null;
  }

  async create(
    tx: PrismaLike,
    data: { orgId: string; name: string; stages: StageCreateData[] },
  ): Promise<PipelineWithStages> {
    const pipeline = await tx.pipeline.create({ data: { orgId: data.orgId, name: data.name } });
    if (data.stages.length > 0) {
      await Promise.all(
        data.stages.map((stage) =>
          tx.stage.create({ data: { orgId: data.orgId, pipelineId: pipeline.id, ...stage } }),
        ),
      );
    }
    return tx.pipeline.findFirstOrThrow({
      where: { id: pipeline.id, orgId: data.orgId },
      include: { stages: { orderBy: stageOrder } },
    });
  }

  async updateName(tx: PrismaLike, orgId: string, id: string, name: string): Promise<PipelineWithStages | null> {
    const result = await tx.pipeline.updateMany({ where: { orgId, id }, data: { name } });
    if (result.count === 0) {
      return null;
    }
    return tx.pipeline.findFirst({ where: { orgId, id }, include: { stages: { orderBy: stageOrder } } });
  }

  async delete(tx: PrismaLike, orgId: string, id: string): Promise<number> {
    const result = await tx.pipeline.deleteMany({ where: { orgId, id } });
    return result.count;
  }

  async countDeals(tx: PrismaLike, orgId: string, filter: { pipelineId: string } | { stageId: string }): Promise<number> {
    return tx.deal.count({ where: { orgId, ...filter } });
  }

  async findStage(tx: PrismaLike, orgId: string, id: string): Promise<Stage | null> {
    return tx.stage.findFirst({ where: { orgId, id } });
  }

  /** Case-insensitive: the DB unique index is `(pipeline_id, lower(name))`. */
  async stageNameExists(
    tx: PrismaLike,
    pipelineId: string,
    name: string,
    excludeId?: string,
  ): Promise<boolean> {
    const found = await tx.stage.findFirst({
      where: {
        pipelineId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return found !== null;
  }

  async countStages(tx: PrismaLike, pipelineId: string): Promise<number> {
    return tx.stage.count({ where: { pipelineId } });
  }

  /** Next position for an appended stage: `max(position) + 1`, starting at 1. */
  async nextStagePosition(tx: PrismaLike, pipelineId: string): Promise<number> {
    const result = await tx.stage.aggregate({ where: { pipelineId }, _max: { position: true } });
    return Number(result._max.position ?? 0) + 1;
  }

  async findWonStage(tx: PrismaLike, pipelineId: string, excludeStageId?: string): Promise<Stage | null> {
    return tx.stage.findFirst({
      where: { pipelineId, isWon: true, ...(excludeStageId ? { id: { not: excludeStageId } } : {}) },
    });
  }

  async findLostStage(tx: PrismaLike, pipelineId: string, excludeStageId?: string): Promise<Stage | null> {
    return tx.stage.findFirst({
      where: { pipelineId, isLost: true, ...(excludeStageId ? { id: { not: excludeStageId } } : {}) },
    });
  }

  async createStage(tx: PrismaLike, orgId: string, pipelineId: string, data: StageCreateData): Promise<Stage> {
    return tx.stage.create({ data: { orgId, pipelineId, ...data } });
  }

  async updateStage(
    tx: PrismaLike,
    orgId: string,
    id: string,
    data: StageUpdateData,
  ): Promise<Stage | null> {
    const result = await tx.stage.updateMany({ where: { orgId, id }, data });
    if (result.count === 0) {
      return null;
    }
    return tx.stage.findFirst({ where: { orgId, id } });
  }

  async deleteStage(tx: PrismaLike, orgId: string, id: string): Promise<number> {
    const result = await tx.stage.deleteMany({ where: { orgId, id } });
    return result.count;
  }
}
