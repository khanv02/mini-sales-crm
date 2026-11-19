import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Deal, Stage } from '@pulse/shared';
import { cn } from '../../lib/utils';
import type { Assignee } from './deal-api';
import { formatDealValue } from './deal-format';

const dateFormatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'UTC' });

interface KanbanCardProps {
  deal: Deal;
  stages: Stage[];
  ownerLabel: string;
  assignees: Assignee[];
  canAssign: boolean;
  disabled: boolean;
  onMove: (deal: Deal, stageId: string) => void;
  onAssign: (deal: Deal, ownerId: string) => void;
  onEdit: (deal: Deal) => void;
  onTimeline: (deal: Deal) => void;
}

function KanbanCard({
  deal,
  stages,
  ownerLabel,
  assignees,
  canAssign,
  disabled,
  onMove,
  onAssign,
  onEdit,
  onTimeline,
}: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = { transform: CSS.Translate.toString(transform) };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-md border border-border bg-card p-3 text-sm shadow-sm',
        isDragging && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug">{deal.title}</p>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={`Lịch sử ${deal.title}`}
            onClick={() => onTimeline(deal)}
            className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Lịch sử
          </button>
          <button
            type="button"
            aria-label={`Sửa ${deal.title}`}
            onClick={() => onEdit(deal)}
            className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Sửa
          </button>
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Kéo ${deal.title}`}
            className="cursor-grab rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground active:cursor-grabbing"
          >
            Kéo
          </button>
        </div>
      </div>
      <p className="mt-1 font-medium">{formatDealValue(deal.value, deal.currency)}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground" title={ownerLabel}>
        {ownerLabel}
      </p>
      {deal.expectedClose ? (
        <p className="text-xs text-muted-foreground">
          Dự kiến chốt {dateFormatter.format(new Date(deal.expectedClose))}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="sr-only">Chuyển stage {deal.title}</span>
          <select
            aria-label={`Chuyển stage ${deal.title}`}
            className="h-7 rounded border border-input bg-background px-1 text-xs"
            value={deal.stageId}
            disabled={disabled}
            onChange={(event) => {
              if (event.target.value !== deal.stageId) {
                onMove(deal, event.target.value);
              }
            }}
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
        {canAssign ? (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="sr-only">Phụ trách {deal.title}</span>
            <select
              aria-label={`Phụ trách ${deal.title}`}
              className="h-7 max-w-32 rounded border border-input bg-background px-1 text-xs"
              value={deal.ownerId}
              disabled={disabled}
              onChange={(event) => onAssign(deal, event.target.value)}
            >
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </article>
  );
}

interface KanbanColumnProps {
  stage: Stage;
  deals: Deal[];
  stages: Stage[];
  assigneeLabel: (ownerId: string) => string;
  assignees: Assignee[];
  canAssign: boolean;
  busyDealId: string | null;
  onMove: (deal: Deal, stageId: string) => void;
  onAssign: (deal: Deal, ownerId: string) => void;
  onEdit: (deal: Deal) => void;
  onTimeline: (deal: Deal) => void;
}

function KanbanColumn({
  stage,
  deals,
  stages,
  assigneeLabel,
  assignees,
  canAssign,
  busyDealId,
  onMove,
  onAssign,
  onEdit,
  onTimeline,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const ordered = [...deals].sort(
    (left, right) => left.position - right.position || left.id.localeCompare(right.id),
  );

  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${stage.id}`}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30',
        isOver && 'ring-2 ring-ring',
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">
          {stage.name}
          {stage.isWon ? <span className="ml-1 text-xs font-normal">(thắng)</span> : null}
          {stage.isLost ? <span className="ml-1 text-xs font-normal">(thua)</span> : null}
        </h2>
        <span className="text-xs text-muted-foreground">{ordered.length}</span>
      </header>
      <div className="flex-1 space-y-2 p-3">
        {ordered.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có deal.</p>
        ) : (
          ordered.map((deal) => (
            <KanbanCard
              key={deal.id}
              deal={deal}
              stages={stages}
              ownerLabel={assigneeLabel(deal.ownerId)}
              assignees={assignees}
              canAssign={canAssign}
              disabled={busyDealId === deal.id}
              onMove={onMove}
              onAssign={onAssign}
              onEdit={onEdit}
              onTimeline={onTimeline}
            />
          ))
        )}
      </div>
    </section>
  );
}

interface KanbanBoardProps {
  stages: Stage[];
  deals: Deal[];
  assignees: Assignee[];
  canAssign: boolean;
  busyDealId: string | null;
  onMove: (deal: Deal, stageId: string) => void;
  onAssign: (deal: Deal, ownerId: string) => void;
  onEdit: (deal: Deal) => void;
  onTimeline: (deal: Deal) => void;
}

/** Kanban columns per stage with dnd-kit (T223, AC-FR05-02). */
export function KanbanBoard({
  stages,
  deals,
  assignees,
  canAssign,
  busyDealId,
  onMove,
  onAssign,
  onEdit,
  onTimeline,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeDeal = deals.find((deal) => deal.id === activeId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  function ownerLabel(ownerId: string): string {
    return assignees.find((assignee) => assignee.id === ownerId)?.label ?? ownerId.slice(0, 8);
  }

  function handleDragStart(event: DragStartEvent): void {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveId(null);
    const deal = deals.find((item) => item.id === event.active.id);
    const stage = stages.find((item) => item.id === event.over?.id);
    if (!deal || !stage || stage.id === deal.stageId) {
      return;
    }
    onMove(deal, stage.id);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-2">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            deals={deals.filter((deal) => deal.stageId === stage.id)}
            stages={stages}
            assigneeLabel={ownerLabel}
            assignees={assignees}
            canAssign={canAssign}
            busyDealId={busyDealId}
            onMove={onMove}
            onAssign={onAssign}
            onEdit={onEdit}
            onTimeline={onTimeline}
          />
        ))}
      </div>
      <DragOverlay>
        {activeDeal ? (
          <div className="w-64 rounded-md border border-border bg-card p-3 text-sm shadow-lg">
            <p className="font-medium">{activeDeal.title}</p>
            <p className="mt-1">{formatDealValue(activeDeal.value, activeDeal.currency)}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
