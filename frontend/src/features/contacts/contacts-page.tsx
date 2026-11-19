import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Contact } from '@pulse/shared';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { fetchUserOptions } from '../../lib/api/user-options';
import { useAuth } from '../auth/auth-context';
import {
  contactErrorMessage,
  contactKeys,
  deleteContact,
  fetchContacts,
  type ContactFilters,
} from './contact-api';
import { ContactFormDialog } from './contact-form-dialog';

const dateFormatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' });

/** `/contacts` (T221, FR-03): list/search/filter, cursor pagination and CRUD dialogs. */
export function ContactsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';

  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editing, setEditing] = useState<Contact | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Search debounce: the plan fixes 300ms so typing does not spam the API.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = useMemo<ContactFilters>(
    () => ({ search: debouncedSearch, source: source.trim(), ownerId: isAdmin ? ownerId : '' }),
    [debouncedSearch, source, isAdmin, ownerId],
  );

  const contactsQuery = useInfiniteQuery({
    queryKey: contactKeys.list(filters),
    queryFn: ({ pageParam }) => fetchContacts(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: Boolean(user),
  });

  // `GET /users` is Admin-only (permissions matrix), so only Admin can populate the owner filter.
  const usersQuery = useQuery({
    queryKey: ['users', 'options'],
    queryFn: fetchUserOptions,
    enabled: isAdmin,
  });

  const removeMutation = useMutation({
    mutationFn: deleteContact,
    onSuccess: async () => {
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
    onError: (error) => {
      setActionError(contactErrorMessage(error, 'Không thể xoá khách hàng.'));
    },
  });

  const contacts = contactsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const users = usersQuery.data ?? [];

  function clearFilters(): void {
    setSearch('');
    setSource('');
    setOwnerId('');
    setDebouncedSearch('');
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Khách hàng</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý danh bạ, tìm kiếm theo tên, email hoặc công ty.
          </p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          Thêm khách hàng
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Tìm kiếm</span>
              <Input
                type="search"
                name="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tên, email hoặc công ty"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Nguồn</span>
              <Input
                name="source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Tất cả nguồn"
              />
            </label>
            {isAdmin ? (
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Phụ trách</span>
                <select
                  name="ownerId"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={ownerId}
                  onChange={(event) => setOwnerId(event.target.value)}
                >
                  <option value="">Tất cả</option>
                  <option value="unassigned">Chưa gán</option>
                  {users.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={clearFilters}>
                Xoá lọc
              </Button>
            </div>
          </div>

          {actionError ? (
            <p role="alert" className="text-sm text-red-600">
              {actionError}
            </p>
          ) : null}
          {contactsQuery.isError ? (
            <p role="alert" className="text-sm text-red-600">
              Không thể tải danh sách khách hàng.
            </p>
          ) : null}

          {contactsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : contacts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-6 py-12 text-center">
              <p className="text-base font-medium">Chưa có khách hàng nào</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Thêm khách hàng đầu tiên để bắt đầu theo dõi cơ hội bán hàng.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Tên
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Email
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Điện thoại
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Công ty
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Nguồn
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Ngày tạo
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id} className="border-b border-border/60 last:border-b-0">
                      <td className="px-3 py-2 font-medium">{contact.name}</td>
                      <td className="px-3 py-2">{contact.email ?? '—'}</td>
                      <td className="px-3 py-2">{contact.phone ?? '—'}</td>
                      <td className="px-3 py-2">{contact.company ?? '—'}</td>
                      <td className="px-3 py-2">{contact.source ?? '—'}</td>
                      <td className="px-3 py-2">{dateFormatter.format(new Date(contact.createdAt))}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Sửa ${contact.name}`}
                            onClick={() => setEditing(contact)}
                          >
                            Sửa
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Xoá ${contact.name}`}
                            onClick={() => {
                              setActionError(null);
                              setDeleting(contact);
                            }}
                          >
                            Xoá
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {contactsQuery.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => void contactsQuery.fetchNextPage()}
                disabled={contactsQuery.isFetchingNextPage}
              >
                {contactsQuery.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {creating ? (
        <ContactFormDialog
          contact={null}
          users={users}
          canAssignOwner={isAdmin}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editing ? (
        <ContactFormDialog
          contact={editing}
          users={users}
          canAssignOwner={isAdmin}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Xoá khách hàng"
            className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg"
          >
            <h2 className="text-lg font-semibold tracking-tight">Xoá khách hàng</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Bạn có chắc muốn xoá khách hàng &quot;{deleting.name}&quot;? Hành động này không thể hoàn
              tác.
            </p>
            {removeMutation.isError ? (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {contactErrorMessage(removeMutation.error, 'Không thể xoá khách hàng.')}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleting(null)}
                disabled={removeMutation.isPending}
              >
                Huỷ
              </Button>
              <Button
                type="button"
                onClick={() => removeMutation.mutate(deleting.id)}
                disabled={removeMutation.isPending}
              >
                {removeMutation.isPending ? 'Đang xoá…' : 'Xoá'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
