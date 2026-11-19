import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksController } from './tasks.controller';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';
import { TaskReminderRepository } from './task-reminder.repository';
import { TaskReminderScheduler } from './task-reminder.scheduler';

/** Task projection over `activities` (ADR-010, FR-07.5) plus the overdue reminder scan. */
@Module({
  imports: [NotificationsModule],
  controllers: [TasksController],
  providers: [TasksService, TasksRepository, TaskReminderRepository, TaskReminderScheduler],
})
export class TasksModule {}
