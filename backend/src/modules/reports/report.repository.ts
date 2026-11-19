import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DealsByStageRow, ForecastMonthRow } from '@pulse/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ReportFilters {
  orgId: string;
  /** Inclusive start instant (UTC boundaries of the organization's day). */
  from: Date;
  /** Exclusive end instant. */
  to: Date;
  /** Forced to the caller for Sales; chosen by Manager/Admin. */
  ownerId?: string;
  pipelineId?: string;
}

export interface WinLossCount {
  won: number;
  lost: number;
}

interface StageAggregateRow {
  stageId: string;
  stageName: string;
  count: number;
  value: Prisma.Decimal;
}

interface ForecastAggregateRow {
  month: string;
  value: Prisma.Decimal;
}

/**
 * Dashboard aggregates (FR-08, SCR-011). Every query filters `org_id`; the formulas live in
 * `specs/004-activities-dashboard/spec.md` and the SQL mirrors them one-to-one.
 */
@Injectable()
export class ReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrgTimezone(orgId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true },
    });
    return org?.timezone ?? 'UTC';
  }

  /** AC-FR08-01: live contacts created inside the range (soft-deleted ones are excluded). */
  async countNewLeads(input: Pick<ReportFilters, 'orgId' | 'from' | 'to' | 'ownerId'>): Promise<number> {
    const owner = input.ownerId
      ? Prisma.sql`AND c."owner_id" = ${input.ownerId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT count(*)::int AS "count"
      FROM "contacts" c
      WHERE c."org_id" = ${input.orgId}::uuid
        AND c."deleted_at" IS NULL
        AND c."created_at" >= ${input.from}
        AND c."created_at" < ${input.to}
        ${owner}
    `);

    return rows[0]?.count ?? 0;
  }

  /** AC-FR08-02: OPEN deals created inside the range, grouped by stage in pipeline order. */
  async dealsByStage(filters: ReportFilters): Promise<DealsByStageRow[]> {
    const rows = await this.prisma.$queryRaw<StageAggregateRow[]>(Prisma.sql`
      SELECT
        d."stage_id" AS "stageId",
        s."name" AS "stageName",
        count(*)::int AS "count",
        coalesce(sum(d."value"), 0) AS "value"
      FROM "deals" d
      JOIN "stages" s ON s."org_id" = d."org_id" AND s."id" = d."stage_id"
      WHERE d."status" = 'OPEN' AND ${Prisma.join(this.dealConditions(filters, 'created_at'), ' AND ')}
      GROUP BY d."stage_id", s."name", s."position"
      ORDER BY s."position" ASC, d."stage_id" ASC
    `);

    return rows.map((row) => ({
      stageId: row.stageId,
      stageName: row.stageName,
      count: row.count,
      value: Number(row.value),
    }));
  }

  /** AC-FR08-03: OPEN deals created inside the range, regardless of stage. */
  async pipelineValue(filters: ReportFilters): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ value: Prisma.Decimal }>>(Prisma.sql`
      SELECT coalesce(sum(d."value"), 0) AS "value"
      FROM "deals" d
      WHERE d."status" = 'OPEN' AND ${Prisma.join(this.dealConditions(filters, 'created_at'), ' AND ')}
    `);

    return Number(rows[0]?.value ?? 0);
  }

  /** AC-FR08-04: WON/LOST counts by `closed_at` inside the range (a missing `closed_at` never counts). */
  async winLoss(filters: ReportFilters): Promise<WinLossCount> {
    const rows = await this.prisma.$queryRaw<WinLossCount[]>(Prisma.sql`
      SELECT
        count(*) FILTER (WHERE d."status" = 'WON')::int AS "won",
        count(*) FILTER (WHERE d."status" = 'LOST')::int AS "lost"
      FROM "deals" d
      WHERE ${Prisma.join(this.dealConditions(filters, 'closed_at'), ' AND ')}
    `);

    return rows[0] ?? { won: 0, lost: 0 };
  }

  /**
   * AC-FR08-05: OPEN deals with `expected_close` from the range start through six months later, bucketed by
   * `YYYY-MM`. `expected_close` is a DATE, so the boundaries stay date-only.
   */
  async forecastByMonth(filters: ReportFilters, fromDate: string): Promise<ForecastMonthRow[]> {
    const owner = filters.ownerId
      ? Prisma.sql`AND d."owner_id" = ${filters.ownerId}::uuid`
      : Prisma.empty;
    const pipeline = filters.pipelineId
      ? Prisma.sql`AND d."pipeline_id" = ${filters.pipelineId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<ForecastAggregateRow[]>(Prisma.sql`
      SELECT
        to_char(date_trunc('month', d."expected_close"), 'YYYY-MM') AS "month",
        coalesce(sum(d."value"), 0) AS "value"
      FROM "deals" d
      WHERE d."org_id" = ${filters.orgId}::uuid
        AND d."status" = 'OPEN'
        AND d."expected_close" >= ${fromDate}::date
        AND d."expected_close" < (${fromDate}::date + interval '6 months')
        ${owner}
        ${pipeline}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return rows.map((row) => ({ month: row.month, value: Number(row.value) }));
  }

  private dealConditions(filters: ReportFilters, dateColumn: 'created_at' | 'closed_at'): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`d."org_id" = ${filters.orgId}::uuid`,
      dateColumn === 'created_at'
        ? Prisma.sql`d."created_at" >= ${filters.from} AND d."created_at" < ${filters.to}`
        : Prisma.sql`d."closed_at" >= ${filters.from} AND d."closed_at" < ${filters.to}`,
    ];

    if (filters.ownerId) {
      conditions.push(Prisma.sql`d."owner_id" = ${filters.ownerId}::uuid`);
    }
    if (filters.pipelineId) {
      conditions.push(Prisma.sql`d."pipeline_id" = ${filters.pipelineId}::uuid`);
    }

    return conditions;
  }
}
