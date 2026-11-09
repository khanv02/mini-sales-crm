import { Link, NavLink, Outlet } from 'react-router-dom';
import { HealthIndicator } from '../features/health/health-indicator';
import { cn } from '../lib/utils';

const navigation = [
  { label: 'Tổng quan', to: '/' },
  { label: 'Đăng nhập', to: '/login' },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-lg font-semibold tracking-tight">
              Pulse CRM
            </Link>
            <nav className="flex items-center gap-4" aria-label="Điều hướng chính">
              {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'text-sm text-muted-foreground transition-colors hover:text-foreground',
                      isActive && 'font-medium text-foreground',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <HealthIndicator />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
