import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { RegisterForm } from '../features/auth/register-form';

export function RegisterPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Tạo tài khoản</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tài khoản đầu tiên trở thành quản trị viên của công ty bạn.
          </p>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
      </Card>
    </div>
  );
}
