import type { ReportSummaryQuery } from '@pulse/shared';
import { ERROR_CODES } from '@pulse/shared';
import { AppError } from '../../common/errors/app-error';

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

export interface ResolvedReportRange {
  /** Inclusive first day in the organization timezone (`YYYY-MM-DD`). */
  from: string;
  /** Inclusive last day in the organization timezone (`YYYY-MM-DD`). */
  to: string;
  timezone: string;
  /** UTC instant of `from` 00:00 local, for `timestamptz` columns. */
  fromInstant: Date;
  /** UTC instant of `to + 1 day` 00:00 local (exclusive), for `timestamptz` columns. */
  toInstant: Date;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timeZone);
  if (existing) {
    return existing;
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatters.set(timeZone, formatter);
  return formatter;
}

function zonedParts(date: Date, timeZone: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  }
  return values;
}

/** Offset of `timeZone` at `date`, in milliseconds (east of UTC is positive). */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  );
  return asUtc - date.getTime();
}

/** Reject impossible calendar days that still match `YYYY-MM-DD` (for example `2026-02-31`). */
function assertCalendarDate(value: string): void {
  const [year, month, day] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month! - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      400,
      `'${value}' is not a valid calendar date.`,
    );
  }
}

/** `YYYY-MM-DD` of `now` in the organization timezone. */
export function dateInTimezone(now: Date, timeZone: string): string {
  const parts = zonedParts(now, timeZone);
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

export function addDays(dateOnly: string, days: number): string {
  assertCalendarDate(dateOnly);
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

/** UTC instant of 00:00 local time on `dateOnly` in `timeZone`. */
export function startOfDay(dateOnly: string, timeZone: string): Date {
  assertCalendarDate(dateOnly);
  const [year, month, day] = dateOnly.split('-').map(Number);
  const utcGuess = Date.UTC(year!, month! - 1, day!);

  const firstOffset = zoneOffsetMs(new Date(utcGuess), timeZone);
  let instant = utcGuess - firstOffset;
  const secondOffset = zoneOffsetMs(new Date(instant), timeZone);
  if (secondOffset !== firstOffset) {
    instant = utcGuess - secondOffset;
  }
  return new Date(instant);
}

/**
 * FR-08.4: `from`/`to` default to the current month up to today in the organization timezone; the range
 * is at most 366 inclusive days (AC-FR08-06). Date-only strings are inclusive.
 */
export function resolveReportRange(
  query: ReportSummaryQuery,
  timeZone: string,
  now: Date = new Date(),
): ResolvedReportRange {
  const today = dateInTimezone(now, timeZone);
  const to = query.to ?? today;
  const from = query.from ?? `${to.slice(0, 7)}-01`;

  assertCalendarDate(from);
  assertCalendarDate(to);

  if (from > to) {
    throw new AppError(ERROR_CODES.INVALID_DATE_RANGE, 400, '`from` must not be after `to`.');
  }

  const spanDays =
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS;
  if (spanDays + 1 > MAX_RANGE_DAYS) {
    throw new AppError(
      ERROR_CODES.REPORT_RANGE_TOO_LARGE,
      400,
      `The report range cannot exceed ${MAX_RANGE_DAYS} days.`,
    );
  }

  return {
    from,
    to,
    timezone: timeZone,
    fromInstant: startOfDay(from, timeZone),
    toInstant: startOfDay(addDays(to, 1), timeZone),
  };
}
