import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

interface DialogShellProps {
  title: string;
  children: ReactNode;
}

function DialogShell({ title, children }: DialogShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {children}
      </div>
    </div>
  );
}

interface PipelineNameDialogProps {
  title: string;
  label: string;
  initialName: string;
  error: string | null;
  pending: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

/** Create/rename pipeline (AC-FR04-01, AC-FR04-02). */
export function PipelineNameDialog({
  title,
  label,
  initialName,
  error,
  pending,
  onSubmit,
  onClose,
}: PipelineNameDialogProps) {
  const [name, setName] = useState(initialName);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('Vui lòng nhập tên quy trình.');
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  }

  return (
    <DialogShell title={title}>
      <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{label}</span>
          <Input
            name="pipelineName"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Quy trình bán hàng"
          />
        </label>
        {localError ?? error ? (
          <p role="alert" className="text-sm text-red-600">
            {localError ?? error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Huỷ
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

interface StageCreateDialogProps {
  wonTaken: boolean;
  lostTaken: boolean;
  error: string | null;
  pending: boolean;
  onSubmit: (input: { name: string; isWon?: boolean; isLost?: boolean }) => void;
  onClose: () => void;
}

/** New stage at the end of the pipeline (AC-FR04-01). */
export function StageCreateDialog({
  wonTaken,
  lostTaken,
  error,
  pending,
  onSubmit,
  onClose,
}: StageCreateDialogProps) {
  const [name, setName] = useState('');
  const [isWon, setIsWon] = useState(false);
  const [isLost, setIsLost] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('Vui lòng nhập tên stage.');
      return;
    }
    setLocalError(null);
    const input: { name: string; isWon?: boolean; isLost?: boolean } = { name: trimmed };
    if (isWon) input.isWon = true;
    if (isLost) input.isLost = true;
    onSubmit(input);
  }

  return (
    <DialogShell title="Thêm stage">
      <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Tên stage</span>
          <Input
            name="stageName"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Negotiation"
          />
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isWon}
              disabled={wonTaken}
              onChange={(event) => setIsWon(event.target.checked)}
            />
            <span>Stage thắng</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isLost}
              disabled={lostTaken}
              onChange={(event) => setIsLost(event.target.checked)}
            />
            <span>Stage thua</span>
          </label>
        </div>
        {localError ?? error ? (
          <p role="alert" className="text-sm text-red-600">
            {localError ?? error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Huỷ
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  error: string | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Destructive confirmation used by pipeline/stage deletion (AC-FR04-03, AC-FR04-05). */
export function ConfirmDialog({
  title,
  children,
  error,
  pending,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <DialogShell title={title}>
      <div className="mt-2 text-sm text-muted-foreground">{children}</div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Huỷ
        </Button>
        <Button type="button" onClick={onConfirm} disabled={pending}>
          {pending ? 'Đang xoá…' : 'Xoá'}
        </Button>
      </div>
    </DialogShell>
  );
}
