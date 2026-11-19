import { Injectable } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import { DomainEventBus } from '../../common/events/domain-event-bus';
import {
  NotificationRepository,
  type CreateNotificationInput,
  type NotificationListOptions,
  type NotificationPage,
} from './notification.repository';

/**
 * Internal notification service (FR-07.5). Feature 005 owns the HTTP API and the realtime bridge; the
 * scheduler and future features create notifications here, and a newly inserted row publishes
 * `notification.created` for the realtime layer.
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly events: DomainEventBus,
  ) {}

  /** Returns `null` when another run already created the same `(org, user, type, dedupeKey)` row. */
  async createForUser(input: CreateNotificationInput): Promise<Notification | null> {
    const created = await this.repository.create(input);
    if (!created) {
      return null;
    }

    await this.events.publish('notification.created', created.orgId, {
      notificationId: created.id,
      notificationType: created.type,
      payload: (created.payload ?? {}) as Record<string, unknown>,
    });

    return created;
  }

  listForUser(
    orgId: string,
    userId: string,
    options: NotificationListOptions = {},
  ): Promise<NotificationPage> {
    return this.repository.listForUser(orgId, userId, options);
  }

  markRead(orgId: string, userId: string, id: string): Promise<Notification | null> {
    return this.repository.markRead(orgId, userId, id);
  }

  markAllRead(orgId: string, userId: string): Promise<number> {
    return this.repository.markAllRead(orgId, userId);
  }
}
