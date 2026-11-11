import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { AppError, ERROR_CODES } from '../errors/app-error';
import { updateRequestContext } from '../logging/request-context';
import type { AuthenticatedRequest } from './current-user.decorator';
import { PrincipalService } from './principal.service';
import { TokenService } from './token.service';

const BEARER_PATTERN = /^bearer\s+(\S+)$/i;

export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const match = BEARER_PATTERN.exec(header.trim());
  return match?.[1];
}

/**
 * Verifies the access token and re-reads the caller's role/active state
 * (30s cache) so a deactivated account or a role change is not honoured for
 * longer than the documented window.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly principals: PrincipalService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 401, 'Authentication is required.');
    }

    const claims = this.tokens.verifyAccessToken(token);
    const principal = await this.principals.load(claims.sub);

    if (!principal) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 401, 'Authentication is required.');
    }
    if (!principal.active) {
      throw new AppError(ERROR_CODES.USER_INACTIVE, 401, 'This account has been deactivated.');
    }

    request.user = principal;
    updateRequestContext({ userId: principal.userId, orgId: principal.orgId });
    return true;
  }
}
