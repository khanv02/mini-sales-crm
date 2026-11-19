import type { Notification } from '@prisma/client';
import type { Env } from '../../src/common/config/env';
import { DomainEventBus, type DomainEvent } from '../../src/common/events/domain-event-bus';
import type { QueueService } from '../../src/common/queue/queue.service';
import { NotificationRepository } from '../../src/modules/notifications/notification.repository';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import {
  TaskReminderRepository,
  type PendingTaskRow,
} from '../../src/modules/tasks/task-reminder.repository';
import { TaskReminderScheduler } from '../../src/modules/tasks/task-reminder.scheduler';
import type { PrismaService } from '../../src/common/prisma/prisma.service';
import { useFakeClock, type FakeClock } from '../support/clock';
import { buildTestEnv } from '../support/test-env';

const HOUR_MS = 60 * 60 * 1000;

/** In-memory stand-in for the `notifications_dedupe_key_key` partial unique index. */
class FakeNotificationRepository {
  readonly created: Notification[] = [];
  private readonly keys = new Set<string>();

  async create(input: {
    orgId: string;
    userId: string;
    type: Notification['type'];
    payload: unknown;
    dedupeKey?: string | null;
  }): Promise<Notification | null> {
    const key = input.dedupeKey
      ? [input.orgId, input.userId, input.type, input.dedupeKey].join('|')
      : undefined;
    if (key && this.keys.has(key)) {
      return null;
    }
    if (key) {
      this.keys.add(key);
    }

    const row: Notification = {
      id: `notification-${this.created.length + 1}`,
      orgId: input.orgId,
      userId: input.userId,
      type: input.type,
      payload: input.payload as Notification['payload'],
      dedupeKey: input.dedupeKey ?? null,
      readAt: null,
      createdAt: new Date(),
    };
    this.created.push(row);
    return row;
  }
}

describe('TaskReminderScheduler', () => {
  let clock: FakeClock;

  beforeEach(() => {
    clock = useFakeClock('2026-11-19T09:00:00.000Z');
  });

  afterEach(() => {
    clock.restore();
  });

  function createQueueStub() {
    const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
    const createWorker = jest.fn();
    const getQueue = jest.fn().mockReturnValue({ upsertJobScheduler });
    const queue = { getQueue, createWorker } as unknown as QueueService;
    return { queue, getQueue, createWorker, upsertJobScheduler };
  }

  function build(options: {
    rows?: PendingTaskRow[];
    env?: Env;
  } = {}) {
    const repository = {
      findPending: jest.fn().mockResolvedValue(options.rows ?? []),
      calls: 0,
    };
    const notifications = new FakeNotificationRepository();
    const bus = new DomainEventBus();
    const queueStub = createQueueStub();
    const scheduler = new TaskReminderScheduler(
      options.env ?? buildTestEnv(),
      queueStub.queue,
      repository as unknown as TaskReminderRepository,
      new NotificationService(
        notifications as unknown as NotificationRepository,
        bus,
      ),
      bus,
    );

    const dueEvents: DomainEvent[] = [];
    const notificationEvents: DomainEvent[] = [];
    bus.subscribe('task.due', (event) => {
      dueEvents.push(event);
    });
    bus.subscribe('notification.created', (event) => {
      notificationEvents.push(event);
    });

    return { scheduler, repository, notifications, queueStub, dueEvents, notificationEvents };
  }

  function task(overrides: Partial<PendingTaskRow> = {}): PendingTaskRow {
    return {
      id: 'task-1',
      orgId: 'org-1',
      dealId: 'deal-1',
      assigneeId: 'user-1',
      dueAt: new Date(Date.now() + 2 * HOUR_MS),
      ...overrides,
    };
  }

  it('reminds the assignee of a task due within 24 hours', async () => {
    const row = task();
    const { scheduler, notifications, dueEvents, notificationEvents } = build({ rows: [row] });

    const result = await scheduler.scan();

    expect(result).toEqual({ scanned: 1, created: 1 });
    expect(notifications.created).toHaveLength(1);
    expect(notifications.created[0]).toMatchObject({
      orgId: 'org-1',
      userId: 'user-1',
      type: 'TASK_DUE',
      dedupeKey: 'task:task-1:due_soon',
      payload: { taskId: 'task-1', dealId: 'deal-1', dueAt: row.dueAt.toISOString() },
    });

    expect(dueEvents).toHaveLength(1);
    expect(dueEvents[0]).toMatchObject({
      orgId: 'org-1',
      type: 'task.due',
      payload: {
        taskId: 'task-1',
        dealId: 'deal-1',
        dueAt: row.dueAt.toISOString(),
        assigneeId: 'user-1',
        isOverdue: false,
      },
    });
    expect(notificationEvents).toHaveLength(1);
    expect(notificationEvents[0]?.payload).toMatchObject({
      notificationId: 'notification-1',
      notificationType: 'TASK_DUE',
    });
  });

  it('marks a past-due task as overdue with its own dedupe bucket', async () => {
    const row = task({ dueAt: new Date(Date.now() - HOUR_MS) });
    const { scheduler, notifications, dueEvents } = build({ rows: [row] });

    await scheduler.scan();

    expect(notifications.created).toHaveLength(1);
    expect(notifications.created[0]).toMatchObject({
      type: 'TASK_OVERDUE',
      dedupeKey: 'task:task-1:overdue',
    });
    expect(dueEvents[0]?.payload).toMatchObject({ isOverdue: true });
  });

  it('moves a task from the due-soon bucket to overdue as time passes', async () => {
    const row = task({ dueAt: new Date(Date.now() + 2 * HOUR_MS) });
    const { scheduler, notifications, dueEvents } = build({ rows: [row] });

    await scheduler.scan();
    clock.advance(3 * HOUR_MS);
    await scheduler.scan();

    expect(notifications.created.map((notification) => notification.type)).toEqual([
      'TASK_DUE',
      'TASK_OVERDUE',
    ]);
    expect(notifications.created.map((notification) => notification.dedupeKey)).toEqual([
      'task:task-1:due_soon',
      'task:task-1:overdue',
    ]);
    expect(dueEvents).toHaveLength(2);
  });

  it('creates no duplicates when the scheduler runs ten times', async () => {
    const rows = [
      task({ id: 'task-1', dueAt: new Date(Date.now() - HOUR_MS) }),
      task({ id: 'task-2', orgId: 'org-2', dealId: 'deal-2', assigneeId: 'user-2' }),
    ];
    const { scheduler, repository, notifications, dueEvents, notificationEvents } = build({ rows });

    for (let run = 0; run < 10; run += 1) {
      await scheduler.scan();
    }

    expect(repository.findPending).toHaveBeenCalledTimes(10);
    expect(notifications.created).toHaveLength(2);
    expect(notifications.created.map((notification) => notification.dedupeKey)).toEqual([
      'task:task-1:overdue',
      'task:task-2:due_soon',
    ]);
    expect(dueEvents).toHaveLength(2);
    expect(notificationEvents).toHaveLength(2);
  });

  it('does nothing when no task is due', async () => {
    const { scheduler, notifications, dueEvents } = build();

    const result = await scheduler.scan();

    expect(result).toEqual({ scanned: 0, created: 0 });
    expect(notifications.created).toHaveLength(0);
    expect(dueEvents).toHaveLength(0);
  });

  it('registers a repeatable minute job and its worker outside test runs', async () => {
    const { scheduler, repository, queueStub } = build({
      rows: [task()],
      env: buildTestEnv({ NODE_ENV: 'development' }),
    });

    await scheduler.onModuleInit();

    expect(queueStub.getQueue).toHaveBeenCalledWith('reminders');
    expect(queueStub.upsertJobScheduler).toHaveBeenCalledWith(
      'task-reminders',
      { every: 60_000 },
      expect.objectContaining({
        name: 'scan-task-reminders',
        opts: expect.objectContaining({ attempts: 1 }),
      }),
    );
    expect(queueStub.createWorker).toHaveBeenCalledWith('reminders', expect.any(Function));

    const processor = queueStub.createWorker.mock.calls[0]?.[1] as (job: {
      name: string;
    }) => Promise<void>;
    await processor({ name: 'scan-task-reminders' });
    expect(repository.findPending).toHaveBeenCalledTimes(1);
  });

  it('does not schedule background work in tests', async () => {
    const { scheduler, queueStub } = build();

    await scheduler.onModuleInit();

    expect(queueStub.getQueue).not.toHaveBeenCalled();
    expect(queueStub.createWorker).not.toHaveBeenCalled();
  });
});

describe('TaskReminderRepository', () => {
  it('scans unfinished tasks due within 24 hours for active assignees only', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new TaskReminderRepository({
      activity: { findMany },
    } as unknown as PrismaService);
    const now = new Date('2026-11-19T09:00:00.000Z');

    await repository.findPending(now);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        type: 'TASK',
        doneAt: null,
        dueAt: { lte: new Date('2026-11-20T09:00:00.000Z') },
        assigneeId: { not: null },
        assignee: { is: { active: true } },
      },
      select: {
        id: true,
        orgId: true,
        dealId: true,
        assigneeId: true,
        dueAt: true,
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('drops rows without a deadline or assignee', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'task-1',
        orgId: 'org-1',
        dealId: 'deal-1',
        assigneeId: 'user-1',
        dueAt: new Date('2026-11-19T10:00:00.000Z'),
      },
      { id: 'task-2', orgId: 'org-1', dealId: 'deal-1', assigneeId: null, dueAt: new Date() },
      { id: 'task-3', orgId: 'org-1', dealId: 'deal-1', assigneeId: 'user-2', dueAt: null },
    ]);
    const repository = new TaskReminderRepository({
      activity: { findMany },
    } as unknown as PrismaService);

    const rows = await repository.findPending(new Date('2026-11-19T09:00:00.000Z'));

    expect(rows).toEqual([
      {
        id: 'task-1',
        orgId: 'org-1',
        dealId: 'deal-1',
        assigneeId: 'user-1',
        dueAt: new Date('2026-11-19T10:00:00.000Z'),
      },
    ]);
  });
});
