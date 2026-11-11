import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AppProviders } from './app/providers';

const healthPayload = { status: 'ok', checks: { database: 'up', redis: 'up' } };

const authUser = {
  id: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  email: 'admin@acme.test',
  name: 'Admin Acme',
  role: 'ADMIN' as const,
  active: true,
  createdAt: '2026-11-11T00:00:00.000Z',
};

const authResponse = { accessToken: 'access-token-value', tokenType: 'Bearer' as const, expiresIn: 900, user: authUser };

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface MockOptions {
  loginStatus?: number;
  loginBody?: unknown;
  refreshStatus?: number;
  meStatus?: number;
}

function stubFetch(options: MockOptions = {}): ReturnType<typeof vi.fn> {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.includes('/health/ready')) {
      return Promise.resolve(jsonResponse(200, healthPayload));
    }
    if (url.includes('/auth/refresh')) {
      const status = options.refreshStatus ?? 401;
      return Promise.resolve(jsonResponse(status, status === 401 ? { code: 'TOKEN_INVALID', message: 'no session' } : authResponse));
    }
    if (url.includes('/auth/login')) {
      const status = options.loginStatus ?? 200;
      return Promise.resolve(jsonResponse(status, options.loginBody ?? authResponse));
    }
    if (url.includes('/auth/logout')) {
      return Promise.resolve(jsonResponse(204, null));
    }
    if (url.includes('/auth/me')) {
      const status = options.meStatus ?? 200;
      return Promise.resolve(jsonResponse(status, authUser));
    }
    if (method === 'POST') {
      return Promise.resolve(jsonResponse(201, authResponse));
    }
    return Promise.resolve(jsonResponse(404, { code: 'NOT_FOUND', message: 'missing' }));
  });

  vi.stubGlobal('fetch', mock);
  return mock;
}

function renderAt(path: string): void {
  window.history.pushState({}, '', path);
  render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('web shell', () => {
  it('renders the layout and the empty state without errors', async () => {
    stubFetch();
    renderAt('/');

    expect(screen.getByRole('heading', { name: 'Tổng quan' })).toBeInTheDocument();
    expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument();
    expect(await screen.findByText('Máy chủ: Sẵn sàng')).toBeInTheDocument();
  });

  it('renders the login form for anonymous visitors', async () => {
    stubFetch();
    renderAt('/login');

    expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeEnabled();
    expect(screen.getByLabelText('Mật khẩu')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeEnabled();
  });

  it('redirects a protected route to the login page when anonymous', async () => {
    stubFetch();
    renderAt('/account');

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
  });

  it('renders the not-found page for an unknown route', () => {
    stubFetch();
    renderAt('/missing');

    expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
  });
});

describe('authentication flow (T118)', () => {
  it('signs in, keeps the token in memory and shows the current user', async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderAt('/login');

    await user.type(screen.getByLabelText('Email'), 'admin@acme.test');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Password123!');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByTestId('current-user')).toHaveTextContent('Admin Acme');
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Tổng quan' })).toBeInTheDocument();

    const loginCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/auth/login'));
    expect(loginCall?.[1]).toMatchObject({ method: 'POST', credentials: 'include' });
    // ADR-015: the access token never lands in web storage.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('surfaces a login error without leaving the page', async () => {
    stubFetch({ loginStatus: 401, loginBody: { code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không đúng.' } });
    const user = userEvent.setup();
    renderAt('/login');

    await user.type(screen.getByLabelText('Email'), 'admin@acme.test');
    await user.type(screen.getByLabelText('Mật khẩu'), 'WrongPassword123!');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng.');
  });

  it('restores the session from the refresh cookie on start-up', async () => {
    stubFetch({ refreshStatus: 200 });
    renderAt('/');

    expect(await screen.findByTestId('current-user')).toHaveTextContent('Admin Acme');
  });

  it('creates an account from the register form', async () => {
    stubFetch();
    const user = userEvent.setup();
    renderAt('/register');

    await user.type(screen.getByLabelText('Tên công ty'), 'Acme');
    await user.type(screen.getByLabelText('Họ và tên'), 'Admin Acme');
    await user.type(screen.getByLabelText('Email'), 'admin@acme.test');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Password123!');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await screen.findByTestId('current-user')).toHaveTextContent('Admin Acme');
  });

  it('blocks a too-short password client-side', async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderAt('/register');

    await user.type(screen.getByLabelText('Tên công ty'), 'Acme');
    await user.type(screen.getByLabelText('Họ và tên'), 'Admin Acme');
    await user.type(screen.getByLabelText('Email'), 'admin@acme.test');
    await user.type(screen.getByLabelText('Mật khẩu'), 'short');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('tối thiểu 12 ký tự');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/auth/register'))).toBe(false),
    );
  });

  it('signs out and returns to the login page', async () => {
    stubFetch({ refreshStatus: 200 });
    const user = userEvent.setup();
    renderAt('/');

    await screen.findByTestId('current-user');
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.queryByTestId('current-user')).not.toBeInTheDocument();
  });
});
