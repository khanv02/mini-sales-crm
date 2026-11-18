import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Stage, StageCreateRequest, StageUpdateRequest } from '@pulse/shared';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { useAuth } from '../auth/auth-context';
import {
  createPipeline,
  createStage,
  deletePipeline,
  deleteStage,
  fetchPipelines,
  pipelineErrorMessage,
  pipelineKeys,
  saveStageOrder,
  updatePipeline,
  updateStage,
} from './pipeline-api';
import { ConfirmDialog, PipelineNameDialog, StageCreateDialog } from './pipeline-dialogs';
import { SortableStageRow } from './sortable-stage-row';

interface StageUpdateInput {
  id: string;
  body: StageUpdateRequest;
}

/** `/pipelines` (T222, FR-04): Admin stage editor with drag reorder and delete guards. */
export function PipelinesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = user?.role === 'ADMIN';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [renamingPipeline, setRenamingPipeline] = useState(false);
  const [deletingPipeline, setDeletingPipeline] = useState(false);
  const [creatingStage, setCreatingStage] = useState(false);
  const [deletingStage, setDeletingStage] = useState<Stage | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pipelinesQuery = useQuery({
    queryKey: pipelineKeys.all,
    queryFn: fetchPipelines,
    enabled: Boolean(user),
  });

  const pipelines = pipelinesQuery.data ?? [];
  const selected = pipelines.find((item) => item.id === selectedId) ?? pipelines[0] ?? null;
  const stages = selected?.stages ?? [];
  const wonTaken = stages.some((stage) => stage.isWon);
  const lostTaken = stages.some((stage) => stage.isLost);

  const createPipelineMutation = useMutation({
    mutationFn: createPipeline,
    onSuccess: async (created) => {
      setCreatingPipeline(false);
      setSelectedId(created.id);
      await queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
  });

  const renamePipelineMutation = useMutation({
    mutationFn: (name: string) => updatePipeline(selected?.id ?? '', { name }),
    onSuccess: async () => {
      setRenamingPipeline(false);
      await queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
  });

  const deletePipelineMutation = useMutation({
    mutationFn: deletePipeline,
    onSuccess: async () => {
      setDeletingPipeline(false);
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
  });

  const createStageMutation = useMutation({
    mutationFn: (body: StageCreateRequest) => createStage(selected?.id ?? '', body),
    onSuccess: async () => {
      setCreatingStage(false);
      await queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ id, body }: StageUpdateInput) => updateStage(id, body),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
    onError: (error) => setActionError(pipelineErrorMessage(error, 'Không thể cập nhật stage.')),
  });

  const reorderMutation = useMutation({
    mutationFn: ({ stages: current, orderedIds }: { stages: Stage[]; orderedIds: string[] }) =>
      saveStageOrder(current, orderedIds),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
    onError: (error) => setActionError(pipelineErrorMessage(error, 'Không thể đổi thứ tự stage.')),
  });

  const deleteStageMutation = useMutation({
    mutationFn: deleteStage,
    onSuccess: async () => {
      setDeletingStage(null);
      await queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function persistOrder(ordered: Stage[]): void {
    setActionError(null);
    reorderMutation.mutate({ stages, orderedIds: ordered.map((stage) => stage.id) });
  }

  function moveStage(stage: Stage, direction: -1 | 1): void {
    const index = stages.findIndex((item) => item.id === stage.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= stages.length) {
      return;
    }
    persistOrder(arrayMove(stages, index, target));
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = stages.findIndex((stage) => stage.id === active.id);
    const newIndex = stages.findIndex((stage) => stage.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    persistOrder(arrayMove(stages, oldIndex, newIndex));
  }

  function toggleFlag(stage: Stage, flag: 'isWon' | 'isLost', value: boolean): void {
    setActionError(null);
    updateStageMutation.mutate({
      id: stage.id,
      body: flag === 'isWon' ? { isWon: value } : { isLost: value },
    });
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quy trình bán hàng</h1>
          <p className="text-sm text-muted-foreground">
            Cấu hình pipeline, thứ tự stage và các stage thắng/thua.
          </p>
        </div>
        {canWrite ? (
          <Button type="button" onClick={() => setCreatingPipeline(true)}>
            Thêm quy trình
          </Button>
        ) : null}
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
        <Card>
          <CardContent className="p-6">
            <p className="text-base font-medium">Chưa có quy trình nào</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canWrite
                ? 'Tạo quy trình đầu tiên rồi thêm các stage bán hàng.'
                : 'Quản trị viên chưa cấu hình quy trình bán hàng.'}
            </p>
          </CardContent>
        </Card>
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
                onClick={() => setSelectedId(item.id)}
              >
                {item.name}
              </Button>
            ))}
            {canWrite ? (
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setRenamingPipeline(true)}
                >
                  Đổi tên
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeletingPipeline(true)}
                >
                  Xoá quy trình
                </Button>
              </div>
            ) : null}
          </div>

          {!canWrite ? (
            <p className="text-sm text-muted-foreground">
              Chỉ quản trị viên có thể thay đổi quy trình.
            </p>
          ) : null}

          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold tracking-tight">Các stage</h2>
                {canWrite ? (
                  <Button type="button" size="sm" onClick={() => setCreatingStage(true)}>
                    Thêm stage
                  </Button>
                ) : null}
              </div>

              {actionError ? (
                <p role="alert" className="text-sm text-red-600">
                  {actionError}
                </p>
              ) : null}

              {stages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Quy trình chưa có stage nào.</p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-left text-sm">
                      <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-medium">
                            Thứ tự
                          </th>
                          <th scope="col" className="px-3 py-2 font-medium">
                            Stage
                          </th>
                          <th scope="col" className="px-3 py-2 font-medium">
                            Thắng
                          </th>
                          <th scope="col" className="px-3 py-2 font-medium">
                            Thua
                          </th>
                          {canWrite ? (
                            <th scope="col" className="px-3 py-2 text-right font-medium">
                              Thao tác
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <SortableContext
                        items={stages.map((stage) => stage.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <tbody>
                          {stages.map((stage, index) => (
                            <SortableStageRow
                              key={stage.id}
                              stage={stage}
                              index={index}
                              total={stages.length}
                              canWrite={canWrite}
                              wonTaken={stages.some(
                                (item) => item.isWon && item.id !== stage.id,
                              )}
                              lostTaken={stages.some(
                                (item) => item.isLost && item.id !== stage.id,
                              )}
                              onMove={(direction) => moveStage(stage, direction)}
                              onToggle={(flag, value) => toggleFlag(stage, flag, value)}
                              onRename={(name) =>
                                updateStageMutation.mutate({ id: stage.id, body: { name } })
                              }
                              onDelete={() => setDeletingStage(stage)}
                            />
                          ))}
                        </tbody>
                      </SortableContext>
                    </table>
                  </div>
                </DndContext>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {creatingPipeline ? (
        <PipelineNameDialog
          title="Thêm quy trình"
          label="Tên quy trình"
          initialName=""
          error={
            createPipelineMutation.isError
              ? pipelineErrorMessage(createPipelineMutation.error, 'Không thể tạo quy trình.')
              : null
          }
          pending={createPipelineMutation.isPending}
          onSubmit={(name) => createPipelineMutation.mutate({ name })}
          onClose={() => setCreatingPipeline(false)}
        />
      ) : null}

      {renamingPipeline && selected ? (
        <PipelineNameDialog
          title="Đổi tên quy trình"
          label="Tên quy trình"
          initialName={selected.name}
          error={
            renamePipelineMutation.isError
              ? pipelineErrorMessage(renamePipelineMutation.error, 'Không thể đổi tên quy trình.')
              : null
          }
          pending={renamePipelineMutation.isPending}
          onSubmit={(name) => renamePipelineMutation.mutate(name)}
          onClose={() => setRenamingPipeline(false)}
        />
      ) : null}

      {creatingStage && selected ? (
        <StageCreateDialog
          wonTaken={wonTaken}
          lostTaken={lostTaken}
          error={
            createStageMutation.isError
              ? pipelineErrorMessage(createStageMutation.error, 'Không thể tạo stage.')
              : null
          }
          pending={createStageMutation.isPending}
          onSubmit={(input) => createStageMutation.mutate(input)}
          onClose={() => setCreatingStage(false)}
        />
      ) : null}

      {deletingStage ? (
        <ConfirmDialog
          title="Xoá stage"
          error={
            deleteStageMutation.isError
              ? pipelineErrorMessage(deleteStageMutation.error, 'Không thể xoá stage.')
              : null
          }
          pending={deleteStageMutation.isPending}
          onConfirm={() => deleteStageMutation.mutate(deletingStage.id)}
          onClose={() => setDeletingStage(null)}
        >
          Bạn có chắc muốn xoá stage &quot;{deletingStage.name}&quot;? Hành động này không thể hoàn
          tác.
        </ConfirmDialog>
      ) : null}

      {deletingPipeline && selected ? (
        <ConfirmDialog
          title="Xoá quy trình"
          error={
            deletePipelineMutation.isError
              ? pipelineErrorMessage(deletePipelineMutation.error, 'Không thể xoá quy trình.')
              : null
          }
          pending={deletePipelineMutation.isPending}
          onConfirm={() => deletePipelineMutation.mutate(selected.id)}
          onClose={() => setDeletingPipeline(false)}
        >
          Bạn có chắc muốn xoá quy trình &quot;{selected.name}&quot;? Hành động này không thể hoàn
          tác.
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
