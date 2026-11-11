import { useQuery } from '@tanstack/react-query';
import type { AuthUser } from '@pulse/shared';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../features/auth/auth-context';
import { apiFetchAuth } from '../lib/api/client';

/** Protected page (T118): reads `/auth/me` through the authenticated client. */
export function AccountPage() {
  const { user } = useAuth();
  const profile = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetchAuth<AuthUser>('/api/v1/auth/me'),
    retry: false,
  });

  const current = profile.data ?? user;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tài khoản</h1>
        <p className="text-sm text-muted-foreground">Thông tin phiên đăng nhập hiện tại.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Phiên đăng nhập</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {profile.isLoading ? <p className="text-muted-foreground">Đang tải…</p> : null}
          {profile.isError ? (
            <p role="alert" className="text-red-600">
              Không thể tải thông tin tài khoản.
            </p>
          ) : null}
          {current ? (
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Họ và tên</dt>
                <dd className="font-medium">{current.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{current.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Vai trò</dt>
                <dd className="font-medium">{current.role}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Công ty</dt>
                <dd className="font-medium">{current.orgId}</dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
