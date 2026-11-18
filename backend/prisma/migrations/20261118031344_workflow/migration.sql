-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'TASK');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_DUE', 'TASK_OVERDUE');

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "type" "ActivityType" NOT NULL,
    "content" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(6),
    "done_at" TIMESTAMPTZ(6),
    "assignee_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupe_key" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_org_id_deal_id_created_at_idx" ON "activities"("org_id", "deal_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "activities_org_id_id_key" ON "activities"("org_id", "id");

-- CreateIndex
CREATE INDEX "notifications_org_id_user_id_read_at_created_at_idx" ON "notifications"("org_id", "user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_org_id_id_key" ON "notifications"("org_id", "id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_org_id_deal_id_fkey" FOREIGN KEY ("org_id", "deal_id") REFERENCES "deals"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_org_id_assignee_id_fkey" FOREIGN KEY ("org_id", "assignee_id") REFERENCES "users"("org_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_org_id_created_by_fkey" FOREIGN KEY ("org_id", "created_by") REFERENCES "users"("org_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_user_id_fkey" FOREIGN KEY ("org_id", "user_id") REFERENCES "users"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written below: constraints and partial indexes that Prisma cannot express (docs/data-model.md 4.8-4.9).

-- Content length is validated in zod first; the database keeps the invariant for every writer.
ALTER TABLE "activities" ADD CONSTRAINT "activities_content_length_check"
    CHECK (char_length("content") BETWEEN 1 AND 10000);

-- A TASK always has a deadline and an assignee; other activity types never do.
ALTER TABLE "activities" ADD CONSTRAINT "activities_task_requires_due_assignee_check"
    CHECK ("type" <> 'TASK' OR ("due_at" IS NOT NULL AND "assignee_id" IS NOT NULL));

-- Only a TASK can be completed.
ALTER TABLE "activities" ADD CONSTRAINT "activities_non_task_not_done_check"
    CHECK ("type" = 'TASK' OR "done_at" IS NULL);

-- Open tasks per assignee ordered by deadline: the overdue scheduler and `GET /tasks` projection.
CREATE INDEX "activities_overdue_idx"
    ON "activities" ("org_id", "assignee_id", "due_at")
    WHERE "type" = 'TASK' AND "done_at" IS NULL;

-- Anti-spam: one notification per (user, type, dedupe key); rows without a key are never deduplicated.
CREATE UNIQUE INDEX "notifications_dedupe_key_key"
    ON "notifications" ("org_id", "user_id", "type", "dedupe_key")
    WHERE "dedupe_key" IS NOT NULL;
