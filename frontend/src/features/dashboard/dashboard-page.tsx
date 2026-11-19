import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DealsByStageRow, ForecastMonthRow, ReportSummary } from '@pulse/shared';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { fetchUserOptions } from '../../lib/api/user-options';
import { useAuth } from '../auth/auth-context';
import { formatDealValue } from '../deals/deal-format';
import { fetchPipelines, pipelineKeys } from '../pipelines/pipeline-api';
import {
  fetchReportSummary,
  reportErrorMessage,
  reportKeys,
  type ReportFilters,
} from './report-api';

const percentFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'percent',
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'UTC' });

function formatDay(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

function formatMonth(value: string): string {
  const [year, month] = value.split('-');
  return `${month}/${year}`;
}

interface BarRow {
  key: string;
  label: string;
  detail: string;
  value: number;
}

function BarList({ rows, emptyLabel }: { rows: BarRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const max = rows.reduce((highest, row) => Math.max(highest, row.value), 0);

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const width = max === 0 ? 0 : Math.max(4, Math.round((row.value / max) * 100));
        return (
          <li key={row.key} className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{row.label}</span>
              <span className="text-xs text-muted-foreground">{row.detail}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function stageRows(rows: DealsByStageRow[]): BarRow[] {
  return rows.map((row) => ({
    key: row.stageId,
    label: row.stageName,
    detail: `${row.count} deal · ${formatDealValue(row.value, 'VND')}`,
    value: row.value,
  }));
}

function forecastRows(rows: ForecastMonthRow[]): BarRow[] {
  return rows.map((row) => ({
    key: row.month,
    label: formatMonth(row.month),
    detail: formatDealValue(row.value, 'VND'),
    value: row.value,
  }));
}

/** `/dashboard` (T318, FR-08): cards, stage/forecast bars and the API filters. */
export function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [ownerId, setOwnerId] = useState('');

  const filters: ReportFilters = {};
  if (from) filters.from = from;
  if (to) filters.to = to;
  if (pipelineId) filters.pipelineId = pipelineId;
  if (ownerId) filters.ownerId = ownerId;

  const summaryQuery = useQuery({
    queryKey: reportKeys.summary(filters),
    queryFn: () => fetchReportSummary(filters),
    enabled: Boolean(user),
  });

  const pipelinesQuery = useQuery({
    queryKey: pipelineKeys.all,
    queryFn: fetchPipelines,
    enabled: Boolean(user),
  });

  // `GET /users` is Admin-only, so only Admin can offer the owner filter (permissions matrix).
  const usersQuery = useQuery({
    queryKey: ['users', 'options'],
    queryFn: fetchUserOptions,
    enabled: isAdmin,
  });

  const summary: ReportSummary | undefined = summaryQuery.data;
  const pipelines = pipelinesQuery.data ?? [];

  function clearFilters(): void {
    setFrom('');
    setTo('');
    setPipelineId('');
    setOwnerId('');
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Báo cáo</h1>
        <p className="text-sm text-muted-foreground">
          {user?.role === 'SALES'
            ? 'Số liệu của bạn theo khoảng ngày đã chọn.'
            : 'Số liệu toàn tổ chức theo khoảng ngày, người phụ trách và quy trình.'}
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Từ ngày</span>
            <Input
              type="date"
              name="from"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Đến ngày</span>
            <Input
              type="date"
              name="to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Quy trình</span>
            <select
              name="pipelineId"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={pipelineId}
              onChange={(event) => setPipelineId(event.target.value)}
            >
              <option value="">Tất cả</option>
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </label>
          {isAdmin ? (
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Phụ trách</span>
              <select
                name="ownerId"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                <option value="">Tất cả</option>
                {(usersQuery.data ?? []).map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={clearFilters}>
              Xoá lọc
            </Button>
          </div>
        </CardContent>
      </Card>

      {summaryQuery.isError ? (
        <p role="alert" className="text-sm text-red-600">
          {reportErrorMessage(summaryQuery.error, 'Không thể tải báo cáo.')}
        </p>
      ) : null}
      {summaryQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : null}

      {summary ? (
        <>
          <p className="text-xs text-muted-foreground">
            {formatDay(summary.range.from)} – {formatDay(summary.range.to)} ({summary.range.timezone})
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Khách hàng mới</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{summary.newLeads}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Giá trị pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {formatDealValue(summary.pipelineValue, 'VND')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tỷ lệ thắng</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {percentFormatter.format(summary.winRate)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Deal đang mở theo stage</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  rows={stageRows(summary.dealsByStage)}
                  emptyLabel="Chưa có deal đang mở trong khoảng đã chọn."
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Dự báo theo tháng</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  rows={forecastRows(summary.forecastByMonth)}
                  emptyLabel="Chưa có deal nào có ngày dự kiến chốt trong 6 tháng tới."
                />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </section>
  );
}
