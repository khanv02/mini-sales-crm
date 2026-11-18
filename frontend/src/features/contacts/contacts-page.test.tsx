import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, Contact } from '@pulse/shared';
import { App } from '../../App';
import { AppProviders } from '../../app/providers';
import { queryClient } from '../../lib/query-client';

const adminUser: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  email: 'admin@acme.test',
  name: 'Admin Acme',
  role: 'ADMIN',
  active: true,
  createdAt: '2026-11-11T00:00:00.000Z',
};

const authResponse = {
  accessToken: 'access-token-value',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  user: adminUser,
};

const healthPayload = { status: 'ok', checks: { database: 'up', redis: 'up' } };

const firstContact: Contact = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orgId: adminUser.orgId,
  name: 'Nguyễn Văn An',
  email: 'an@acme.test',
  phone: '+84 90 000 0001',
  company: 'Acme Software',
  source: 'manual',
  ownerId: adminUser.id,
  deletedAt: null,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const secondContact: Contact = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  orgId: adminUser.orgId,
  name: 'Trần Thị Bình',
  email: 'binh@acme.test',
  phone: null,
  company: 'Globex',
  source: 'import',
  ownerId: null,
  deletedAt: null,
  createdAt: '2026-11-13T00:00:00.000Z',
  updatedAt: '2026-11-13T00:00:00.000Z',
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface ContactsStub {
  contacts: Contact[];
  deleteStatus?: number;
  postStatus?: number;
  postBody?: unknown;
}

function stubApi({ contacts: seed, deleteStatus, postStatus, postBody }: ContactsStub) {
  // Copy the seed so a PATCH/DELETE in one test cannot leak into the next one.
  const contacts = seed.map((contact) => ({ ...contact }));
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.pathname.endsWith('/health/ready')) {
      return Promise.resolve(jsonResponse(200, healthPayload));
    }
    if (url.pathname.endsWith('/auth/refresh')) {
      return Promise.resolve(jsonResponse(200, authResponse));
    }
    if (url.pathname.endsWith('/auth/logout')) {
      return Promise.resolve(jsonResponse(204, null));
    }
    if (url.pathname.endsWith('/users')) {
      return Promise.resolve(
        jsonResponse(200, { data: [adminUser], nextCursor: null, hasMore: false }),
      );
    }
    if (url.pathname.endsWith('/contacts') && method === 'GET') {
      const search = url.searchParams.get('search')?.toLowerCase() ?? '';
      const cursor = url.searchParams.get('cursor');
      const matching = contacts.filter(
        (contact) =>
          !search ||
          contact.name.toLowerCase().includes(search) ||
          (contact.email ?? '').toLowerCase().includes(search) ||
          (contact.company ?? '').toLowerCase().includes(search),
      );
      const pageSize = 2;
      const start = cursor ? Number(cursor) : 0;
      const page = matching.slice(start, start + pageSize);
      const next = start + pageSize < matching.length ? String(start + pageSize) : null;
      return Promise.resolve(
        jsonResponse(200, { data: page, nextCursor: next, hasMore: next !== null }),
      );
    }
    if (url.pathname.endsWith('/contacts') && method === 'POST') {
      const status = postStatus ?? 201;
      if (status >= 400) {
        return Promise.resolve(jsonResponse(status, postBody ?? {}));
      }
      const body = JSON.parse(String(init?.body)) as Partial<Contact>;
      const created: Contact = {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        orgId: adminUser.orgId,
        name: body.name ?? '',
        email: body.email ?? null,
        phone: body.phone ?? null,
        company: body.company ?? null,
        source: body.source ?? null,
        ownerId: adminUser.id,
        deletedAt: null,
        createdAt: '2026-11-14T00:00:00.000Z',
        updatedAt: '2026-11-14T00:00:00.000Z',
      };
      contacts.unshift(created);
      return Promise.resolve(jsonResponse(201, created));
    }
    if (url.pathname.includes('/contacts/') && method === 'PATCH') {
      const id = url.pathname.split('/').pop();
      const changes = JSON.parse(String(init?.body)) as Partial<Contact>;
      const existing = contacts.find((contact) => contact.id === id);
      if (!existing) {
        return Promise.resolve(jsonResponse(404, { code: 'CONTACT_NOT_FOUND', message: 'missing' }));
      }
      Object.assign(existing, changes);
      return Promise.resolve(jsonResponse(200, existing));
    }
    if (url.pathname.includes('/contacts/') && method === 'DELETE') {
      const status = deleteStatus ?? 204;
      if (status >= 400) {
        return Promise.resolve(jsonResponse(status, { code: 'INTERNAL_ERROR', message: 'failed' }));
      }
      const id = url.pathname.split('/').pop();
      const index = contacts.findIndex((contact) => contact.id === id);
      if (index >= 0) {
        contacts.splice(index, 1);
      }
      return Promise.resolve(jsonResponse(204, null));
    }
    return Promise.resolve(jsonResponse(404, { code: 'NOT_FOUND', message: 'missing' }));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderContacts(): void {
  window.history.pushState({}, '', '/contacts');
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

describe('contacts page (T221)', () => {
  it('lists contacts and loads the next cursor page', async () => {
    const fetchMock = stubApi({ contacts: [firstContact, secondContact, { ...firstContact, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Lê Hoàng Chi', email: 'chi@acme.test' }] });
    renderContacts();

    expect(await screen.findByText('Nguyễn Văn An')).toBeInTheDocument();
    expect(screen.getByText('Trần Thị Bình')).toBeInTheDocument();
    expect(screen.queryByText('Lê Hoàng Chi')).not.toBeInTheDocument();

    const listCalls = () =>
      fetchMock.mock.calls.filter(([input, init]) => {
        const url = String(input);
        return url.includes('/contacts?') && (init?.method ?? 'GET') === 'GET';
      });
    expect(listCalls()).toHaveLength(1);
    expect(String(listCalls()[0]?.[0])).not.toContain('cursor=');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Tải thêm' }));

    expect(await screen.findByText('Lê Hoàng Chi')).toBeInTheDocument();
    expect(String(listCalls()[1]?.[0])).toContain('cursor=2');
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });

  it('debounces the search and requests only matching contacts', async () => {
    const fetchMock = stubApi({ contacts: [firstContact, secondContact] });
    const user = userEvent.setup();
    renderContacts();

    await screen.findByText('Nguyễn Văn An');
    await user.type(screen.getByLabelText('Tìm kiếm'), 'bình');

    expect(await screen.findByText('Trần Thị Bình')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Nguyễn Văn An')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes('search=b%C3%ACnh')),
      ).toBe(true),
    );
  });

  it('validates the contact name before calling the API', async () => {
    const fetchMock = stubApi({ contacts: [firstContact] });
    const user = userEvent.setup();
    renderContacts();

    await screen.findByText('Nguyễn Văn An');
    await user.click(screen.getByRole('button', { name: 'Thêm khách hàng' }));

    const dialog = screen.getByRole('dialog', { name: 'Thêm khách hàng' });
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Vui lòng nhập họ và tên.');
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).includes('/contacts') && (init?.method ?? 'GET') === 'POST',
      ),
    ).toBe(false);
  });

  it('creates a contact and refreshes the list', async () => {
    const contacts: Contact[] = [firstContact];
    const fetchMock = stubApi({ contacts });
    const user = userEvent.setup();
    renderContacts();

    await screen.findByText('Nguyễn Văn An');
    await user.click(screen.getByRole('button', { name: 'Thêm khách hàng' }));

    const dialog = screen.getByRole('dialog', { name: 'Thêm khách hàng' });
    await user.type(within(dialog).getByLabelText('Họ và tên'), 'Lê Hoàng Chi');
    await user.type(within(dialog).getByLabelText('Email'), 'chi@acme.test');
    await user.type(within(dialog).getByLabelText('Công ty'), 'Hooli');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = fetchMock.mock.calls.find(
      ([input, init]) => String(input).includes('/contacts') && (init?.method ?? 'GET') === 'POST',
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      name: 'Lê Hoàng Chi',
      email: 'chi@acme.test',
      company: 'Hooli',
    });
    expect(await screen.findByText('Lê Hoàng Chi')).toBeInTheDocument();
  });

  it('surfaces a duplicate email error inside the form', async () => {
    stubApi({
      contacts: [firstContact],
      postStatus: 409,
      postBody: { code: 'CONTACT_EMAIL_EXISTS', message: 'duplicate' },
    });
    const user = userEvent.setup();
    renderContacts();

    await screen.findByText('Nguyễn Văn An');
    await user.click(screen.getByRole('button', { name: 'Thêm khách hàng' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm khách hàng' });
    await user.type(within(dialog).getByLabelText('Họ và tên'), 'Nguyễn Văn An');
    await user.type(within(dialog).getByLabelText('Email'), 'an@acme.test');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Email này đã được dùng cho một khách hàng khác.',
    );
  });

  it('edits a contact through the prefilled form', async () => {
    const contacts: Contact[] = [firstContact];
    const fetchMock = stubApi({ contacts });
    const user = userEvent.setup();
    renderContacts();

    await screen.findByText('Nguyễn Văn An');
    await user.click(screen.getByRole('button', { name: `Sửa ${firstContact.name}` }));

    const dialog = screen.getByRole('dialog', { name: 'Sửa khách hàng' });
    const nameInput = within(dialog).getByLabelText('Họ và tên');
    expect(nameInput).toHaveValue('Nguyễn Văn An');
    await user.clear(nameInput);
    await user.type(nameInput, 'Nguyễn Văn An (cập nhật)');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const patch = fetchMock.mock.calls.find(([, init]) => (init?.method ?? 'GET') === 'PATCH');
    expect(String(patch?.[0])).toContain(`/contacts/${firstContact.id}`);
    expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({
      name: 'Nguyễn Văn An (cập nhật)',
    });
    expect(await screen.findByText('Nguyễn Văn An (cập nhật)')).toBeInTheDocument();
  });

  it('deletes a contact after confirmation', async () => {
    const contacts: Contact[] = [firstContact];
    const fetchMock = stubApi({ contacts });
    const user = userEvent.setup();
    renderContacts();

    await screen.findByText('Nguyễn Văn An');
    await user.click(screen.getByRole('button', { name: `Xoá ${firstContact.name}` }));

    const dialog = screen.getByRole('dialog', { name: 'Xoá khách hàng' });
    expect(dialog).toHaveTextContent('Nguyễn Văn An');
    await user.click(within(dialog).getByRole('button', { name: 'Xoá' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).includes(`/contacts/${firstContact.id}`) &&
          (init?.method ?? 'GET') === 'DELETE',
      ),
    ).toBe(true);
    await waitFor(() => expect(screen.queryByText('Nguyễn Văn An')).not.toBeInTheDocument());
  });
});
