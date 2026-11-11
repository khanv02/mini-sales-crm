import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/auth-context';
import { HealthIndicator } from '../features/health/health-indicator';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

const publicNavigation = [{ label: 'Tổng quan', to: '/' }];

export function Layout() {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();

  const navigation =
    status === 'authenticated'
      ? [...publicNavigation, { label: 'Tài khoản', to: '/account' }]
      : [
          ...publicNavigation,
          { label: 'Đăng nhập', to: '/login' },
          { label: 'Đăng ký', to: '/register' },
        ];

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
  }

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
          <div className="flex items-center gap-4">
            <HealthIndicator />
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground" data-testid="current-user">
                  {user.name}
                </span>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  Đăng xuất
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
