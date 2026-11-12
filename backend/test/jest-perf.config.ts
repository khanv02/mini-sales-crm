import type { Config } from 'jest';

/**
 * Manual/nightly performance suite (NFR-01). Kept out of the default CI run:
 * ts-jest is required because the Nest DI container needs `emitDecoratorMetadata`.
 */
const config: Config = {
  rootDir: '..',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/perf'],
  testMatch: ['**/*.perf.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/test/setup/env.ts'],
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  testTimeout: 600_000,
  maxWorkers: 1,
};

export default config;
