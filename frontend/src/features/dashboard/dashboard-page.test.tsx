import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, Pipeline, ReportSummary } from '@pulse/shared';
import { App } from '../../App';
import { AppProviders } from '../../app/providers';
import { queryClient } from '../../lib/query-client';

const orgId = '22222222-2222-4222-8222-222222222222';

const adminUser: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  orgId,
  email: 'admin@acme.test',
  name: 'Admin Acme',
  role: 'ADMIN',
  active: true,
  createdAt: '2026-11-11T00:00:00.000Z',
};

const salesUser: AuthUser = {
  ...adminUser,
  id: '33333333-3333-4333-8333-333333333333',
  email: 'sales@acme.test',
  name: 'Sales Acme',
  role: 'SALES',
};

const healthPayload = { status: 'ok', checks: { database: 'up', redis: 'up' } };

const pipeline: Pipeline = {
  id: '99999999-9999-4999-8999-999999999999',
  orgId,
  name: 'Sales Pipeline',
  stages: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      orgId,
      pipelineId: '99999999-9999-4999-8999-999999999999',
      name: 'New',
      position: 1,
      isWon: false,
      isLost: false,
    },
  ],
};

const summary: ReportSummary = {
  range: { from: '2026-11-01', to: '2026-11-30', timezone: 'Asia/Ho_Chi_Minh' },
  newLeads: 12,
  dealsByStage: [
    {
      stageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      stageName: 'New',
      count: 2,
      value: 30_000_000,
    },
  ],
  pipelineValue: 150_000_000,
  winRate: 0.5,
  forecastByMonth: [{ month: '2026-11', value: 40_000_000 }],
  generatedAt: '2026-11-19T03:00:00.000Z',
  cached: false,
};

const emptySummary: ReportSummary = {
  ...summary,
  newLeads: 0,
  dealsByStage: [],
  pipelineValue: 0,
  winRate: 0,
  forecastByMonth: [],
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface ReportStub {
  user?: AuthUser;
  body?: ReportSummary;
  status?: number;
  code?: string;
}

function stubApi({
  user = adminUser,
  body = summary,
  status = 200,
  code = 'REPORT_RANGE_TOO_LARGE',
}: ReportStub = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname;

    if (path.endsWith('/health/ready')) {
      return Promise.resolve(jsonResponse(200, healthPayload));
    }
    if (path.endsWith('/auth/refresh')) {
      return Promise.resolve(
        jsonResponse(200, {
          accessToken: 'access-token-value',
          tokenType: 'Bearer' as const,
          expiresIn: 900,
          user,
        }),
      );
    }
    if (path.endsWith('/auth/logout')) {
      return Promise.resolve(jsonResponse(204, null));
    }
    if (path.endsWith('/users')) {
      return Promise.resolve(
        jsonResponse(200, { data: [adminUser, salesUser], nextCursor: null, hasMore: false }),
      );
    }
    if (path.endsWith('/pipelines')) {
      return Promise.resolve(jsonResponse(200, [pipeline]));
    }
    if (path.endsWith('/reports/summary')) {
      if (status >= 400) {
        return Promise.resolve(jsonResponse(status, { code, message: 'range' }));
      }
      return Promise.resolve(jsonResponse(200, body));
    }
    return Promise.resolve(jsonResponse(404, { code: 'NOT_FOUND', message: 'missing' }));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderDashboard(): void {
  window.history.pushState({}, '', '/dashboard');
  render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
}

function lastSummaryCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes('/reports/summary')).at(-1);
}

beforeEach(() => {
  window.localStorage.clear();
  queryClient.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('dashboard page (T318)', () => {
  it('renders the cards and charts from the summary', async () => {
    stubApi();
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Báo cáo' })).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText(/150\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText(/2 deal/)).toBeInTheDocument();
    expect(screen.getByText('11/2026')).toBeInTheDocument();
    const shortDate = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeZone: 'UTC',
    });
    const expectedRange = `${shortDate.format(new Date('2026-11-01T00:00:00.000Z'))} – ${shortDate.format(new Date('2026-11-30T00:00:00.000Z'))}`;
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === 'P' && (element.textContent ?? '').includes(expectedRange),
      ),
    ).toBeInTheDocument();
  });

  it('sends the date, pipeline and owner filters to the API', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('12');
    await user.type(screen.getByLabelText('Từ ngày'), '2026-11-01');
    await waitFor(() => {
      expect(String(lastSummaryCall(fetchMock)?.[0])).toContain('from=2026-11-01');
    });

    await user.type(screen.getByLabelText('Đến ngày'), '2026-11-30');
    await waitFor(() => {
      const url = String(lastSummaryCall(fetchMock)?.[0]);
      expect(url).toContain('from=2026-11-01');
      expect(url).toContain('to=2026-11-30');
    });

    await user.selectOptions(screen.getByLabelText('Quy trình'), pipeline.id);
    await waitFor(() => {
      expect(String(lastSummaryCall(fetchMock)?.[0])).toContain(`pipelineId=${pipeline.id}`);
    });

    await user.selectOptions(screen.getByLabelText('Phụ trách'), salesUser.id);
    await waitFor(() => {
      expect(String(lastSummaryCall(fetchMock)?.[0])).toContain(`ownerId=${salesUser.id}`);
    });
  });

  it('clears every filter', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('12');
    await user.type(screen.getByLabelText('Từ ngày'), '2026-11-01');
    await screen.findByText('12');

    await user.click(screen.getByRole('button', { name: 'Xoá lọc' }));
    await waitFor(() => {
      const url = String(lastSummaryCall(fetchMock)?.[0]);
      expect(url).not.toContain('from=');
      expect(url).not.toContain('pipelineId=');
      expect(url).not.toContain('ownerId=');
    });
  });

  it('hides the owner filter from Sales', async () => {
    stubApi({ user: salesUser });
    renderDashboard();

    await screen.findByText('12');
    expect(screen.queryByLabelText('Phụ trách')).not.toBeInTheDocument();
    expect(screen.getByText('Số liệu của bạn theo khoảng ngày đã chọn.')).toBeInTheDocument();
  });

  it('renders empty aggregates without crashing', async () => {
    stubApi({ body: emptySummary });
    renderDashboard();

    expect(await screen.findByText('Chưa có deal đang mở trong khoảng đã chọn.')).toBeInTheDocument();
    expect(
      screen.getByText('Chưa có deal nào có ngày dự kiến chốt trong 6 tháng tới.'),
    ).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('surfaces an invalid range error', async () => {
    stubApi({ status: 400 });
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Khoảng ngày tối đa là 366 ngày.');
  });
});
