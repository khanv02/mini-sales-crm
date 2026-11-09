import { useQuery } from '@tanstack/react-query';
import type { HealthReport } from '@pulse/shared';
import { apiFetch } from '../../lib/api/client';

export function HealthIndicator() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthReport>('/health/ready'),
    retry: false,
    refetchInterval: 30_000,
  });

  const label = health.isError ? 'Mất kết nối' : health.data ? 'Sẵn sàng' : 'Đang kiểm tra';
  const color = health.isError ? 'bg-red-500' : health.data ? 'bg-emerald-500' : 'bg-amber-500';

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
      <span>Máy chủ: {label}</span>
    </div>
  );
}
