import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md space-y-3 text-center">
            <h1 className="text-xl font-semibold">Đã xảy ra lỗi</h1>
            <p className="text-sm text-muted-foreground">
              Giao diện gặp sự cố không mong muốn. Vui lòng tải lại trang.
            </p>
            <Button onClick={() => window.location.reload()}>Tải lại</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
