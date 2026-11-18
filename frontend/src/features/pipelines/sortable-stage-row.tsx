import { useState, type FormEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Stage } from '@pulse/shared';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

interface SortableStageRowProps {
  stage: Stage;
  index: number;
  total: number;
  canWrite: boolean;
  wonTaken: boolean;
  lostTaken: boolean;
  onMove: (direction: -1 | 1) => void;
  onToggle: (flag: 'isWon' | 'isLost', value: boolean) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

/** One draggable stage row (AC-FR04-02); non-admin roles get the same data read-only. */
export function SortableStageRow({
  stage,
  index,
  total,
  canWrite,
  wonTaken,
  lostTaken,
  onMove,
  onToggle,
  onRename,
  onDelete,
}: SortableStageRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
    disabled: !canWrite,
  });
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(stage.name);
  const [renameError, setRenameError] = useState<string | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function handleRename(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) {
      setRenameError('Vui lòng nhập tên stage.');
      return;
    }
    setRenameError(null);
    setEditing(false);
    if (trimmed !== stage.name) {
      onRename(trimmed);
    }
  }

  const wonDisabled = !canWrite || stage.isWon || wonTaken;
  const lostDisabled = !canWrite || stage.isLost || lostTaken;
  const wonReason = stage.isWon
    ? 'Không thể bỏ stage thắng của quy trình.'
    : wonTaken
      ? 'Quy trình đã có stage thắng khác.'
      : undefined;
  const lostReason = stage.isLost
    ? 'Không thể bỏ stage thua của quy trình.'
    : lostTaken
      ? 'Quy trình đã có stage thua khác.'
      : undefined;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-border/60 last:border-b-0 ${isDragging ? 'bg-muted/60' : ''}`}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="w-4 text-xs text-muted-foreground">{index + 1}</span>
          {canWrite ? (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Kéo ${stage.name}`}
              className="cursor-grab rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground active:cursor-grabbing"
            >
              Kéo
            </button>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={handleRename}>
            <Input
              aria-label={`Tên ${stage.name}`}
              className="h-8 max-w-56"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              autoFocus
            />
            <Button type="submit" size="sm">
              Lưu
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setRenameError(null);
              }}
            >
              Huỷ
            </Button>
            {renameError ? (
              <span role="alert" className="text-xs text-red-600">
                {renameError}
              </span>
            ) : null}
          </form>
        ) : (
          <span data-testid="stage-name" className="font-medium">
            {stage.name}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          aria-label={`Thắng ${stage.name}`}
          checked={stage.isWon}
          disabled={wonDisabled}
          title={wonReason}
          onChange={(event) => onToggle('isWon', event.target.checked)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          aria-label={`Thua ${stage.name}`}
          checked={stage.isLost}
          disabled={lostDisabled}
          title={lostReason}
          onChange={(event) => onToggle('isLost', event.target.checked)}
        />
      </td>
      {canWrite ? (
        <td className="px-3 py-2">
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Đưa ${stage.name} lên`}
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              Lên
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Đưa ${stage.name} xuống`}
              disabled={index === total - 1}
              onClick={() => onMove(1)}
            >
              Xuống
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Sửa ${stage.name}`}
              onClick={() => {
                setDraftName(stage.name);
                setEditing(true);
              }}
            >
              Sửa
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Xoá ${stage.name}`}
              onClick={onDelete}
            >
              Xoá
            </Button>
          </div>
        </td>
      ) : null}
    </tr>
  );
}
