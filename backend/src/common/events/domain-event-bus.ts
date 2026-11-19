import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

/** `deal.moved` payload (docs/events.md 1.3): no title, value or contact PII. */
export interface DealMovedPayload {
  dealId: string;
  fromStageId: string;
  toStageId: string;
  position: string;
  version: number;
  ownerId: string;
  actorId: string;
}

/** `deal.assigned` payload (docs/events.md 1.3). */
export interface DealAssignedPayload {
  dealId: string;
  fromOwnerId: string;
  toOwnerId: string;
  version: number;
  actorId: string;
}

/** `task.due` payload (docs/events.md 1.3), emitted by the reminder scheduler. */
export interface TaskDuePayload {
  taskId: string;
  dealId: string;
  dueAt: string;
  assigneeId: string;
  isOverdue: boolean;
}

/** `notification.created` payload; the inner `payload` mirrors the notifications table (minimal, no PII). */
export interface NotificationCreatedPayload {
  notificationId: string;
  notificationType: string;
  payload: Record<string, unknown>;
}

export interface DomainEventPayloadMap {
  'deal.moved': DealMovedPayload;
  'deal.assigned': DealAssignedPayload;
  'task.due': TaskDuePayload;
  'notification.created': NotificationCreatedPayload;
}

export type DomainEventType = keyof DomainEventPayloadMap;

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
  eventId: string;
  occurredAt: string;
  orgId: string;
  type: T;
  payload: DomainEventPayloadMap[T];
}

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

/**
 * In-process domain event bus (docs/events.md). Feature 005 bridges it to Socket.IO rooms.
 *
 * Publish **after** the transaction commits: delivery is at-most-once and a failing handler is only
 * logged, so it can never roll the business change back.
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);
  private readonly handlers = new Map<DomainEventType, Set<DomainEventHandler>>();

  subscribe(type: DomainEventType, handler: DomainEventHandler): () => void {
    const handlers = this.handlers.get(type) ?? new Set<DomainEventHandler>();
    handlers.add(handler);
    this.handlers.set(type, handlers);

    return () => {
      handlers.delete(handler);
    };
  }

  async publish<T extends DomainEventType>(
    type: T,
    orgId: string,
    payload: DomainEventPayloadMap[T],
  ): Promise<DomainEvent<T>> {
    const event: DomainEvent<T> = {
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      orgId,
      type,
      payload,
    };

    const handlers = this.handlers.get(type);
    if (!handlers || handlers.size === 0) {
      return event;
    }

    const results = await Promise.allSettled(
      [...handlers].map((handler) => Promise.resolve().then(() => handler(event))),
    );
    results.forEach((result) => {
      if (result.status === 'rejected') {
        this.logger.error(`Domain event handler failed for ${type} (${event.eventId}).`);
      }
    });

    return event;
  }
}
