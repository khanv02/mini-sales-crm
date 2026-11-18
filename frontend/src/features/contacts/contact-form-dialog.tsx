import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AuthUser, Contact, ContactCreateRequest, ContactUpdateRequest } from '@pulse/shared';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  contactErrorMessage,
  contactKeys,
  createContact,
  updateContact,
} from './contact-api';

interface ContactFormDialogProps {
  contact: Contact | null;
  users: AuthUser[];
  canAssignOwner: boolean;
  onClose: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Create/edit dialog for T221 (FR-03.1); the API still validates every field. */
export function ContactFormDialog({
  contact,
  users,
  canAssignOwner,
  onClose,
}: ContactFormDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(contact?.name ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [company, setCompany] = useState(contact?.company ?? '');
  const [source, setSource] = useState(contact?.source ?? '');
  const [ownerId, setOwnerId] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const title = contact ? 'Sửa khách hàng' : 'Thêm khách hàng';

  const saveMutation = useMutation({
    mutationFn: (input: ContactCreateRequest | ContactUpdateRequest) =>
      contact ? updateContact(contact.id, input) : createContact(input as ContactCreateRequest),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contactKeys.all });
      onClose();
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError('Vui lòng nhập họ và tên.');
      return;
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) {
      setValidationError('Email không hợp lệ.');
      return;
    }

    setValidationError(null);
    if (contact) {
      saveMutation.mutate({
        name: trimmedName,
        email: optionalValue(email),
        phone: optionalValue(phone),
        company: optionalValue(company),
        source: optionalValue(source),
      });
      return;
    }

    const payload: ContactCreateRequest = { name: trimmedName };
    if (trimmedEmail) payload.email = trimmedEmail;
    const trimmedPhone = phone.trim();
    if (trimmedPhone) payload.phone = trimmedPhone;
    const trimmedCompany = company.trim();
    if (trimmedCompany) payload.company = trimmedCompany;
    const trimmedSource = source.trim();
    if (trimmedSource) payload.source = trimmedSource;
    if (canAssignOwner && ownerId) payload.ownerId = ownerId;
    saveMutation.mutate(payload);
  }

  const error =
    validationError ??
    (saveMutation.isError
      ? contactErrorMessage(saveMutation.error, 'Không thể lưu khách hàng.')
      : null);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Họ và tên</span>
            <Input
              name="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Email</span>
              <Input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ten@congty.vn"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Điện thoại</span>
              <Input
                name="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+84 90 000 0000"
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Công ty</span>
            <Input
              name="company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Công ty TNHH Pulse"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Nguồn</span>
            <Input
              name="source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="manual, import, webhook…"
            />
          </label>
          {!contact && canAssignOwner ? (
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Người phụ trách</span>
              <select
                name="ownerId"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                <option value="">Tôi</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
