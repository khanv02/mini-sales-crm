import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Reminder window from `specs/004-activities-dashboard/plan.md` (due-soon is 24 hours). */
export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PendingTaskRow {
  id: string;
  orgId: string;
  dealId: string;
  assigneeId: string;
  dueAt: Date;
}

/**
 * Read side of the reminder scheduler. It scans every org on purpose (the job has no principal) and joins
 * the assignee so a deactivated user is never reminded (004 spec, edge cases).
 */
@Injectable()
export class TaskReminderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Open tasks due before `now + 24h` whose assignee is still active. */
  async findPending(now: Date): Promise<PendingTaskRow[]> {
    const rows = await this.prisma.activity.findMany({
      where: {
        type: 'TASK',
        doneAt: null,
        dueAt: { lte: new Date(now.getTime() + DUE_SOON_WINDOW_MS) },
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

    // The `0003_workflow` check constraint guarantees both values for a TASK; keep the mapping explicit.
    return rows.flatMap((row) =>
      row.dueAt && row.assigneeId
        ? [
            {
              id: row.id,
              orgId: row.orgId,
              dealId: row.dealId,
              assigneeId: row.assigneeId,
              dueAt: row.dueAt,
            },
          ]
        : [],
    );
  }
}
