import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
          <p className="text-sm text-muted-foreground">
            Khu vực đăng nhập đang được hoàn thiện và sẽ sớm khả dụng.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Email</span>
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              type="email"
              disabled
              placeholder="ten@congty.vn"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Mật khẩu</span>
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              type="password"
              disabled
              placeholder="••••••••"
            />
          </label>
          <Button className="w-full" disabled>
            Đăng nhập
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
