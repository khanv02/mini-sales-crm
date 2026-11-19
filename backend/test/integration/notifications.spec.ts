import { UserRole, type Notification } from '@prisma/client';
import type { PrismaService } from '../../src/common/prisma/prisma.service';
import { DomainEventBus, type DomainEvent } from '../../src/common/events/domain-event-bus';
import { NotificationRepository } from '../../src/modules/notifications/notification.repository';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { createOrg, createUser, disconnect, prisma, resetDatabase } from '../factories';

describe('notifications (integration)', () => {
  let service: NotificationService;
  let bus: DomainEventBus;
  let orgId: string;
  let otherOrgId: string;
  let userId: string;
  let otherUserId: string;
  let otherOrgUserId: string;

  beforeAll(() => {
    bus = new DomainEventBus();
    service = new NotificationService(
      new NotificationRepository(prisma as unknown as PrismaService),
      bus,
    );
  });

  beforeEach(async () => {
    await resetDatabase();

    const org = await createOrg({ name: 'Acme' });
    const otherOrg = await createOrg({ name: 'Globex' });
    orgId = org.id;
    otherOrgId = otherOrg.id;

    const user = await createUser({ orgId, role: UserRole.SALES });
    const otherUser = await createUser({ orgId, role: UserRole.SALES });
    userId = user.id;
    otherUserId = otherUser.id;
    otherOrgUserId = (await createUser({ orgId: otherOrg.id, role: UserRole.SALES })).id;
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnect();
  });

  function reminder(overrides: Partial<Parameters<NotificationService['createForUser']>[0]> = {}) {
    return {
      orgId,
      userId,
      type: 'TASK_OVERDUE' as const,
      payload: { taskId: 'task-1', dealId: 'deal-1' },
      dedupeKey: 'task:task-1:overdue',
      ...overrides,
    };
  }

  it('creates one notification per dedupe key and announces it once', async () => {
    const events: DomainEvent[] = [];
    bus.subscribe('notification.created', (event) => {
      events.push(event);
    });

    const first = await service.createForUser(reminder());
    const duplicate = await service.createForUser(reminder());

    expect(first).toMatchObject({
      orgId,
      userId,
      type: 'TASK_OVERDUE',
      dedupeKey: 'task:task-1:overdue',
      readAt: null,
    });
    expect(duplicate).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      notificationId: first?.id,
      notificationType: 'TASK_OVERDUE',
      payload: { taskId: 'task-1', dealId: 'deal-1' },
    });

    // The same key is scoped by user, type and org, and keyless rows are never deduplicated.
    await expect(service.createForUser(reminder({ userId: otherUserId }))).resolves.toBeTruthy();
    await expect(service.createForUser(reminder({ type: 'TASK_DUE' }))).resolves.toBeTruthy();
    await expect(
      service.createForUser(reminder({ orgId: otherOrgId, userId: otherOrgUserId })),
    ).resolves.toBeTruthy();

    const keyless = reminder({ dedupeKey: null });
    await expect(service.createForUser(keyless)).resolves.toBeTruthy();
    await expect(service.createForUser(keyless)).resolves.toBeTruthy();
  });

  it('lists newest first, filters unread and paginates with a cursor', async () => {
    const rows: Notification[] = [];
    for (let index = 0; index < 3; index += 1) {
      const row = await service.createForUser(
        reminder({ dedupeKey: `task:task-${index}:overdue`, payload: { taskId: `task-${index}` } }),
      );
      rows.push(row as Notification);
    }
    await service.markRead(orgId, userId, rows[0]!.id);

    const firstPage = await service.listForUser(orgId, userId, { limit: 2 });
    expect(firstPage.data.map((row) => row.id)).toEqual([rows[2]!.id, rows[1]!.id]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPage = await service.listForUser(orgId, userId, {
      limit: 2,
      cursor: firstPage.nextCursor as string,
    });
    expect(secondPage.data.map((row) => row.id)).toEqual([rows[0]!.id]);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();

    const unread = await service.listForUser(orgId, userId, { unreadOnly: true });
    expect(unread.data.map((row) => row.id)).toEqual([rows[2]!.id, rows[1]!.id]);

    // Another user of the same org sees nothing.
    const foreign = await service.listForUser(orgId, otherUserId, {});
    expect(foreign.data).toHaveLength(0);
  });

  it('marks one notification read idempotently and marks the rest read in bulk', async () => {
    const first = (await service.createForUser(
      reminder({ dedupeKey: 'task:task-1:overdue' }),
    )) as Notification;
    const second = (await service.createForUser(
      reminder({ userId: otherUserId, dedupeKey: 'task:task-2:overdue' }),
    )) as Notification;

    const read = await service.markRead(orgId, userId, first.id);
    expect(read?.readAt).toEqual(expect.any(Date));
    const readAgain = await service.markRead(orgId, userId, first.id);
    expect(readAgain?.readAt).toEqual(read?.readAt);

    // A notification of another user is not visible through this scope.
    await expect(service.markRead(orgId, userId, second.id)).resolves.toBeNull();
    await expect(service.markRead(otherOrgId, userId, first.id)).resolves.toBeNull();

    expect(await service.markAllRead(orgId, otherUserId)).toBe(1);
    expect(await service.markAllRead(orgId, otherUserId)).toBe(0);

    const unread = await service.listForUser(orgId, otherUserId, { unreadOnly: true });
    expect(unread.data).toHaveLength(0);
  });
});
