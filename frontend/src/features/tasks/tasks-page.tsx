import { useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type { Activity, ActivityListResponse, TaskStatusValue } from '@pulse/shared';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { fetchUserOptions } from '../../lib/api/user-options';
import { useAuth } from '../auth/auth-context';
import { fetchTasks, taskErrorMessage, taskKeys, updateTask } from './task-api';

const TABS: Array<{ id: TaskStatusValue; label: string }> = [
  { id: 'open', label: 'Đang mở' },
  { id: 'overdue', label: 'Quá hạn' },
  { id: 'done', label: 'Đã xong' },
];

const timestampFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function formatTimestamp(value: string): string {
  return timestampFormatter.format(new Date(value));
}

function isOverdue(task: Activity): boolean {
  return task.doneAt === null && task.dueAt !== null && new Date(task.dueAt).getTime() < Date.now();
}

/** `/tasks` (T317, FR-07.4..07.7): Open/Overdue/Done tabs, overdue badge and idempotent mark-done. */
export function TasksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';

  const [tab, setTab] = useState<TaskStatusValue>('open');
  const [actionError, setActionError] = useState<string | null>(null);

  const tasksQuery = useInfiniteQuery({
    queryKey: taskKeys.list(tab),
    queryFn: ({ pageParam }) => fetchTasks(tab, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: Boolean(user),
  });

  // Display names come from the Admin-only directory; other roles see a short label.
  const usersQuery = useQuery({
    queryKey: ['users', 'options'],
    queryFn: fetchUserOptions,
    enabled: isAdmin,
  });

  const doneMutation = useMutation({
    mutationFn: (task: Activity) => updateTask(task.id, { done: true }),
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      const previous = queryClient.getQueriesData<InfiniteData<ActivityListResponse>>({
        queryKey: taskKeys.all,
      });
      queryClient.setQueriesData<InfiniteData<ActivityListResponse>>(
        { queryKey: taskKeys.all },
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) => ({
                  ...page,
                  data: page.data.filter((item) => item.id !== task.id),
                })),
              }
            : current,
      );
      return { previous };
    },
    onError: (error, _task, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
      setActionError(taskErrorMessage(error, 'Không thể cập nhật công việc.'));
    },
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });

  const tasks = tasksQuery.data?.pages.flatMap((page) => page.data) ?? [];

  function assigneeLabel(value: string | null): string {
    if (!value) {
      return 'Chưa gán';
    }
    if (value === user?.id) {
      return 'Tôi';
    }
    const member = usersQuery.data?.find((item) => item.id === value);
    return member?.name ?? `Thành viên ${value.slice(0, 8)}`;
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Công việc</h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi việc cần làm theo hạn hoàn thành; việc quá hạn được đánh dấu rõ ràng.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lọc công việc">
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

      <Card>
        <CardContent className="space-y-4 p-6">
          {actionError ? (
            <p role="alert" className="text-sm text-red-600">
              {actionError}
            </p>
          ) : null}
          {tasksQuery.isError ? (
            <p role="alert" className="text-sm text-red-600">
              Không thể tải danh sách công việc.
            </p>
          ) : null}

          {tasksQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : tasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-6 py-12 text-center">
              <p className="text-base font-medium">Không có công việc</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === 'open'
                  ? 'Bạn không có việc nào đang chờ xử lý.'
                  : tab === 'overdue'
                    ? 'Không có việc nào quá hạn.'
                    : 'Chưa có việc nào hoàn thành.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium break-words">{task.content}</p>
                    <p className="text-xs text-muted-foreground">
                      Hạn {task.dueAt ? formatTimestamp(task.dueAt) : '—'} ·{' '}
                      {assigneeLabel(task.assigneeId)}
                      {task.doneAt ? ` · Đã xong ${formatTimestamp(task.doneAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOverdue(task) ? (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Quá hạn
                      </span>
                    ) : null}
                    {tab !== 'done' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`Đánh dấu xong: ${task.content}`}
                        disabled={doneMutation.isPending}
                        onClick={() => doneMutation.mutate(task)}
                      >
                        Đánh dấu xong
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {tasksQuery.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => void tasksQuery.fetchNextPage()}
                disabled={tasksQuery.isFetchingNextPage}
              >
                {tasksQuery.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
