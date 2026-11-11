import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from './authenticated-user';
import { PrincipalRepository } from './principal.repository';

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  principal: AuthenticatedUser | null;
  expiresAt: number;
}

/**
 * 30s in-process cache in front of the principal lookup so a burst of requests
 * does not hit the database per call.
 *
 * The cache is invalidated whenever the user row changes (`UsersService`), so a
 * role change or a deactivation takes effect on the **next request** in this
 * process (AC-FR02.4). With several API instances the worst case is one 30s
 * window, which is the delay documented in `specs/002-identity-access/plan.md`.
 */
@Injectable()
export class PrincipalService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly repository: PrincipalRepository) {}

  async load(userId: string): Promise<AuthenticatedUser | null> {
    const cached = this.cache.get(userId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.principal;
    }

    const principal = await this.repository.findById(userId);
    this.cache.set(userId, { principal, expiresAt: now + CACHE_TTL_MS });
    return principal;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  clear(): void {
    this.cache.clear();
  }
}
