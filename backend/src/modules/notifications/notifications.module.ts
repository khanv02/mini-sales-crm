import { Module } from '@nestjs/common';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

/** Notification storage/service only; the HTTP API and Socket.IO bridge arrive with feature 005. */
@Module({
  providers: [NotificationService, NotificationRepository],
  exports: [NotificationService],
})
export class NotificationsModule {}
