import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AppProviders } from './app/providers';

const healthPayload = {
  status: 'ok',
  checks: { database: 'up', redis: 'up' },
};

beforeEach(() => {
  window.history.pushState({}, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => healthPayload,
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('web shell', () => {
  it('renders the layout and the empty state without errors', async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Tổng quan' })).toBeInTheDocument();
    expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument();
    expect(await screen.findByText('Máy chủ: Sẵn sàng')).toBeInTheDocument();
  });

  it('renders the login placeholder', () => {
    window.history.pushState({}, '', '/login');
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeDisabled();
  });

  it('renders the not-found page for an unknown route', () => {
    window.history.pushState({}, '', '/missing');
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
  });
});
