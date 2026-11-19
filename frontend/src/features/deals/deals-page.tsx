import { useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type { Deal, DealListResponse } from '@pulse/shared';
import { Button } from '../../components/ui/button';
import { useAuth } from '../auth/auth-context';
import { fetchUserOptions } from '../../lib/api/user-options';
import { ApiClientError } from '../../lib/api/client';
import { fetchPipelines, pipelineKeys } from '../pipelines/pipeline-api';
import {
  assignDeal,
  dealErrorMessage,
  dealKeys,
  fetchDeals,
  moveDeal,
  type Assignee,
} from './deal-api';
import { DealFormDialog } from './deal-form-dialog';
import { KanbanBoard } from './kanban-board';
import { LostReasonDialog } from './lost-reason-dialog';
import { DealTimelineDialog } from './Timeline';

interface MoveInput {
  deal: Deal;
  stageId: string;
  index: number;
  lostReason?: string;
}

/** `/deals` (T223–T224, FR-05/FR-06): kanban board, optimistic moves, deal form and win/loss. */
export function DealsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';
  const canAssign = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [formState, setFormState] = useState<{ deal: Deal | null } | null>(null);
  const [timelineDeal, setTimelineDeal] = useState<Deal | null>(null);
  const [pendingLostMove, setPendingLostMove] = useState<{
    deal: Deal;
    stageId: string;
    index: number;
  } | null>(null);

  const pipelinesQuery = useQuery({
    queryKey: pipelineKeys.all,
    queryFn: fetchPipelines,
    enabled: Boolean(user),
  });

  const pipelines = pipelinesQuery.data ?? [];
  const selected = pipelines.find((item) => item.id === selectedPipelineId) ?? pipelines[0] ?? null;
  const queryKey = dealKeys.board(selected?.id ?? '');

  const dealsQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchDeals(selected?.id ?? '', pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: Boolean(selected?.id),
  });

  // `GET /users` is Admin-only, so only Admin gets display names; other roles see a short label.
  const usersQuery = useQuery({
    queryKey: ['users', 'options'],
    queryFn: fetchUserOptions,
    enabled: isAdmin,
  });

  const deals = dealsQuery.data?.pages.flatMap((page) => page.data) ?? [];

  const assignees: Assignee[] = [];
  const seen = new Set<string>();
  if (user) {
    assignees.push({ id: user.id, label: 'Tôi' });
    seen.add(user.id);
  }
  for (const member of usersQuery.data ?? []) {
    if (!seen.has(member.id)) {
      assignees.push({ id: member.id, label: member.id === user?.id ? 'Tôi' : member.name });
      seen.add(member.id);
    }
  }
  for (const deal of deals) {
    if (!seen.has(deal.ownerId)) {
      assignees.push({ id: deal.ownerId, label: `Thành viên ${deal.ownerId.slice(0, 8)}` });
      seen.add(deal.ownerId);
    }
  }

  const moveMutation = useMutation({
    mutationFn: ({ deal, stageId, index, lostReason }: MoveInput) =>
      moveDeal(deal.id, {
        stageId,
        position: index,
        version: deal.version,
        ...(lostReason ? { lostReason } : {}),
      }),
    onMutate: async ({ deal, stageId }: MoveInput) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<InfiniteData<DealListResponse>>(queryKey);
      const stage = selected?.stages.find((item) => item.id === stageId);
      if (!stage) {
        return { snapshot };
      }
      const targetDeals = deals.filter((item) => item.stageId === stageId && item.id !== deal.id);
      const lastPosition = targetDeals.reduce((max, item) => Math.max(max, item.position), 0);
      const optimistic: Deal = {
        ...deal,
        stageId,
        position: lastPosition + 1,
        status: stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN',
      };
      queryClient.setQueryData<InfiniteData<DealListResponse>>(queryKey, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                data: page.data.map((item) => (item.id === deal.id ? optimistic : item)),
              })),
            }
          : current,
      );
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(queryKey, context.snapshot);
      }
      setPendingLostMove(null);
      setToast(dealErrorMessage(error, 'Không thể chuyển deal.'));
      if (error instanceof ApiClientError && error.code === 'DEAL_VERSION_CONFLICT') {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onSuccess: async () => {
      setPendingLostMove(null);
      setToast(null);
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ deal, ownerId }: { deal: Deal; ownerId: string }) =>
      assignDeal(deal.id, { ownerId, version: deal.version }),
    onSuccess: async () => {
      setToast(null);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => setToast(dealErrorMessage(error, 'Không thể gán người phụ trách.')),
  });

  function handleMove(deal: Deal, stageId: string): void {
    if (!selected || stageId === deal.stageId) {
      return;
    }
    const stage = selected.stages.find((item) => item.id === stageId);
    if (!stage) {
      return;
    }
    const targetDeals = deals.filter((item) => item.stageId === stageId && item.id !== deal.id);
    setToast(null);
    if (stage.isLost) {
      // A lost move needs a reason before it reaches the API (FR-06.1).
      setPendingLostMove({ deal, stageId, index: targetDeals.length });
      return;
    }
    moveMutation.mutate({ deal, stageId, index: targetDeals.length });
  }

  const busyDealId = moveMutation.isPending
    ? (moveMutation.variables?.deal.id ?? null)
    : assignMutation.isPending
      ? (assignMutation.variables?.deal.id ?? null)
      : null;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cơ hội bán hàng</h1>
          <p className="text-sm text-muted-foreground">
            Tạo deal, kéo deal giữa các stage hoặc dùng menu để chuyển stage và gán người phụ
            trách.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setFormState({ deal: null })}
          disabled={!selected}
        >
          Thêm deal
        </Button>
      </div>

      {pipelinesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : null}
      {pipelinesQuery.isError ? (
        <p role="alert" className="text-sm text-red-600">
          Không thể tải danh sách quy trình.
        </p>
      ) : null}
      {!pipelinesQuery.isLoading && pipelines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có quy trình bán hàng. Quản trị viên cần tạo quy trình trước.
        </p>
      ) : null}

      {selected ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {pipelines.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={item.id === selected.id ? 'default' : 'outline'}
                aria-pressed={item.id === selected.id}
                onClick={() => setSelectedPipelineId(item.id)}
              >
                {item.name}
              </Button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">{deals.length} deal</span>
          </div>

          {toast ? (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              <p>{toast}</p>
              <Button type="button" size="sm" variant="ghost" onClick={() => setToast(null)}>
                Đóng
              </Button>
            </div>
          ) : null}

          {dealsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : null}
          {dealsQuery.isError ? (
            <p role="alert" className="text-sm text-red-600">
              Không thể tải danh sách deal.
            </p>
          ) : null}

          {selected.stages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Quy trình chưa có stage nào.</p>
          ) : (
            <KanbanBoard
              stages={selected.stages}
              deals={deals}
              assignees={assignees}
              canAssign={canAssign}
              busyDealId={busyDealId}
              onMove={handleMove}
              onAssign={(deal, ownerId) => assignMutation.mutate({ deal, ownerId })}
              onEdit={(deal) => setFormState({ deal })}
              onTimeline={(deal) => setTimelineDeal(deal)}
            />
          )}

          {dealsQuery.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => void dealsQuery.fetchNextPage()}
                disabled={dealsQuery.isFetchingNextPage}
              >
                {dealsQuery.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {formState && selected ? (
        <DealFormDialog
          deal={formState.deal}
          pipeline={selected}
          onClose={() => setFormState(null)}
        />
      ) : null}

      {timelineDeal ? (
        <DealTimelineDialog
          deal={timelineDeal}
          assignees={assignees}
          onClose={() => setTimelineDeal(null)}
        />
      ) : null}

      {pendingLostMove ? (
        <LostReasonDialog
          deal={pendingLostMove.deal}
          pending={moveMutation.isPending}
          error={
            moveMutation.isError
              ? dealErrorMessage(moveMutation.error, 'Không thể chuyển deal.')
              : null
          }
          onCancel={() => setPendingLostMove(null)}
          onConfirm={(lostReason) =>
            moveMutation.mutate({ ...pendingLostMove, lostReason })
          }
        />
      ) : null}
    </section>
  );
}
