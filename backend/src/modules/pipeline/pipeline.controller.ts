import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  pipelineCreateSchema,
  pipelineUpdateSchema,
  stageCreateSchema,
  stageUpdateSchema,
  uuidSchema,
  type Pipeline,
  type PipelineCreateRequest,
  type PipelineUpdateRequest,
  type Stage,
  type StageCreateRequest,
  type StageUpdateRequest,
} from '@pulse/shared';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { PipelineService } from './pipeline.service';

/** `GET /pipelines` is readable by every role; every write is Admin-only (FR-04.4). */
@ApiTags('Pipelines')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PipelineController {
  constructor(private readonly pipelines: PipelineService) {}

  @Get('pipelines')
  list(@CurrentUser() actor: AuthenticatedUser): Promise<Pipeline[]> {
    return this.pipelines.list(actor);
  }

  @Post('pipelines')
  @Roles('ADMIN')
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(pipelineCreateSchema)) body: PipelineCreateRequest,
    @Req() request: Request,
  ): Promise<Pipeline> {
    return this.pipelines.create(actor, body, { ip: request.ip });
  }

  @Patch('pipelines/:id')
  @Roles('ADMIN')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(pipelineUpdateSchema)) body: PipelineUpdateRequest,
    @Req() request: Request,
  ): Promise<Pipeline> {
    return this.pipelines.update(actor, id, body, { ip: request.ip });
  }

  @Delete('pipelines/:id')
  @HttpCode(204)
  @Roles('ADMIN')
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.pipelines.remove(actor, id, { ip: request.ip });
  }

  @Post('pipelines/:id/stages')
  @Roles('ADMIN')
  createStage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) pipelineId: string,
    @Body(new ZodValidationPipe(stageCreateSchema)) body: StageCreateRequest,
    @Req() request: Request,
  ): Promise<Stage> {
    return this.pipelines.createStage(actor, pipelineId, body, { ip: request.ip });
  }

  @Patch('stages/:id')
  @Roles('ADMIN')
  updateStage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(stageUpdateSchema)) body: StageUpdateRequest,
    @Req() request: Request,
  ): Promise<Stage> {
    return this.pipelines.updateStage(actor, id, body, { ip: request.ip });
  }

  @Delete('stages/:id')
  @HttpCode(204)
  @Roles('ADMIN')
  removeStage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.pipelines.removeStage(actor, id, { ip: request.ip });
  }
}
