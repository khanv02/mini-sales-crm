import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Contact,
  Deal,
  DealCreateRequest,
  DealUpdateRequest,
  Pipeline,
} from '@pulse/shared';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ApiClientError } from '../../lib/api/client';
import { fetchContactOptions } from '../contacts/contact-api';
import { createDeal, dealErrorMessage, dealKeys, updateDeal } from './deal-api';
import { formatDealValue } from './deal-format';

interface DealFormDialogProps {
  deal: Deal | null;
  pipeline: Pipeline;
  onClose: () => void;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_LABELS: Record<Deal['status'], string> = {
  OPEN: 'Đang mở',
  WON: 'Thắng',
  LOST: 'Thua',
};

/** Create/edit dialog for T224 (FR-05.1, FR-05.8); the API still validates every field. */
export function DealFormDialog({ deal, pipeline, onClose }: DealFormDialogProps) {
  const queryClient = useQueryClient();
  const createStages = pipeline.stages.filter((stage) => !stage.isLost);

  const [title, setTitle] = useState(deal?.title ?? '');
  const [value, setValue] = useState(deal ? String(deal.value) : '');
  const [expectedClose, setExpectedClose] = useState(deal?.expectedClose?.slice(0, 10) ?? '');
  const [contactId, setContactId] = useState(deal?.contactId ?? '');
  const [stageId, setStageId] = useState(createStages[0]?.id ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const isEdit = deal !== null;
  const heading = isEdit ? 'Sửa deal' : 'Thêm deal';

  // Contacts are only needed when creating: the contact of an existing deal cannot be changed.
  const contactsQuery = useQuery({
    queryKey: ['contacts', 'options'],
    queryFn: fetchContactOptions,
    enabled: !isEdit,
  });
  const contacts: Contact[] = contactsQuery.data ?? [];

  const saveMutation = useMutation({
    mutationFn: (payload: DealCreateRequest | DealUpdateRequest) =>
      deal ? updateDeal(deal.id, payload as DealUpdateRequest) : createDeal(payload as DealCreateRequest),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealKeys.all });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === 'DEAL_VERSION_CONFLICT') {
        // Reload the board so the next attempt starts from the server version (ADR-005).
        void queryClient.invalidateQueries({ queryKey: dealKeys.all });
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setValidationError('Vui lòng nhập tên deal.');
      return;
    }
    if (!value.trim()) {
      setValidationError('Vui lòng nhập giá trị.');
      return;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setValidationError('Giá trị phải là số không âm.');
      return;
    }
    if (expectedClose && !DATE_PATTERN.test(expectedClose)) {
      setValidationError('Ngày dự kiến chốt không hợp lệ.');
      return;
    }

    setValidationError(null);
    if (deal) {
      saveMutation.mutate({
        title: trimmedTitle,
        value: numericValue,
        expectedClose: expectedClose || null,
        version: deal.version,
      });
      return;
    }

    if (!contactId) {
      setValidationError('Vui lòng chọn khách hàng.');
      return;
    }
    if (!stageId) {
      setValidationError('Vui lòng chọn stage.');
      return;
    }
    const payload: DealCreateRequest = {
      contactId,
      pipelineId: pipeline.id,
      stageId,
      title: trimmedTitle,
      value: numericValue,
    };
    if (expectedClose) payload.expectedClose = expectedClose;
    saveMutation.mutate(payload);
  }

  const error =
    validationError ??
    (saveMutation.isError
      ? dealErrorMessage(saveMutation.error, 'Không thể lưu deal.')
      : null);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Quy trình: {pipeline.name}
          {deal ? ` · ${STATUS_LABELS[deal.status]} · ${deal.currency}` : ''}
        </p>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
          {!deal ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Khách hàng</span>
                <select
                  name="contactId"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={contactId}
                  onChange={(event) => setContactId(event.target.value)}
                >
                  <option value="">Chọn khách hàng</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.email ? `${contact.name} (${contact.email})` : contact.name}
                    </option>
                  ))}
                </select>
                {contactsQuery.isLoading ? (
                  <span className="text-xs text-muted-foreground">Đang tải khách hàng…</span>
                ) : null}
                {!contactsQuery.isLoading && contacts.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Chưa có khách hàng. Hãy thêm khách hàng trước.
                  </span>
                ) : null}
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Stage</span>
                <select
                  name="stageId"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={stageId}
                  onChange={(event) => setStageId(event.target.value)}
                >
                  {createStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Tên deal</span>
            <Input
              name="title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Hợp đồng triển khai CRM"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Giá trị</span>
              <Input
                type="number"
                name="value"
                min="0"
                step="0.01"
                required
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="1000000"
              />
              {deal ? (
                <span className="text-xs text-muted-foreground">
                  Hiển thị: {formatDealValue(Number(value) || 0, deal.currency)}
                </span>
              ) : null}
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Ngày dự kiến chốt</span>
              <Input
                type="date"
                name="expectedClose"
                value={expectedClose}
                onChange={(event) => setExpectedClose(event.target.value)}
              />
            </label>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
              Huỷ
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
