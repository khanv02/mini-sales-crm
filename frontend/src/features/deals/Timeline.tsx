import { useState, type FormEvent } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  Activity,
  ActivityCreateRequest,
  ActivityTypeValue,
  Deal,
} from '@pulse/shared';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useAuth } from '../auth/auth-context';
import {
  activityErrorMessage,
  activityKeys,
  createActivity,
  fetchDealActivities,
} from './activity-api';
import type { Assignee } from './deal-api';

const TYPE_LABELS: Record<ActivityTypeValue, string> = {
  NOTE: 'Ghi chú',
  CALL: 'Cuộc gọi',
  EMAIL: 'Email',
  TASK: 'Công việc',
};

type TimelineTab = 'ALL' | ActivityTypeValue;

const TABS: Array<{ id: TimelineTab; label: string }> = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'NOTE', label: 'Ghi chú' },
  { id: 'CALL', label: 'Cuộc gọi' },
  { id: 'TASK', label: 'Công việc' },
];

type ComposeType = 'NOTE' | 'CALL' | 'TASK';

interface DealTimelineDialogProps {
  deal: Deal;
  assignees: Assignee[];
  onClose: () => void;
}

const timestampFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function formatTimestamp(value: string): string {
  return timestampFormatter.format(new Date(value));
}

/**
 * Deal timeline dialog (T316, FR-07.1..07.4): type tabs, note/call composer and the task form.
 * Content is rendered as text, so HTML in an activity can never execute (AC-FR07 edge case).
 */
export function DealTimelineDialog({ deal, assignees, onClose }: DealTimelineDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TimelineTab>('ALL');
  const [type, setType] = useState<ComposeType>('NOTE');
  const [content, setContent] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assigneeId, setAssigneeId] = useState(user?.id ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const activitiesQuery = useInfiniteQuery({
    queryKey: activityKeys.timeline(deal.id, tab),
    queryFn: ({ pageParam }) =>
      fetchDealActivities(deal.id, tab === 'ALL' ? undefined : tab, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
  });

  const createMutation = useMutation({
    mutationFn: (body: ActivityCreateRequest) => createActivity(deal.id, body),
    onSuccess: async () => {
      setContent('');
      setDueAt('');
      setValidationError(null);
      setTab(type);
      await queryClient.invalidateQueries({ queryKey: activityKeys.all });
    },
  });

  const activities = activitiesQuery.data?.pages.flatMap((page) => page.data) ?? [];

  function assigneeLabel(value: string | null): string {
    if (!value) {
      return 'Chưa gán';
    }
    return assignees.find((item) => item.id === value)?.label ?? value.slice(0, 8);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setValidationError('Vui lòng nhập nội dung.');
      return;
    }
    if (type === 'TASK') {
      if (!dueAt) {
        setValidationError('Vui lòng chọn hạn hoàn thành.');
        return;
      }
      if (!assigneeId) {
        setValidationError('Vui lòng chọn người phụ trách.');
        return;
      }
    }

    setValidationError(null);
    const payload: ActivityCreateRequest = { type, content: trimmed };
    if (type === 'TASK') {
      payload.dueAt = new Date(dueAt).toISOString();
      payload.assigneeId = assigneeId;
    }
    createMutation.mutate(payload);
  }

  const error =
    validationError ??
    (createMutation.isError
      ? activityErrorMessage(createMutation.error, 'Không thể gửi hoạt động.')
      : null);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lịch sử deal"
        className="w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Lịch sử deal</h2>
            <p className="mt-1 text-xs text-muted-foreground">{deal.title}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Lọc hoạt động">
          {TABS.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={tab === item.id ? 'default' : 'outline'}
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Loại</span>
              <select
                name="activityType"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={type}
                onChange={(event) => setType(event.target.value as ComposeType)}
              >
                <option value="NOTE">Ghi chú</option>
                <option value="CALL">Cuộc gọi</option>
                <option value="TASK">Công việc</option>
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Nội dung</span>
              <textarea
                name="content"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-1 focus-visible:ring-ring"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Ghi lại nội dung trao đổi hoặc việc cần làm"
              />
            </label>
          </div>

          {type === 'TASK' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Hạn hoàn thành</span>
                <Input
                  type="datetime-local"
                  name="dueAt"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Người phụ trách</span>
                <select
                  name="assigneeId"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                >
                  {assignees.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? 'Đang gửi…'
                : type === 'TASK'
                  ? 'Tạo công việc'
                  : 'Gửi'}
            </Button>
          </div>
        </form>

        <div className="mt-6 border-t border-border pt-4">
          {activitiesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : null}
          {activitiesQuery.isError ? (
            <p role="alert" className="text-sm text-red-600">
              Không thể tải lịch sử deal.
            </p>
          ) : null}
          {!activitiesQuery.isLoading && activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có hoạt động nào.</p>
          ) : (
            <ul className="space-y-3">
              {activities.map((activity) => (
                <ActivityRow
                  key={activity.id}
                  activity={activity}
                  assigneeLabel={assigneeLabel(activity.assigneeId)}
                />
              ))}
            </ul>
          )}
          {activitiesQuery.hasNextPage ? (
            <div className="mt-3 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void activitiesQuery.fetchNextPage()}
                disabled={activitiesQuery.isFetchingNextPage}
              >
                {activitiesQuery.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ActivityRowProps {
  activity: Activity;
  assigneeLabel: string;
}

function ActivityRow({ activity, assigneeLabel }: ActivityRowProps) {
  return (
    <li className="rounded-md border border-border/70 px-3 py-2 text-sm">
      <p className="text-xs text-muted-foreground">
        {TYPE_LABELS[activity.type]} · {formatTimestamp(activity.createdAt)}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words">{activity.content}</p>
      {activity.type === 'TASK' ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Hạn {activity.dueAt ? formatTimestamp(activity.dueAt) : '—'} · {assigneeLabel}
          {activity.doneAt ? ` · Đã xong ${formatTimestamp(activity.doneAt)}` : ''}
        </p>
      ) : null}
    </li>
  );
}
