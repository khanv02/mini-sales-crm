import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ReportSummary, ReportSummaryQuery } from '@pulse/shared';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  REPORT_CACHE,
  REPORT_CACHE_TTL_SECONDS,
  type ReportCache,
} from '../../common/cache/report-cache';
import { ReportRepository } from './report.repository';
import { resolveReportRange, type ResolvedReportRange } from './report-range';

/** Cache namespace version; feature 007 replaces the no-op cache that consumes it. */
const REPORT_DATA_VERSION = '1';

interface CacheKeyInput {
  orgId: string;
  role: string;
  ownerId?: string;
  pipelineId?: string;
  range: ResolvedReportRange;
}

/**
 * Dashboard summary (FR-08.2/08.3): the official SCR-011 formulas, a 366-day range in the organization
 * timezone, and Sales forced to their own owner scope. The 60s cache is a pass-through until 007.
 */
@Injectable()
export class ReportService {
  constructor(
    private readonly repository: ReportRepository,
    @Inject(REPORT_CACHE) private readonly cache: ReportCache,
  ) {}

  async summary(actor: AuthenticatedUser, query: ReportSummaryQuery): Promise<ReportSummary> {
    const timezone = await this.repository.findOrgTimezone(actor.orgId);
    const range = resolveReportRange(query, timezone);
    const ownerId = actor.role === 'SALES' ? actor.userId : query.ownerId;

    const filters = {
      orgId: actor.orgId,
      from: range.fromInstant,
      to: range.toInstant,
      ownerId,
      pipelineId: query.pipelineId,
    };

    const cacheKey = this.cacheKey({
      orgId: actor.orgId,
      role: actor.role,
      ownerId,
      pipelineId: query.pipelineId,
      range,
    });
    const cached = await this.cache.get<ReportSummary>(cacheKey);
    if (cached) {
      return cached;
    }

    const [newLeads, dealsByStage, pipelineValue, winLoss, forecastByMonth] = await Promise.all([
      this.repository.countNewLeads(filters),
      this.repository.dealsByStage(filters),
      this.repository.pipelineValue(filters),
      this.repository.winLoss(filters),
      this.repository.forecastByMonth(filters, range.from),
    ]);

    const closed = winLoss.won + winLoss.lost;
    const summary: ReportSummary = {
      range: { from: range.from, to: range.to, timezone },
      newLeads,
      dealsByStage,
      pipelineValue,
      // No closed deals -> 0, never a division by zero (AC-FR08-04).
      winRate: closed === 0 ? 0 : winLoss.won / closed,
      forecastByMonth,
      generatedAt: new Date().toISOString(),
      cached: false,
    };

    await this.cache.set(cacheKey, summary, REPORT_CACHE_TTL_SECONDS);
    return summary;
  }

  private cacheKey(input: CacheKeyInput): string {
    const filtersHash = createHash('sha1')
      .update(
        JSON.stringify({
          from: input.range.from,
          to: input.range.to,
          pipelineId: input.pipelineId ?? null,
        }),
      )
      .digest('hex')
      .slice(0, 12);

    return `report:${input.orgId}:${input.role}:${input.ownerId ?? 'all'}:${filtersHash}:${REPORT_DATA_VERSION}`;
  }
}
