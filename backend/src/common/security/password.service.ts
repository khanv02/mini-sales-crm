import { Inject, Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import { ENV_TOKEN } from '../config/env.module';
import type { Env } from '../config/env';

/**
 * Argon2id parameters (FR-01.2): memory 64MB, iterations 3, parallelism 1.
 * Tests and CI use cheaper parameters - the algorithm and the "never store
 * plaintext" guarantee are identical, which is what the ACs assert.
 */
const PRODUCTION_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

const TEST_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 8_192,
  timeCost: 1,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  private readonly options: typeof PRODUCTION_OPTIONS | typeof TEST_OPTIONS;

  constructor(@Inject(ENV_TOKEN) env: Env) {
    this.options = env.NODE_ENV === 'test' ? TEST_OPTIONS : PRODUCTION_OPTIONS;
  }

  hash(plain: string): Promise<string> {
    return hash(plain, this.options);
  }

  async matches(hashValue: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashValue, plain, { algorithm: Algorithm.Argon2id });
    } catch {
      // A malformed stored hash must never authenticate anyone.
      return false;
    }
  }
}
