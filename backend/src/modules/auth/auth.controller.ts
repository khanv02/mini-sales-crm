import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  type AuthResponse,
  type AuthUser,
  type LoginRequest,
  type RefreshRequest,
  type RegisterRequest,
} from '@pulse/shared';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TokenService } from '../../common/auth/token.service';
import { ENV_TOKEN } from '../../common/config/env.module';
import type { Env } from '../../common/config/env';
import { AppError, ERROR_CODES } from '../../common/errors/app-error';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AuthService, type IssuedSession, type RequestMeta } from './auth.service';
import { buildClearedRefreshCookie, buildRefreshCookie, readRefreshCookie } from './cookie';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  private meta(request: Request): RequestMeta {
    return {
      ip: request.ip ?? '0.0.0.0',
      userAgent: request.get('user-agent') ?? undefined,
    };
  }

  /** The cookie is not `Secure` in development/test so http://localhost works (ADR-015). */
  private sendRefreshCookie(response: Response, session: IssuedSession): void {
    response.setHeader(
      'Set-Cookie',
      buildRefreshCookie(session.refreshToken, {
        maxAgeSeconds: this.tokens.refreshTokenTtlSeconds,
        secure: this.env.NODE_ENV === 'production',
      }),
    );
  }

  private refreshTokenFrom(request: Request, body: RefreshRequest): string {
    const fromCookie = readRefreshCookie(request.headers.cookie);
    const token = fromCookie ?? body.refreshToken;
    if (!token) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 401, 'Authentication is required.');
    }
    return token;
  }

  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.register(body, this.meta(request));
    this.sendRefreshCookie(response, session);
    return session.response;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.login(body, this.meta(request));
    this.sendRefreshCookie(response, session);
    return session.response;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.refresh(this.refreshTokenFrom(request, body), this.meta(request));
    this.sendRefreshCookie(response, session);
    return session.response;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.refreshTokenFrom(request, body));
    response.setHeader(
      'Set-Cookie',
      buildClearedRefreshCookie({ secure: this.env.NODE_ENV === 'production' }),
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() principal: AuthenticatedUser): Promise<AuthUser> {
    return this.auth.me(principal);
  }
}
