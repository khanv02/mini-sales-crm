import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  userCreateSchema,
  userListQuerySchema,
  userUpdateSchema,
  uuidSchema,
  type AuthUser,
  type UserCreateRequest,
  type UserListQuery,
  type UserListResponse,
  type UserUpdateRequest,
} from '@pulse/shared';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query(new ZodValidationPipe(userListQuerySchema)) query: UserListQuery): Promise<UserListResponse> {
    return this.users.list(actor.orgId, query);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(userCreateSchema)) body: UserCreateRequest,
    @Req() request: Request,
  ): Promise<AuthUser> {
    return this.users.create(actor, body, { ip: request.ip });
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) targetId: string,
    @Body(new ZodValidationPipe(userUpdateSchema)) body: UserUpdateRequest,
    @Req() request: Request,
  ): Promise<AuthUser> {
    return this.users.update(actor, targetId, body, { ip: request.ip });
  }
}
