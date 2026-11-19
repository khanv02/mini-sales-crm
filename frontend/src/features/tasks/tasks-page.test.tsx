import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity, AuthUser } from '@pulse/shared';
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

const healthPayload = { status: 'ok', checks: { database: 'up', redis: 'up' } };

const hour = 3_600_000;

function makeTask(
  id: string,
  content: string,
  dueOffsetMs: number,
  extra: Partial<Activity> = {},
): Activity {
  const dueAt = new Date(Date.now() + dueOffsetMs).toISOString();
  return {
    id,
    orgId,
    dealId: 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    type: 'TASK',
    content,
    dueAt,
    doneAt: null,
    assigneeId: adminUser.id,
    createdBy: adminUser.id,
    createdAt: '2026-11-14T03:00:00.000Z',
    updatedAt: '2026-11-14T03:00:00.000Z',
    ...extra,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface TaskStub {
  user?: AuthUser;
  patchStatus?: number;
}

function stubApi({ user = adminUser, patchStatus }: TaskStub = {}) {
  const tasks: Activity[] = [
    makeTask('a1111111-1111-4111-8111-111111111111', 'Gửi báo giá cho An Phát', 2 * 24 * hour),
    makeTask('a2222222-2222-4222-8222-222222222222', 'Gọi lại khách hàng cũ', -hour),
    makeTask('a3333333-3333-4333-8333-333333333333', 'Ký hợp đồng', 3 * 24 * hour, {
      doneAt: '2026-11-15T03:00:00.000Z',
    }),
  ];

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
        jsonResponse(200, { data: [adminUser], nextCursor: null, hasMore: false }),
      );
    }
    if (path.endsWith('/tasks') && method === 'GET') {
      const status = url.searchParams.get('status');
      const now = Date.now();
      const filtered = tasks.filter((task) => {
        const due = task.dueAt ? new Date(task.dueAt).getTime() : Number.POSITIVE_INFINITY;
        if (status === 'done') return task.doneAt !== null;
        if (task.doneAt !== null) return false;
        return status === 'overdue' ? due < now : due >= now;
      });
      return Promise.resolve(
        jsonResponse(200, { data: filtered.map((item) => ({ ...item })), nextCursor: null, hasMore: false }),
      );
    }
    if (path.match(/\/tasks\/[^/]+$/) && method === 'PATCH') {
      if (patchStatus && patchStatus >= 400) {
        return Promise.resolve(
          jsonResponse(patchStatus, { code: 'ACTIVITY_NOT_FOUND', message: 'missing' }),
        );
      }
      const id = path.split('/').pop();
      const task = tasks.find((item) => item.id === id);
      if (!task) {
        return Promise.resolve(
          jsonResponse(404, { code: 'ACTIVITY_NOT_FOUND', message: 'missing' }),
        );
      }
      const body = JSON.parse(String(init?.body)) as { done?: boolean };
      if (body.done) {
        task.doneAt = task.doneAt ?? new Date().toISOString();
      } else {
        task.doneAt = null;
      }
      return Promise.resolve(jsonResponse(200, task));
    }
    return Promise.resolve(jsonResponse(404, { code: 'NOT_FOUND', message: 'missing' }));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderTasks(): void {
  window.history.pushState({}, '', '/tasks');
  render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  queryClient.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('tasks page (T317)', () => {
  it('lists the open tasks assigned to the caller', async () => {
    stubApi();
    renderTasks();

    expect(await screen.findByRole('heading', { name: 'Công việc' })).toBeInTheDocument();
    expect(await screen.findByText('Gửi báo giá cho An Phát')).toBeInTheDocument();
    expect(screen.queryByText('Gọi lại khách hàng cũ')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Đánh dấu xong: Gửi báo giá cho An Phát' }),
    ).toBeInTheDocument();
  });

  it('shows overdue tasks with a badge', async () => {
    stubApi();
    const user = userEvent.setup();
    renderTasks();

    await screen.findByText('Gửi báo giá cho An Phát');
    await user.click(screen.getByRole('button', { name: 'Quá hạn' }));

    expect(await screen.findByText('Gọi lại khách hàng cũ')).toBeInTheDocument();
    const row = screen.getByText('Gọi lại khách hàng cũ').closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Quá hạn')).toBeInTheDocument();
  });

  it('marks a task done and removes it from the open list', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderTasks();

    await screen.findByText('Gửi báo giá cho An Phát');
    await user.click(
      screen.getByRole('button', { name: 'Đánh dấu xong: Gửi báo giá cho An Phát' }),
    );

    await waitFor(() => {
      const call = fetchMock.mock.calls
        .filter(([, init]) => (init?.method ?? 'GET') === 'PATCH')
        .at(-1);
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ done: true });
    });
    await waitFor(() =>
      expect(screen.queryByText('Gửi báo giá cho An Phát')).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Đã xong' }));
    expect(await screen.findByText('Gửi báo giá cho An Phát')).toBeInTheDocument();
  });

  it('lists completed tasks without the mark-done action', async () => {
    stubApi();
    const user = userEvent.setup();
    renderTasks();

    await screen.findByText('Gửi báo giá cho An Phát');
    await user.click(screen.getByRole('button', { name: 'Đã xong' }));

    expect(await screen.findByText('Ký hợp đồng')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Đánh dấu xong: Ký hợp đồng' }),
    ).not.toBeInTheDocument();
  });

  it('restores the task and reports an error when mark-done fails', async () => {
    stubApi({ patchStatus: 404 });
    const user = userEvent.setup();
    renderTasks();

    await screen.findByText('Gửi báo giá cho An Phát');
    await user.click(
      screen.getByRole('button', { name: 'Đánh dấu xong: Gửi báo giá cho An Phát' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Công việc không còn tồn tại.');
    expect(await screen.findByText('Gửi báo giá cho An Phát')).toBeInTheDocument();
  });
});
