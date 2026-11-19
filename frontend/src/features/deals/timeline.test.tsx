import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity, AuthUser, Contact, Deal, Pipeline, Stage } from '@pulse/shared';
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

const stage: Stage = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orgId,
  pipelineId: '99999999-9999-4999-8999-999999999999',
  name: 'New',
  position: 1,
  isWon: false,
  isLost: false,
};

const pipeline: Pipeline = {
  id: '99999999-9999-4999-8999-999999999999',
  orgId,
  name: 'Sales Pipeline',
  stages: [stage],
};

const deal: Deal = {
  id: 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orgId,
  contactId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  pipelineId: pipeline.id,
  stageId: stage.id,
  title: 'Deal Alpha',
  value: 1_000_000,
  currency: 'VND',
  ownerId: adminUser.id,
  expectedClose: null,
  status: 'OPEN',
  lostReason: null,
  position: 1,
  version: 1,
  closedAt: null,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const contact: Contact = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  orgId,
  name: 'Công ty An Phát',
  email: 'anphat@acme.test',
  phone: null,
  company: 'An Phát',
  source: 'manual',
  ownerId: adminUser.id,
  deletedAt: null,
  createdAt: '2026-11-10T00:00:00.000Z',
  updatedAt: '2026-11-10T00:00:00.000Z',
};

function makeActivity(
  id: string,
  type: Activity['type'],
  content: string,
  extra: Partial<Activity> = {},
): Activity {
  return {
    id,
    orgId,
    dealId: deal.id,
    type,
    content,
    dueAt: null,
    doneAt: null,
    assigneeId: null,
    createdBy: adminUser.id,
    createdAt: '2026-11-14T03:00:00.000Z',
    updatedAt: '2026-11-14T03:00:00.000Z',
    ...extra,
  };
}

const noteActivity = makeActivity('a1111111-1111-4111-8111-111111111111', 'NOTE', 'Ghi chú đầu tiên');
const callActivity = makeActivity('a2222222-2222-4222-8222-222222222222', 'CALL', 'Đã gọi khách hàng');
const taskActivity = makeActivity('a3333333-3333-4333-8333-333333333333', 'TASK', 'Gửi báo giá', {
  dueAt: '2026-11-18T02:00:00.000Z',
  assigneeId: adminUser.id,
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface ActivityStub {
  user?: AuthUser;
}

function stubApi({ user = adminUser }: ActivityStub = {}) {
  const activities: Activity[] = [noteActivity, callActivity, taskActivity];

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
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
    if (path.endsWith('/contacts')) {
      return Promise.resolve(
        jsonResponse(200, { data: [contact], nextCursor: null, hasMore: false }),
      );
    }
    if (path.endsWith('/activities') && method === 'GET') {
      const type = url.searchParams.get('type');
      const filtered = type ? activities.filter((item) => item.type === type) : activities;
      return Promise.resolve(
        jsonResponse(200, { data: filtered.map((item) => ({ ...item })), nextCursor: null, hasMore: false }),
      );
    }
    if (path.endsWith('/activities') && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as {
        type: Activity['type'];
        content: string;
        dueAt?: string;
        assigneeId?: string;
      };
      const created = makeActivity(
        `a9999999-9999-4999-8999-${String(activities.length + 1).padStart(12, '0')}`,
        body.type,
        body.content,
        {
          dueAt: body.dueAt ?? null,
          assigneeId: body.assigneeId ?? null,
          createdAt: '2026-11-19T03:00:00.000Z',
          updatedAt: '2026-11-19T03:00:00.000Z',
        },
      );
      activities.unshift(created);
      return Promise.resolve(jsonResponse(201, created));
    }
    if (path.endsWith('/deals') && method === 'GET') {
      return Promise.resolve(
        jsonResponse(200, { data: [{ ...deal }], nextCursor: null, hasMore: false }),
      );
    }
    return Promise.resolve(jsonResponse(404, { code: 'NOT_FOUND', message: 'missing' }));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderDeals(): void {
  window.history.pushState({}, '', '/deals');
  render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
}

async function openTimeline(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await screen.findByText('Deal Alpha');
  await user.click(screen.getByRole('button', { name: 'Lịch sử Deal Alpha' }));
  return screen.findByRole('dialog', { name: 'Lịch sử deal' });
}

beforeEach(() => {
  window.localStorage.clear();
  queryClient.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('deal timeline (T316)', () => {
  it('shows the timeline with every activity type', async () => {
    stubApi();
    const user = userEvent.setup();
    renderDeals();

    const dialog = await openTimeline(user);
    expect(within(dialog).getByText('Ghi chú đầu tiên')).toBeInTheDocument();
    expect(within(dialog).getByText('Đã gọi khách hàng')).toBeInTheDocument();
    expect(within(dialog).getByText('Gửi báo giá')).toBeInTheDocument();
    expect(within(dialog).getByText(/Ghi chú ·/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Hạn/)).toBeInTheDocument();
  });

  it('filters the timeline by type', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDeals();

    const dialog = await openTimeline(user);
    await user.click(within(dialog).getByRole('button', { name: 'Ghi chú' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls
        .filter(([input]) => String(input).includes('/activities'))
        .at(-1);
      expect(String(call?.[0])).toContain('type=NOTE');
    });
    await waitFor(() =>
      expect(within(dialog).queryByText('Đã gọi khách hàng')).not.toBeInTheDocument(),
    );
    expect(within(dialog).getByText('Ghi chú đầu tiên')).toBeInTheDocument();
  });

  it('adds a note from the composer', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDeals();

    const dialog = await openTimeline(user);
    await user.type(within(dialog).getByLabelText('Nội dung'), 'Khách hẹn lại tuần sau');
    await user.click(within(dialog).getByRole('button', { name: 'Gửi' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls
        .filter(([, init]) => (init?.method ?? 'GET') === 'POST')
        .at(-1);
      expect(call).toBeDefined();
      expect(String(call?.[0])).toContain(`/deals/${deal.id}/activities`);
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        type: 'NOTE',
        content: 'Khách hẹn lại tuần sau',
      });
    });
  });

  it('validates the task form before sending', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDeals();

    const dialog = await openTimeline(user);
    await user.selectOptions(within(dialog).getByLabelText('Loại'), 'TASK');
    await user.type(within(dialog).getByLabelText('Nội dung'), 'Soạn báo giá');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo công việc' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Vui lòng chọn hạn hoàn thành.');
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).includes('/activities') && (init?.method ?? 'GET') === 'POST',
      ),
    ).toBe(false);
  });

  it('creates a task with due date and assignee', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDeals();

    const dialog = await openTimeline(user);
    await user.selectOptions(within(dialog).getByLabelText('Loại'), 'TASK');
    await user.type(within(dialog).getByLabelText('Nội dung'), 'Soạn báo giá');
    fireEvent.change(within(dialog).getByLabelText('Hạn hoàn thành'), {
      target: { value: '2026-11-10T09:00' },
    });
    await user.selectOptions(within(dialog).getByLabelText('Người phụ trách'), adminUser.id);
    await user.click(within(dialog).getByRole('button', { name: 'Tạo công việc' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls
        .filter(([, init]) => (init?.method ?? 'GET') === 'POST')
        .at(-1);
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        type: 'TASK',
        content: 'Soạn báo giá',
        dueAt: new Date('2026-11-10T09:00').toISOString(),
        assigneeId: adminUser.id,
      });
    });
  });
});
