import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError, ERROR_CODES } from '../errors/app-error';
import type { AuthenticatedUser } from './authenticated-user';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/** Injects the tenant context produced by `JwtAuthGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 401, 'Authentication is required.');
    }
    return request.user;
  },
);
