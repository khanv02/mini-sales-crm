import { z } from 'zod';
import { dateOnlySchema, uuidSchema } from './common';

/**
 * `GET /reports/summary`: `from`/`to` are days in the org timezone (SCR-011, docs/data-model.md).
 *
 * The range rules are not encoded here: an inverted range or a span over 366 days is rejected by the service with
 * `INVALID_DATE_RANGE`/`REPORT_RANGE_TOO_LARGE`, matching how the contact date filters behave (AC-FR08-06).
 */
export const reportSummaryQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  ownerId: uuidSchema.optional(),
  pipelineId: uuidSchema.optional(),
});

export type ReportSummaryQuery = z.infer<typeof reportSummaryQuerySchema>;
