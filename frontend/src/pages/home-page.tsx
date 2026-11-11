import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export function HomePage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tổng quan</h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi khách hàng, cơ hội bán hàng và công việc trong ngày.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bảng điều khiển</CardTitle>
          <p className="text-sm text-muted-foreground">
            Số liệu khách hàng và cơ hội bán hàng sẽ xuất hiện tại đây.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-6 py-12 text-center">
            <p className="text-base font-medium">Chưa có dữ liệu</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Khi bạn thêm khách hàng và cơ hội bán hàng, tổng quan sẽ được cập nhật tự động.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
