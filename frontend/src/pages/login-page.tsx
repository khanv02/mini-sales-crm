import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LoginForm } from '../features/auth/login-form';

export function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sử dụng email và mật khẩu do quản trị viên cấp để tiếp tục.
          </p>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
