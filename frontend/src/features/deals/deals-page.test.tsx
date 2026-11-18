import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, Contact, Deal, Pipeline, Stage } from '@pulse/shared';
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

const managerUser: AuthUser = {
  ...adminUser,
  id: '22222222-3333-4333-8333-333333333333',
  email: 'manager@acme.test',
  name: 'Manager Acme',
  role: 'MANAGER',
};

const salesUser: AuthUser = {
  ...adminUser,
  id: '33333333-3333-4333-8333-333333333333',
  email: 'sales@acme.test',
  name: 'Sales Acme',
  role: 'SALES',
};

const healthPayload = { status: 'ok', checks: { database: 'up', redis: 'up' } };

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
const wonStage = makeStage('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Won', 3, { isWon: true });
const lostStage = makeStage('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Lost', 4, { isLost: true });

const pipeline: Pipeline = {
  id: '99999999-9999-4999-8999-999999999999',
  orgId,
  name: 'Sales Pipeline',
  stages: [newStage, qualifiedStage, wonStage, lostStage],
};

function makeDeal(id: string, title: string, stageId: string, position: number): Deal {
  return {
    id,
    orgId,
    contactId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    pipelineId: pipeline.id,
    stageId,
    title,
    value: 1_000_000,
    currency: 'VND',
    ownerId: adminUser.id,
    expectedClose: '2026-12-31',
    status: 'OPEN',
    lostReason: null,
    position,
    version: 1,
    closedAt: null,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
  };
}

const dealAlpha = makeDeal(
  'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Deal Alpha',
  newStage.id,
  1,
);
const dealBeta = makeDeal(
  'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Deal Beta',
  newStage.id,
  2,
);
const dealGamma = makeDeal(
  'eccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'Deal Gamma',
  qualifiedStage.id,
  1,
);

const primaryContact: Contact = {
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

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

interface DealStub {
  user?: AuthUser;
  moveDeferred?: ReturnType<typeof deferred<Response>>;
  moveStatus?: number;
  moveCode?: string;
  updateStatus?: number;
  updateCode?: string;
}

function stubApi({
  user = adminUser,
  moveDeferred,
  moveStatus,
  moveCode = 'DEAL_VERSION_CONFLICT',
  updateStatus,
  updateCode = 'DEAL_VERSION_CONFLICT',
}: DealStub = {}) {
  const deals: Deal[] = [dealAlpha, dealBeta, dealGamma].map((deal) => ({ ...deal }));

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
        jsonResponse(200, { data: [adminUser, managerUser, salesUser], nextCursor: null, hasMore: false }),
      );
    }
    if (path.endsWith('/contacts') && method === 'GET') {
      return Promise.resolve(
        jsonResponse(200, { data: [primaryContact], nextCursor: null, hasMore: false }),
      );
    }
    if (path.endsWith('/pipelines') && method === 'GET') {
      return Promise.resolve(jsonResponse(200, [pipeline]));
    }
    if (path.endsWith('/deals') && method === 'GET') {
      return Promise.resolve(
        jsonResponse(200, { data: deals.map((deal) => ({ ...deal })), nextCursor: null, hasMore: false }),
      );
    }
    if (path.endsWith('/deals') && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as {
        contactId: string;
        pipelineId: string;
        stageId: string;
        title: string;
        value: number;
        expectedClose?: string;
      };
      const stage = pipeline.stages.find((item) => item.id === body.stageId);
      const created: Deal = {
        id: 'e9999999-9999-4999-8999-999999999999',
        orgId,
        contactId: body.contactId,
        pipelineId: body.pipelineId,
        stageId: body.stageId,
        title: body.title,
        value: body.value,
        currency: 'VND',
        ownerId: user.id,
        expectedClose: body.expectedClose ?? null,
        status: stage?.isWon ? 'WON' : stage?.isLost ? 'LOST' : 'OPEN',
        lostReason: null,
        position: 1000,
        version: 1,
        closedAt: null,
        createdAt: '2026-11-17T00:00:00.000Z',
        updatedAt: '2026-11-17T00:00:00.000Z',
      };
      deals.push(created);
      return Promise.resolve(jsonResponse(201, created));
    }
    if (path.match(/\/deals\/[^/]+\/move$/) && method === 'PATCH') {
      if (moveDeferred) {
        return moveDeferred.promise;
      }
      const status = moveStatus ?? 200;
      if (status >= 400) {
        return Promise.resolve(jsonResponse(status, { code: moveCode, message: 'conflict' }));
      }
      const id = path.split('/').slice(-2)[0];
      const body = JSON.parse(String(init?.body)) as {
        stageId: string;
        position: number;
        lostReason?: string;
      };
      const target = deals.find((deal) => deal.id === id);
      if (target) {
        const stage = pipeline.stages.find((item) => item.id === body.stageId);
        target.stageId = body.stageId;
        target.position = body.position;
        target.status = stage?.isWon ? 'WON' : stage?.isLost ? 'LOST' : 'OPEN';
        target.lostReason = target.status === 'LOST' ? (body.lostReason ?? null) : null;
        target.version += 1;
      }
      return Promise.resolve(jsonResponse(200, target));
    }
    if (path.match(/\/deals\/[^/]+\/assign$/) && method === 'PATCH') {
      const id = path.split('/').slice(-2)[0];
      const body = JSON.parse(String(init?.body)) as { ownerId: string };
      const target = deals.find((deal) => deal.id === id);
      if (target) {
        target.ownerId = body.ownerId;
        target.version += 1;
      }
      return Promise.resolve(jsonResponse(200, target));
    }
    if (path.match(/\/deals\/[^/]+$/) && method === 'PATCH') {
      if (updateStatus && updateStatus >= 400) {
        return Promise.resolve(jsonResponse(updateStatus, { code: updateCode, message: 'conflict' }));
      }
      const id = path.split('/').pop();
      const body = JSON.parse(String(init?.body)) as {
        title?: string;
        value?: number;
        expectedClose?: string | null;
      };
      const target = deals.find((deal) => deal.id === id);
      if (target) {
        if (body.title !== undefined) target.title = body.title;
        if (body.value !== undefined) target.value = body.value;
        if (body.expectedClose !== undefined) target.expectedClose = body.expectedClose;
        target.version += 1;
      }
      return Promise.resolve(jsonResponse(200, target));
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

function columnFor(stage: Stage): HTMLElement {
  return screen.getByTestId(`column-${stage.id}`);
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>, fragment: string, method: string) {
  return fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        String(input).includes(fragment) && (init?.method ?? 'GET') === method,
    )
    .at(-1);
}

beforeEach(() => {
  window.localStorage.clear();
  queryClient.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('deals kanban (T223)', () => {
  it('renders stages as columns with their deals', async () => {
    stubApi();
    renderDeals();

    expect(await screen.findByRole('heading', { name: 'Cơ hội bán hàng' })).toBeInTheDocument();
    await screen.findByText('Deal Alpha');

    expect(within(columnFor(newStage)).getByText('Deal Alpha')).toBeInTheDocument();
    expect(within(columnFor(newStage)).getByText('Deal Beta')).toBeInTheDocument();
    expect(within(columnFor(qualifiedStage)).getByText('Deal Gamma')).toBeInTheDocument();
    expect(within(columnFor(newStage)).queryByText('Deal Gamma')).not.toBeInTheDocument();
    expect(within(columnFor(newStage)).getAllByText('1.000.000 ₫')).toHaveLength(2);
  });

  it('moves a deal to another stage and sends the target index + version', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDeals();

    await screen.findByText('Deal Alpha');
    await user.selectOptions(
      within(columnFor(newStage)).getByLabelText('Chuyển stage Deal Alpha'),
      qualifiedStage.id,
    );

    await waitFor(() => {
      const call = lastCall(fetchMock, '/move', 'PATCH');
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        stageId: qualifiedStage.id,
        position: 1,
        version: 1,
      });
    });
    await waitFor(() =>
      expect(within(columnFor(qualifiedStage)).getByText('Deal Alpha')).toBeInTheDocument(),
    );
    expect(within(columnFor(newStage)).queryByText('Deal Alpha')).not.toBeInTheDocument();
  });

  it('shows an optimistic move before the server answers', async () => {
    const moveDeferred = deferred<Response>();
    stubApi({ moveDeferred });
    const user = userEvent.setup();
    renderDeals();

    await screen.findByText('Deal Alpha');
    await user.selectOptions(
      within(columnFor(newStage)).getByLabelText('Chuyển stage Deal Alpha'),
      qualifiedStage.id,
    );

    await waitFor(() =>
      expect(within(columnFor(qualifiedStage)).getByText('Deal Alpha')).toBeInTheDocument(),
    );
    moveDeferred.resolve(
      jsonResponse(200, {
        ...dealAlpha,
        stageId: qualifiedStage.id,
        position: 1,
        version: 2,
      }),
    );
    await waitFor(() =>
      expect(within(columnFor(qualifiedStage)).getByText('Deal Alpha')).toBeInTheDocument(),
    );
  });

  it('rolls back a 409 move and asks for a reload', async () => {
    stubApi({ moveStatus: 409, moveCode: 'DEAL_VERSION_CONFLICT' });
    const user = userEvent.setup();
    renderDeals();

    await screen.findByText('Deal Alpha');
    await user.selectOptions(
      within(columnFor(newStage)).getByLabelText('Chuyển stage Deal Alpha'),
      qualifiedStage.id,
    );

    expect(
      await screen.findByText('Deal đã được người khác cập nhật. Bảng đã được tải lại.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(columnFor(newStage)).getByText('Deal Alpha')).toBeInTheDocument(),
    );
    expect(within(columnFor(qualifiedStage)).queryByText('Deal Alpha')).not.toBeInTheDocument();
  });

  it('assigns a deal through the owner menu', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDeals();

    await screen.findByText('Deal Alpha');
    const menu = within(columnFor(newStage)).getByLabelText('Phụ trách Deal Alpha');
    expect(menu).toHaveValue(adminUser.id);

    await user.selectOptions(menu, salesUser.id);

    await waitFor(() => {
      const call = lastCall(fetchMock, '/assign', 'PATCH');
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        ownerId: salesUser.id,
        version: 1,
      });
    });
    await waitFor(() =>
      expect(
        within(columnFor(newStage)).getByLabelText('Phụ trách Deal Alpha'),
      ).toHaveValue(salesUser.id),
    );
  });

  it('hides the assign menu from Sales', async () => {
    stubApi({ user: salesUser });
    renderDeals();

    await screen.findByText('Deal Alpha');
    expect(
      within(columnFor(newStage)).queryByLabelText('Phụ trách Deal Alpha'),
    ).not.toBeInTheDocument();
    expect(
      within(columnFor(newStage)).getByLabelText('Chuyển stage Deal Alpha'),
    ).toBeInTheDocument();
  });
});

describe('deal form (T224)', () => {
  it('creates a deal with the selected contact and stage', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDeals();

    await screen.findByText('Deal Alpha');
    await user.click(screen.getByRole('button', { name: 'Thêm deal' }));

    const dialog = screen.getByRole('dialog', { name: 'Thêm deal' });
    await within(dialog).findByRole('option', { name: /Công ty An Phát/ });
    await user.type(within(dialog).getByLabelText('Tên deal'), 'Cơ hội mới');
    await user.type(within(dialog).getByLabelText('Giá trị'), '2500000');
    await user.selectOptions(
      within(dialog).getByLabelText('Khách hàng'),
      primaryContact.id,
    );
    await user.selectOptions(within(dialog).getByLabelText('Stage'), qualifiedStage.id);
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() => {
      const call = lastCall(fetchMock, '/deals', 'POST');
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        contactId: primaryContact.id,
        pipelineId: pipeline.id,
        stageId: qualifiedStage.id,
        title: 'Cơ hội mới',
        value: 2500000,
      });
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Thêm deal' })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(within(columnFor(qualifiedStage)).getByText('Cơ hội mới')).toBeInTheDocument(),
    );
  });

  it('blocks creation until the title and value are present', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDeals();

    await screen.findByText('Deal Alpha');
    await user.click(screen.getByRole('button', { name: 'Thêm deal' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm deal' });

    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(within(dialog).getByText('Vui lòng nhập tên deal.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Tên deal'), 'Cơ hội mới');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(within(dialog).getByText('Vui lòng nhập giá trị.')).toBeInTheDocument();

    expect(lastCall(fetchMock, '/deals', 'POST')).toBeUndefined();
  });

  it('edits a deal with the current version and formatted value', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDeals();

    await screen.findByText('Deal Alpha');
    await user.click(
      within(columnFor(newStage)).getByRole('button', { name: 'Sửa Deal Alpha' }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Sửa deal' });
    expect(within(dialog).getByLabelText('Tên deal')).toHaveValue('Deal Alpha');
    expect(within(dialog).getByText(/1\.000\.000 ₫/)).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Tên deal'));
    await user.type(within(dialog).getByLabelText('Tên deal'), 'Deal Alpha mới');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() => {
      const call = lastCall(fetchMock, `/deals/${dealAlpha.id}`, 'PATCH');
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        title: 'Deal Alpha mới',
        value: 1_000_000,
        expectedClose: '2026-12-31',
        version: 1,
      });
    });
    await waitFor(() =>
      expect(within(columnFor(newStage)).getByText('Deal Alpha mới')).toBeInTheDocument(),
    );
  });

  it('keeps the edit dialog open on a version conflict', async () => {
    stubApi({ updateStatus: 409 });
    const user = userEvent.setup();
    renderDeals();

    await screen.findByText('Deal Alpha');
    await user.click(
      within(columnFor(newStage)).getByRole('button', { name: 'Sửa Deal Alpha' }),
    );
    await user.click(
      within(screen.getByRole('dialog', { name: 'Sửa deal' })).getByRole('button', {
        name: 'Lưu',
      }),
    );

    expect(
      await screen.findByText('Deal đã được người khác cập nhật. Bảng đã được tải lại.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Sửa deal' })).toBeInTheDocument();
  });

  it('requires a lost reason before moving a deal into a lost stage', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDeals();

    await screen.findByText('Deal Alpha');
    await user.selectOptions(
      within(columnFor(newStage)).getByLabelText('Chuyển stage Deal Alpha'),
      lostStage.id,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Lý do thua' });
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận thua' }));
    expect(within(dialog).getByText('Vui lòng nhập lý do thua.')).toBeInTheDocument();
    expect(lastCall(fetchMock, '/move', 'PATCH')).toBeUndefined();

    await user.type(within(dialog).getByLabelText('Lý do thua'), 'Giá cao hơn đối thủ');
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận thua' }));

    await waitFor(() => {
      const call = lastCall(fetchMock, '/move', 'PATCH');
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        stageId: lostStage.id,
        position: 0,
        version: 1,
        lostReason: 'Giá cao hơn đối thủ',
      });
    });
    await waitFor(() =>
      expect(within(columnFor(lostStage)).getByText('Deal Alpha')).toBeInTheDocument(),
    );
  });

  it('moves a deal to a won stage without asking for a reason', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDeals();

    await screen.findByText('Deal Alpha');
    await user.selectOptions(
      within(columnFor(newStage)).getByLabelText('Chuyển stage Deal Alpha'),
      wonStage.id,
    );

    await waitFor(() => {
      const call = lastCall(fetchMock, '/move', 'PATCH');
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        stageId: wonStage.id,
        position: 0,
        version: 1,
      });
    });
    expect(screen.queryByRole('dialog', { name: 'Lý do thua' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(within(columnFor(wonStage)).getByText('Deal Alpha')).toBeInTheDocument(),
    );
  });
});
