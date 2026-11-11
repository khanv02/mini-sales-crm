import { DynamicModule, Global, Module } from '@nestjs/common';
import type { Env } from './env';

export const ENV_TOKEN = 'PULSE_ENV';

@Global()
@Module({})
export class EnvModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: EnvModule,
      providers: [{ provide: ENV_TOKEN, useValue: env }],
      exports: [ENV_TOKEN],
    };
  }
}
