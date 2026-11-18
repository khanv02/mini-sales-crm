import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, Pipeline, Stage } from '@pulse/shared';
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

function authResponse(user: AuthUser) {
  return { accessToken: 'access-token-value', tokenType: 'Bearer' as const, expiresIn: 900, user };
}

function makeStage(id: string, name: string, position: number, flags: Partial<Stage> = {}): Stage {
  return {
    id,
    orgId,
    pipelineId: '99999999-9999-4999-8999-999999999999',
    name,
    position,
    isWon: false,
    isLost: false,
    ...flags,
  };
}

const newStage = makeStage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'New', 1);
const qualifiedStage = makeStage('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Qualified', 2);
const proposalStage = makeStage('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Proposal', 3);
const wonStage = makeStage('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Won', 4, { isWon: true });

const pipeline: Pipeline = {
  id: '99999999-9999-4999-8999-999999999999',
  orgId,
  name: 'Sales Pipeline',
  stages: [newStage, qualifiedStage, proposalStage, wonStage],
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface PipelineStub {
  user?: AuthUser;
  stageDeleteStatus?: number;
  stageDeleteCode?: string;
  pipelineDeleteStatus?: number;
  pipelineDeleteCode?: string;
}

function stubApi({
  user = adminUser,
  stageDeleteStatus,
  stageDeleteCode = 'STAGE_HAS_DEALS',
  pipelineDeleteStatus,
  pipelineDeleteCode = 'PIPELINE_HAS_DEALS',
}: PipelineStub = {}) {
  const pipelines: Pipeline[] = [{ ...pipeline, stages: pipeline.stages.map((stage) => ({ ...stage })) }];

  const findPipelineByStage = (stageId: string): Pipeline | undefined =>
    pipelines.find((item) => item.stages.some((stage) => stage.id === stageId));

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname;

    if (path.endsWith('/health/ready')) {
      return Promise.resolve(jsonResponse(200, healthPayload));
    }
    if (path.endsWith('/auth/refresh')) {
      return Promise.resolve(jsonResponse(200, authResponse(user)));
    }
    if (path.endsWith('/auth/logout')) {
      return Promise.resolve(jsonResponse(204, null));
    }
    if (path.endsWith('/pipelines') && method === 'GET') {
      return Promise.resolve(
        jsonResponse(
          200,
          [...pipelines]
            .sort((left, right) => left.name.localeCompare(right.name))
            .map((item) => ({ ...item, stages: [...item.stages].sort((a, b) => a.position - b.position) })),
        ),
      );
    }
    if (path.endsWith('/pipelines') && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { name: string };
      const created: Pipeline = {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        orgId,
        name: body.name,
        stages: [],
      };
      pipelines.push(created);
      return Promise.resolve(jsonResponse(201, created));
    }
    if (path.match(/\/pipelines\/[^/]+$/) && method === 'PATCH') {
      const id = path.split('/').pop();
      const target = pipelines.find((item) => item.id === id);
      const body = JSON.parse(String(init?.body)) as { name: string };
      if (!target) {
        return Promise.resolve(jsonResponse(404, { code: 'PIPELINE_NOT_FOUND', message: 'missing' }));
      }
      target.name = body.name;
      return Promise.resolve(jsonResponse(200, target));
    }
    if (path.match(/\/pipelines\/[^/]+$/) && method === 'DELETE') {
      const status = pipelineDeleteStatus ?? 204;
      if (status >= 400) {
        return Promise.resolve(
          jsonResponse(status, { code: pipelineDeleteCode, message: 'guard' }),
        );
      }
      const id = path.split('/').pop();
      const index = pipelines.findIndex((item) => item.id === id);
      if (index >= 0) {
        pipelines.splice(index, 1);
      }
      return Promise.resolve(jsonResponse(204, null));
    }
    if (path.match(/\/pipelines\/[^/]+\/stages$/) && method === 'POST') {
      const pipelineId = path.split('/').slice(-2)[0];
      const target = pipelines.find((item) => item.id === pipelineId);
      const body = JSON.parse(String(init?.body)) as { name: string; isWon?: boolean; isLost?: boolean };
      if (!target) {
        return Promise.resolve(jsonResponse(404, { code: 'PIPELINE_NOT_FOUND', message: 'missing' }));
      }
      const created = makeStage(
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
        body.name,
        target.stages.length + 1,
        { isWon: body.isWon ?? false, isLost: body.isLost ?? false },
      );
      created.pipelineId = target.id;
      target.stages.push(created);
      return Promise.resolve(jsonResponse(201, created));
    }
    if (path.match(/\/stages\/[^/]+$/) && method === 'PATCH') {
      const id = path.split('/').pop();
      const target = findPipelineByStage(String(id));
      const stage = target?.stages.find((item) => item.id === id);
      if (!target || !stage) {
        return Promise.resolve(jsonResponse(404, { code: 'STAGE_NOT_FOUND', message: 'missing' }));
      }
      Object.assign(stage, JSON.parse(String(init?.body)) as Partial<Stage>);
      target.stages.sort((left, right) => left.position - right.position);
      return Promise.resolve(jsonResponse(200, stage));
    }
    if (path.match(/\/stages\/[^/]+$/) && method === 'DELETE') {
      const status = stageDeleteStatus ?? 204;
      if (status >= 400) {
        return Promise.resolve(jsonResponse(status, { code: stageDeleteCode, message: 'guard' }));
      }
      return Promise.resolve(jsonResponse(204, null));
    }
    return Promise.resolve(jsonResponse(404, { code: 'NOT_FOUND', message: 'missing' }));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPipelines(): void {
  window.history.pushState({}, '', '/pipelines');
  render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
}

function rowFor(name: string): HTMLElement {
  const cell = screen.getByText(name, { selector: '[data-testid="stage-name"]' });
  const row = cell.closest('tr');
  if (!row) {
    throw new Error(`No row found for stage ${name}`);
  }
  return row;
}

function patchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === 'PATCH');
}

beforeEach(() => {
  window.localStorage.clear();
  queryClient.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pipelines page (T222)', () => {
  it('renders the pipeline and its ordered stages for an admin', async () => {
    stubApi();
    renderPipelines();

    expect(await screen.findByRole('heading', { name: 'Quy trình bán hàng' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Sales Pipeline' })).toBeInTheDocument();
    await screen.findByText('Qualified');
    expect(screen.getAllByTestId('stage-name').map((element) => element.textContent)).toEqual([
      'New',
      'Qualified',
      'Proposal',
      'Won',
    ]);
    expect(screen.getByRole('button', { name: 'Thêm stage' })).toBeInTheDocument();
  });

  it('adds a stage to the selected pipeline', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderPipelines();

    await screen.findByText('Qualified');
    await user.click(screen.getByRole('button', { name: 'Thêm stage' }));

    const dialog = screen.getByRole('dialog', { name: 'Thêm stage' });
    await user.type(within(dialog).getByLabelText('Tên stage'), 'Negotiation');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).includes(`/pipelines/${pipeline.id}/stages`) &&
        (init?.method ?? 'GET') === 'POST',
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: 'Negotiation' });
    expect(await screen.findByText('Negotiation')).toBeInTheDocument();
  });

  it('renames a stage inline', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderPipelines();

    await screen.findByText('New');
    const row = rowFor('New');
    await user.click(within(row).getByRole('button', { name: 'Sửa New' }));

    const input = within(row).getByLabelText('Tên New');
    await user.clear(input);
    await user.type(input, 'Mới');
    await user.click(within(row).getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));
    expect(String(patchCalls(fetchMock)[0]?.[0])).toContain(`/stages/${newStage.id}`);
    expect(JSON.parse(String(patchCalls(fetchMock)[0]?.[1]?.body))).toEqual({ name: 'Mới' });
    expect(await screen.findByText('Mới')).toBeInTheDocument();
  });

  it('reorders stages with the move buttons and persists positions', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderPipelines();

    await screen.findByText('New');
    await user.click(within(rowFor('New')).getByRole('button', { name: 'Đưa New xuống' }));

    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(2));
    const bodies = patchCalls(fetchMock).map(([input, init]) => ({
      url: String(input),
      body: JSON.parse(String(init?.body)) as { position: number },
    }));
    expect(bodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: expect.stringContaining(newStage.id), body: { position: 2 } }),
        expect.objectContaining({
          url: expect.stringContaining(qualifiedStage.id),
          body: { position: 1 },
        }),
      ]),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('stage-name').map((element) => element.textContent)).toEqual([
        'Qualified',
        'New',
        'Proposal',
        'Won',
      ]),
    );
  });

  it('toggles the lost flag when the pipeline has no lost stage yet', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderPipelines();

    await screen.findByText('Proposal');
    await user.click(within(rowFor('Proposal')).getByRole('checkbox', { name: 'Thua Proposal' }));

    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));
    expect(JSON.parse(String(patchCalls(fetchMock)[0]?.[1]?.body))).toEqual({ isLost: true });
    await waitFor(() =>
      expect(within(rowFor('Proposal')).getByRole('checkbox', { name: 'Thua Proposal' })).toBeChecked(),
    );
  });

  it('surfaces the stage delete guard', async () => {
    stubApi({ stageDeleteStatus: 409, stageDeleteCode: 'STAGE_HAS_DEALS' });
    const user = userEvent.setup();
    renderPipelines();

    await screen.findByText('Qualified');
    await user.click(within(rowFor('Qualified')).getByRole('button', { name: 'Xoá Qualified' }));

    const dialog = screen.getByRole('dialog', { name: 'Xoá stage' });
    await user.click(within(dialog).getByRole('button', { name: 'Xoá' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Stage còn deal, hãy chuyển hoặc xoá deal trước.',
    );
  });

  it('creates a pipeline and selects it', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderPipelines();

    await screen.findByText('Qualified');
    await user.click(screen.getByRole('button', { name: 'Thêm quy trình' }));

    const dialog = screen.getByRole('dialog', { name: 'Thêm quy trình' });
    await user.type(within(dialog).getByLabelText('Tên quy trình'), 'Renewals');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith('/pipelines') && (init?.method ?? 'GET') === 'POST',
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: 'Renewals' });
    expect(await screen.findByRole('button', { name: 'Renewals' })).toBeInTheDocument();
    expect(await screen.findByText('Quy trình chưa có stage nào.')).toBeInTheDocument();
  });

  it('surfaces the pipeline delete guard', async () => {
    stubApi({ pipelineDeleteStatus: 409, pipelineDeleteCode: 'PIPELINE_HAS_DEALS' });
    const user = userEvent.setup();
    renderPipelines();

    await screen.findByText('Qualified');
    await user.click(screen.getByRole('button', { name: 'Xoá quy trình' }));

    const dialog = screen.getByRole('dialog', { name: 'Xoá quy trình' });
    await user.click(within(dialog).getByRole('button', { name: 'Xoá' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Quy trình còn deal, hãy chuyển hoặc xoá deal trước.',
    );
  });

  it('keeps the page read-only for non-admin roles', async () => {
    stubApi({ user: salesUser });
    renderPipelines();

    expect(await screen.findByText('Qualified')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm stage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm quy trình' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sửa New' })).not.toBeInTheDocument();
    expect(screen.getByText('Chỉ quản trị viên có thể thay đổi quy trình.')).toBeInTheDocument();
    expect(within(rowFor('Won')).getByRole('checkbox', { name: 'Thắng Won' })).toBeDisabled();
  });
});
