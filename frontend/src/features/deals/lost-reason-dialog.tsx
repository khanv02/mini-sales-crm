import { useState, type FormEvent } from 'react';
import type { Deal } from '@pulse/shared';
import { Button } from '../../components/ui/button';

interface LostReasonDialogProps {
  deal: Deal;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (lostReason: string) => void;
}

/** Reason prompt for a move into a lost stage (T224, AC-FR06-02/03, FR-06.1). */
export function LostReasonDialog({
  deal,
  pending,
  error,
  onCancel,
  onConfirm,
}: LostReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setValidationError('Vui lòng nhập lý do thua.');
      return;
    }
    setValidationError(null);
    onConfirm(trimmed);
  }

  const message = validationError ?? error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lý do thua"
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold tracking-tight">Lý do thua</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Deal &quot;{deal.title}&quot; sẽ được đánh dấu thua. Vui lòng ghi lại lý do.
        </p>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Lý do thua</span>
            <textarea
              name="lostReason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Giá cao hơn đối thủ, mất ngân sách…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          {message ? (
            <p role="alert" className="text-sm text-red-600">
              {message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Đang lưu…' : 'Xác nhận thua'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
