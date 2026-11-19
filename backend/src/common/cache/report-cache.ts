import { Injectable } from '@nestjs/common';

export const REPORT_CACHE = 'PULSE_REPORT_CACHE';

/** FR-08.5: dashboard payloads are cached for 60 seconds. */
export const REPORT_CACHE_TTL_SECONDS = 60;

/**
 * Cache seam for the dashboard (T315). Feature 004 ships the no-op; feature 007 replaces the provider with
 * Redis and uses `invalidateOrg` from the contact/deal write paths.
 */
export interface ReportCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** Invalidation hook reserved for 007: drop every report entry of an organization. */
  invalidateOrg(orgId: string): Promise<void>;
}

@Injectable()
export class NoopReportCache implements ReportCache {
  async get<T>(_key: string): Promise<T | null> {
    return null;
  }

  async set<T>(_key: string, _value: T, _ttlSeconds: number): Promise<void> {
    // Feature 004 never caches; 007 implements the Redis-backed provider.
  }

  async invalidateOrg(_orgId: string): Promise<void> {
    // No-op until 007 wires the cache invalidation hook.
  }
}
