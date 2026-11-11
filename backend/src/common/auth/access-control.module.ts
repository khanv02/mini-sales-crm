import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrincipalRepository } from './principal.repository';
import { PrincipalService } from './principal.service';
import { RolesGuard } from './roles.guard';
import { TokenService } from './token.service';

/**
 * Authentication/authorization primitives shared by every feature module:
 * access-token mechanics, the database-backed principal, and the guards that
 * turn them into `@Roles(...)` / `@CurrentUser()`.
 */
@Global()
@Module({
  providers: [TokenService, PrincipalRepository, PrincipalService, JwtAuthGuard, RolesGuard],
  exports: [TokenService, PrincipalRepository, PrincipalService, JwtAuthGuard, RolesGuard],
})
export class AccessControlModule {}
