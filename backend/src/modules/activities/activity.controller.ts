import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  activityCreateSchema,
  activityListQuerySchema,
  activityUpdateSchema,
  uuidSchema,
  type Activity,
  type ActivityCreateRequest,
  type ActivityListQuery,
  type ActivityListResponse,
  type ActivityUpdateRequest,
} from '@pulse/shared';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { ActivitiesService } from './activity.service';

/** Timeline and activity edits are available to every role; Sales only for their own deals (FR-07.7). */
@ApiTags('activities')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get('deals/:id/activities')
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) dealId: string,
    @Query(new ZodValidationPipe(activityListQuerySchema)) query: ActivityListQuery,
  ): Promise<ActivityListResponse> {
    return this.activities.list(actor, dealId, query);
  }

  @Post('deals/:id/activities')
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) dealId: string,
    @Body(new ZodValidationPipe(activityCreateSchema)) body: ActivityCreateRequest,
    @Req() request: Request,
  ): Promise<Activity> {
    return this.activities.create(actor, dealId, body, { ip: request.ip });
  }

  @Patch('activities/:id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(activityUpdateSchema)) body: ActivityUpdateRequest,
    @Req() request: Request,
  ): Promise<Activity> {
    return this.activities.update(actor, id, body, { ip: request.ip });
  }
}
