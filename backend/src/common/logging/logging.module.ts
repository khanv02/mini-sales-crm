import { DynamicModule, Global, Module } from '@nestjs/common';
import { createLogger, type Logger } from './logger';
import type { Env } from '../config/env';

export const LOGGER_TOKEN = 'PULSE_LOGGER';

@Global()
@Module({})
export class LoggingModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: LoggingModule,
      providers: [{ provide: LOGGER_TOKEN, useValue: createLogger(env) }],
      exports: [LOGGER_TOKEN],
    };
  }
}

export type { Logger };
