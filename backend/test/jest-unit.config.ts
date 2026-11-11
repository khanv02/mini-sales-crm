import type { Config } from 'jest';

const config: Config = {
  rootDir: '..',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/unit'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  collectCoverageFrom: [
    'src/common/health/health.service.ts',
    'src/common/config/env.ts',
    'src/common/queue/queue.config.ts',
    'src/common/audit/audit.service.ts',
    'src/common/auth/principal.service.ts',
    'src/common/auth/roles.guard.ts',
    'src/common/auth/jwt-auth.guard.ts',
    'src/common/auth/token.service.ts',
    'src/common/errors/prisma-errors.ts',
    'src/common/pagination/cursor.ts',
    'src/common/rate-limit/login-rate-limit.service.ts',
    'src/common/security/password.service.ts',
    'src/common/validation/zod-validation.pipe.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};

export default config;
