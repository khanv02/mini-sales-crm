import { Link } from 'react-router-dom';
import { buttonStyles } from '../lib/button-styles';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Không tìm thấy trang</h1>
      <p className="text-sm text-muted-foreground">Đường dẫn bạn mở không tồn tại hoặc đã bị di chuyển.</p>
      <Link to="/" className={buttonStyles()}>
        Về trang tổng quan
      </Link>
    </div>
  );
}
