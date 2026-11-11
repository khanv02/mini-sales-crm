import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import { AppError, ERROR_CODES } from '../errors/app-error';
import type { AuthenticatedRequest } from './current-user.decorator';
import { ROLES_KEY } from './roles.decorator';

/** 403 when the caller's current role is not in the `@Roles(...)` list. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 401, 'Authentication is required.');
    }
    if (!required.includes(user.role)) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 403, 'You do not have permission to perform this action.');
    }

    return true;
  }
}
