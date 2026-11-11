import { Module } from '@nestjs/common';
import { LoginRateLimitService } from '../../common/rate-limit/login-rate-limit.service';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, LoginRateLimitService],
  exports: [AuthService],
})
export class AuthModule {}
