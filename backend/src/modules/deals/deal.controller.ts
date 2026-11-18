import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  dealAssignSchema,
  dealCreateSchema,
  dealListQuerySchema,
  dealMoveSchema,
  dealUpdateSchema,
  uuidSchema,
  type Deal,
  type DealAssignRequest,
  type DealCreateRequest,
  type DealListQuery,
  type DealListResponse,
  type DealMoveRequest,
  type DealUpdateRequest,
} from '@pulse/shared';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { DealsService } from './deal.service';

/** Deals are readable/writable by every role; Sales only see their own (FR-05.6). */
@ApiTags('Deals')
@ApiBearerAuth()
@Controller('deals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(dealListQuerySchema)) query: DealListQuery,
  ): Promise<DealListResponse> {
    return this.deals.list(actor, query);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(dealCreateSchema)) body: DealCreateRequest,
    @Req() request: Request,
  ): Promise<Deal> {
    return this.deals.create(actor, body, { ip: request.ip });
  }

  @Get(':id')
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<Deal> {
    return this.deals.get(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(dealUpdateSchema)) body: DealUpdateRequest,
    @Req() request: Request,
  ): Promise<Deal> {
    return this.deals.update(actor, id, body, { ip: request.ip });
  }

  @Patch(':id/move')
  move(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(dealMoveSchema)) body: DealMoveRequest,
    @Req() request: Request,
  ): Promise<Deal> {
    return this.deals.move(actor, id, body, { ip: request.ip });
  }

  @Patch(':id/assign')
  @Roles('MANAGER', 'ADMIN')
  assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(dealAssignSchema)) body: DealAssignRequest,
    @Req() request: Request,
  ): Promise<Deal> {
    return this.deals.assign(actor, id, body, { ip: request.ip });
  }
}
