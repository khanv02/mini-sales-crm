import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ENV_TOKEN } from '../../common/config/env.module';
import type { Env } from '../../common/config/env';
import { DomainEventBus } from '../../common/events/domain-event-bus';
import { QueueService } from '../../common/queue/queue.service';
import { NotificationService } from '../notifications/notification.service';
import { TaskReminderRepository } from './task-reminder.repository';

export const REMINDERS_QUEUE = 'reminders';
export const SCAN_TASK_REMINDERS_JOB = 'scan-task-reminders';
export const TASK_REMINDER_SCHEDULER_ID = 'task-reminders';
export const TASK_REMINDER_INTERVAL_MS = 60_000;

export interface ReminderScanResult {
  scanned: number;
  created: number;
}

/**
 * FR-07.5 reminder scan: every minute, open tasks due within 24h produce one `TASK_DUE` (not yet due) or
 * `TASK_OVERDUE` notification per (task, bucket). The partial unique index on `dedupe_key` makes re-runs and
 * two API instances harmless (docs/events.md 2.5).
 *
 * The job runs inside the API for the MVP. Email delivery belongs to feature 006 and is not sent here.
 */
@Injectable()
export class TaskReminderScheduler implements OnModuleInit {
  private readonly logger = new Logger(TaskReminderScheduler.name);

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly queue: QueueService,
    private readonly repository: TaskReminderRepository,
    private readonly notifications: NotificationService,
    private readonly events: DomainEventBus,
  ) {}

  async onModuleInit(): Promise<void> {
    // Tests boot the real app on every suite; a background worker would race their truncates and Redis state.
    if (this.env.NODE_ENV === 'test') {
      return;
    }

    const queue = this.queue.getQueue(REMINDERS_QUEUE);
    await queue.upsertJobScheduler(
      TASK_REMINDER_SCHEDULER_ID,
      { every: TASK_REMINDER_INTERVAL_MS },
      {
        name: SCAN_TASK_REMINDERS_JOB,
        data: {},
        opts: {
          attempts: 1,
          removeOnComplete: { count: 1_000 },
          removeOnFail: false,
        },
      },
    );

    this.queue.createWorker(REMINDERS_QUEUE, async (job) => {
      if (job.name !== SCAN_TASK_REMINDERS_JOB) {
        return;
      }
      await this.scan();
    });

    this.logger.log(
      `Task reminder scan scheduled every ${TASK_REMINDER_INTERVAL_MS / 1_000}s (${REMINDERS_QUEUE}).`,
    );
  }

  /** One scan pass. Exposed so tests can drive it with a fake clock instead of waiting for BullMQ. */
  async scan(now: Date = new Date()): Promise<ReminderScanResult> {
    const candidates = await this.repository.findPending(now);
    let created = 0;

    for (const task of candidates) {
      const isOverdue = task.dueAt.getTime() <= now.getTime();
      const dueAt = task.dueAt.toISOString();

      const notification = await this.notifications.createForUser({
        orgId: task.orgId,
        userId: task.assigneeId,
        type: isOverdue ? 'TASK_OVERDUE' : 'TASK_DUE',
        payload: { taskId: task.id, dealId: task.dealId, dueAt },
        dedupeKey: `task:${task.id}:${isOverdue ? 'overdue' : 'due_soon'}`,
      });

      if (!notification) {
        continue;
      }
      created += 1;

      // A newly inserted row is the only case worth announcing; duplicates stay silent.
      await this.events.publish('task.due', task.orgId, {
        taskId: task.id,
        dealId: task.dealId,
        dueAt,
        assigneeId: task.assigneeId,
        isOverdue,
      });
    }

    return { scanned: candidates.length, created };
  }
}
