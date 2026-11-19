import { Injectable } from '@nestjs/common';
import type {
  Pipeline as PipelineResponse,
  PipelineCreateRequest,
  PipelineUpdateRequest,
  Stage as StageResponse,
  StageCreateRequest,
  StageUpdateRequest,
} from '@pulse/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AppError, ERROR_CODES } from '../../common/errors/app-error';
import { isUniqueConstraintViolation } from '../../common/errors/prisma-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { pipelineAuditSnapshot, stageAuditSnapshot, toPipeline, toStage } from './pipeline.mapper';
import {
  PipelineRepository,
  type PrismaLike,
  type StageCreateData,
  type StageUpdateData,
} from './pipeline.repository';

export interface PipelineMutationMeta {
  ip?: string;
}

function pipelineNotFound(): AppError {
  return new AppError(ERROR_CODES.PIPELINE_NOT_FOUND, 404, 'Pipeline not found.');
}

function stageNotFound(): AppError {
  return new AppError(ERROR_CODES.STAGE_NOT_FOUND, 404, 'Stage not found.');
}

function pipelineNameDuplicated(): AppError {
  return new AppError(
    ERROR_CODES.PIPELINE_NAME_DUPLICATED,
    409,
    'A pipeline with this name already exists.',
  );
}

function stageNameDuplicated(): AppError {
  return new AppError(ERROR_CODES.STAGE_NAME_DUPLICATED, 409, 'A stage with this name already exists.');
}

function wonStageRequired(): AppError {
  return new AppError(
    ERROR_CODES.WON_STAGE_REQUIRED,
    409,
    'A pipeline must keep exactly one won stage.',
  );
}

function lostStageRequired(): AppError {
  return new AppError(
    ERROR_CODES.LOST_STAGE_REQUIRED,
    409,
    'A pipeline must keep exactly one lost stage.',
  );
}

/** Pipeline/stage administration (FR-04). Reads are open to every role; writes are Admin-only. */
@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelines: PipelineRepository,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthenticatedUser): Promise<PipelineResponse[]> {
    const pipelines = await this.pipelines.list(actor.orgId);
    return pipelines.map(toPipeline);
  }

  async create(
    actor: AuthenticatedUser,
    body: PipelineCreateRequest,
    meta: PipelineMutationMeta = {},
  ): Promise<PipelineResponse> {
    this.assertStageNamesUnique(body.stages ?? []);
    this.assertSingleTerminalStage(body.stages ?? []);
    this.assertTerminalStagesPresent(body.stages ?? []);

    const stages: StageCreateData[] = (body.stages ?? []).map((stage, index) => ({
      name: stage.name,
      position: stage.position ?? index + 1,
      isWon: stage.isWon ?? false,
      isLost: stage.isLost ?? false,
    }));

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (await this.pipelines.pipelineNameExists(tx, actor.orgId, body.name)) {
          throw pipelineNameDuplicated();
        }

        const pipeline = await this.pipelines.create(tx, { orgId: actor.orgId, name: body.name, stages });
        await this.audit.recordPipeline(tx, {
          orgId: actor.orgId,
          actorId: actor.userId,
          entityId: pipeline.id,
          action: 'PIPELINE_CREATED',
          after: pipelineAuditSnapshot(pipeline),
          ip: meta.ip,
        });
        return toPipeline(pipeline);
      });
    } catch (error) {
      throw this.mapWriteError(error, pipelineNameDuplicated());
    }
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    body: PipelineUpdateRequest,
    meta: PipelineMutationMeta = {},
  ): Promise<PipelineResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await this.pipelines.findById(tx, actor.orgId, id);
        if (!existing) {
          throw pipelineNotFound();
        }
        if (await this.pipelines.pipelineNameExists(tx, actor.orgId, body.name, id)) {
          throw pipelineNameDuplicated();
        }

        const updated = await this.pipelines.updateName(tx, actor.orgId, id, body.name);
        if (!updated) {
          throw pipelineNotFound();
        }

        await this.audit.recordPipeline(tx, {
          orgId: actor.orgId,
          actorId: actor.userId,
          entityId: id,
          action: 'PIPELINE_UPDATED',
          before: pipelineAuditSnapshot(existing),
          after: pipelineAuditSnapshot(updated),
          ip: meta.ip,
        });
        return toPipeline(updated);
      });
    } catch (error) {
      throw this.mapWriteError(error, pipelineNameDuplicated());
    }
  }

  async remove(actor: AuthenticatedUser, id: string, meta: PipelineMutationMeta = {}): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await this.pipelines.findById(tx, actor.orgId, id);
      if (!existing) {
        throw pipelineNotFound();
      }
      if ((await this.pipelines.countDeals(tx, actor.orgId, { pipelineId: id })) > 0) {
        throw new AppError(
          ERROR_CODES.PIPELINE_HAS_DEALS,
          409,
          'Move or delete the deals in this pipeline first.',
        );
      }

      await this.pipelines.delete(tx, actor.orgId, id);
      await this.audit.recordPipeline(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        entityId: id,
        action: 'PIPELINE_DELETED',
        before: pipelineAuditSnapshot(existing),
        ip: meta.ip,
      });
    });
  }

  async createStage(
    actor: AuthenticatedUser,
    pipelineId: string,
    body: StageCreateRequest,
    meta: PipelineMutationMeta = {},
  ): Promise<StageResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const pipeline = await this.pipelines.findById(tx, actor.orgId, pipelineId);
        if (!pipeline) {
          throw pipelineNotFound();
        }
        if (await this.pipelines.stageNameExists(tx, pipelineId, body.name)) {
          throw stageNameDuplicated();
        }
        if (body.isWon && (await this.pipelines.findWonStage(tx, pipelineId))) {
          throw wonStageRequired();
        }
        if (body.isLost && (await this.pipelines.findLostStage(tx, pipelineId))) {
          throw lostStageRequired();
        }

        const stage = await this.pipelines.createStage(tx, actor.orgId, pipelineId, {
          name: body.name,
          position: body.position ?? (await this.pipelines.nextStagePosition(tx, pipelineId)),
          isWon: body.isWon ?? false,
          isLost: body.isLost ?? false,
        });

        await this.audit.recordStage(tx, {
          orgId: actor.orgId,
          actorId: actor.userId,
          entityId: stage.id,
          action: 'STAGE_CREATED',
          after: stageAuditSnapshot(stage),
          ip: meta.ip,
        });
        return toStage(stage);
      });
    } catch (error) {
      const fallback = body.isWon ? wonStageRequired() : body.isLost ? lostStageRequired() : stageNameDuplicated();
      throw this.mapWriteError(error, fallback);
    }
  }

  async updateStage(
    actor: AuthenticatedUser,
    id: string,
    body: StageUpdateRequest,
    meta: PipelineMutationMeta = {},
  ): Promise<StageResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await this.pipelines.findStage(tx, actor.orgId, id);
        if (!existing) {
          throw stageNotFound();
        }
        if (body.name !== undefined && (await this.pipelines.stageNameExists(tx, existing.pipelineId, body.name, id))) {
          throw stageNameDuplicated();
        }
        await this.assertTerminalStageChange(tx, existing, body);

        const data: StageUpdateData = {};
        if (body.name !== undefined) data.name = body.name;
        if (body.position !== undefined) data.position = body.position;
        if (body.isWon !== undefined) data.isWon = body.isWon;
        if (body.isLost !== undefined) data.isLost = body.isLost;

        const updated = await this.pipelines.updateStage(tx, actor.orgId, id, data);
        if (!updated) {
          throw stageNotFound();
        }

        await this.audit.recordStage(tx, {
          orgId: actor.orgId,
          actorId: actor.userId,
          entityId: id,
          action: 'STAGE_UPDATED',
          before: stageAuditSnapshot(existing),
          after: stageAuditSnapshot(updated),
          ip: meta.ip,
        });
        return toStage(updated);
      });
    } catch (error) {
      const fallback =
        body.name !== undefined
          ? stageNameDuplicated()
          : body.isWon !== undefined
            ? wonStageRequired()
            : body.isLost !== undefined
              ? lostStageRequired()
              : new AppError(ERROR_CODES.CONFLICT, 409, 'The stage conflicts with the current pipeline.');
      throw this.mapWriteError(error, fallback);
    }
  }

  /**
   * Delete guards, in order: the pipeline keeps at least one stage, then its won/lost stage,
   * and only then do deals block the delete (AC-FR04-03, AC-FR04-04).
   */
  async removeStage(actor: AuthenticatedUser, id: string, meta: PipelineMutationMeta = {}): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await this.pipelines.findStage(tx, actor.orgId, id);
      if (!existing) {
        throw stageNotFound();
      }
      if ((await this.pipelines.countStages(tx, existing.pipelineId)) <= 1) {
        throw new AppError(ERROR_CODES.LAST_STAGE, 409, 'A pipeline must keep at least one stage.');
      }
      if (existing.isWon) {
        throw wonStageRequired();
      }
      if (existing.isLost) {
        throw lostStageRequired();
      }
      if ((await this.pipelines.countDeals(tx, actor.orgId, { stageId: id })) > 0) {
        throw new AppError(ERROR_CODES.STAGE_HAS_DEALS, 409, 'Move or delete the deals in this stage first.');
      }

      await this.pipelines.deleteStage(tx, actor.orgId, id);
      await this.audit.recordStage(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        entityId: id,
        action: 'STAGE_DELETED',
        before: stageAuditSnapshot(existing),
        ip: meta.ip,
      });
    });
  }

  /** At most one won and one lost stage per pipeline, including when they are created together. */
  private assertSingleTerminalStage(stages: Array<{ isWon?: boolean; isLost?: boolean }>): void {
    if (stages.filter((stage) => stage.isWon).length > 1) {
      throw wonStageRequired();
    }
    if (stages.filter((stage) => stage.isLost).length > 1) {
      throw lostStageRequired();
    }
  }

  /**
   * A pipeline is unusable without a won and a lost stage: no deal in it can ever be closed. The
   * database enforces "at most one", so the "at least one" half lives here (G4).
   */
  private assertTerminalStagesPresent(stages: Array<{ isWon?: boolean; isLost?: boolean }>): void {
    if (!stages.some((stage) => stage.isWon)) {
      throw wonStageRequired();
    }
    if (!stages.some((stage) => stage.isLost)) {
      throw lostStageRequired();
    }
  }

  private assertStageNamesUnique(stages: Array<{ name: string }>): void {
    const seen = new Set<string>();
    for (const stage of stages) {
      const key = stage.name.toLocaleLowerCase();
      if (seen.has(key)) {
        throw stageNameDuplicated();
      }
      seen.add(key);
    }
  }

  /** A stage may not take a flag another stage owns, and the current won/lost stage may not lose it. */
  private async assertTerminalStageChange(
    tx: PrismaLike,
    stage: { id: string; pipelineId: string; isWon: boolean; isLost: boolean },
    body: StageUpdateRequest,
  ): Promise<void> {
    if (body.isWon === true && !stage.isWon) {
      if (await this.pipelines.findWonStage(tx, stage.pipelineId, stage.id)) {
        throw wonStageRequired();
      }
    }
    if (body.isWon === false && stage.isWon) {
      throw wonStageRequired();
    }
    if (body.isLost === true && !stage.isLost) {
      if (await this.pipelines.findLostStage(tx, stage.pipelineId, stage.id)) {
        throw lostStageRequired();
      }
    }
    if (body.isLost === false && stage.isLost) {
      throw lostStageRequired();
    }
  }

  /** Unique-constraint races surface as the documented 409 instead of a raw Prisma error. */
  private mapWriteError(error: unknown, fallback: AppError): unknown {
    return isUniqueConstraintViolation(error) ? fallback : error;
  }
}
