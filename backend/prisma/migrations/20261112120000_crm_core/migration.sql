-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "source" TEXT,
    "owner_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stages" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" DECIMAL(20,10) NOT NULL,
    "is_won" BOOLEAN NOT NULL DEFAULT false,
    "is_lost" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "owner_id" UUID NOT NULL,
    "expected_close" DATE,
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "lost_reason" TEXT,
    "position" DECIMAL(20,10) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_org_id_owner_id_idx" ON "contacts"("org_id", "owner_id");

-- CreateIndex
CREATE INDEX "contacts_org_id_deleted_at_idx" ON "contacts"("org_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_org_id_id_key" ON "contacts"("org_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_org_id_id_key" ON "pipelines"("org_id", "id");

-- CreateIndex
CREATE INDEX "stages_org_id_pipeline_id_position_idx" ON "stages"("org_id", "pipeline_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "stages_org_id_pipeline_id_id_key" ON "stages"("org_id", "pipeline_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stages_org_id_id_key" ON "stages"("org_id", "id");

-- CreateIndex
CREATE INDEX "deals_org_id_stage_id_position_id_idx" ON "deals"("org_id", "stage_id", "position", "id");

-- CreateIndex
CREATE INDEX "deals_org_id_owner_id_idx" ON "deals"("org_id", "owner_id");

-- CreateIndex
CREATE INDEX "deals_org_id_status_closed_at_idx" ON "deals"("org_id", "status", "closed_at");

-- CreateIndex
CREATE INDEX "deals_org_id_expected_close_idx" ON "deals"("org_id", "expected_close");

-- CreateIndex
CREATE INDEX "deals_org_id_contact_id_idx" ON "deals"("org_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "deals_org_id_id_key" ON "deals"("org_id", "id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_org_id_owner_id_fkey" FOREIGN KEY ("org_id", "owner_id") REFERENCES "users"("org_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stages" ADD CONSTRAINT "stages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stages" ADD CONSTRAINT "stages_org_id_pipeline_id_fkey" FOREIGN KEY ("org_id", "pipeline_id") REFERENCES "pipelines"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_org_id_contact_id_fkey" FOREIGN KEY ("org_id", "contact_id") REFERENCES "contacts"("org_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_org_id_pipeline_id_fkey" FOREIGN KEY ("org_id", "pipeline_id") REFERENCES "pipelines"("org_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_org_id_pipeline_id_stage_id_fkey" FOREIGN KEY ("org_id", "pipeline_id", "stage_id") REFERENCES "stages"("org_id", "pipeline_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_org_id_owner_id_fkey" FOREIGN KEY ("org_id", "owner_id") REFERENCES "users"("org_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Functional and partial indexes Prisma cannot express (docs/data-model.md 4.4-4.7).

-- Contacts: email is unique per org only while the contact is alive (AC-FR03-06, FR-03.4).
CREATE UNIQUE INDEX "contacts_org_id_email_lower_key" ON "contacts"("org_id", lower("email"))
WHERE "deleted_at" IS NULL AND "email" IS NOT NULL;

-- Contacts: trigram search over name/email/company (ADR-013, FR-03.5).
CREATE INDEX "contacts_name_trgm_idx" ON "contacts" USING gin (lower("name") gin_trgm_ops);
CREATE INDEX "contacts_email_trgm_idx" ON "contacts" USING gin (lower(coalesce("email", '')) gin_trgm_ops);
CREATE INDEX "contacts_company_trgm_idx" ON "contacts" USING gin (lower(coalesce("company", '')) gin_trgm_ops);

-- Pipelines: case-insensitive name per org (FR-04).
CREATE UNIQUE INDEX "pipelines_org_id_name_lower_key" ON "pipelines"("org_id", lower("name"));

-- Stages: at most one won and one lost stage per pipeline (FR-04.2).
CREATE UNIQUE INDEX "stages_pipeline_id_is_won_key" ON "stages"("pipeline_id") WHERE "is_won";
CREATE UNIQUE INDEX "stages_pipeline_id_is_lost_key" ON "stages"("pipeline_id") WHERE "is_lost";
CREATE UNIQUE INDEX "stages_pipeline_id_name_lower_key" ON "stages"("pipeline_id", lower("name"));

-- Stages: a stage cannot be both won and lost (data-model 4.6).
ALTER TABLE "stages" ADD CONSTRAINT "stages_won_lost_flags_check" CHECK (NOT ("is_won" AND "is_lost"));

-- Deals: lifecycle invariants mirrored from the service layer (FR-06.3, data-model 4.7).
ALTER TABLE "deals" ADD CONSTRAINT "deals_value_check" CHECK ("value" >= 0);
ALTER TABLE "deals" ADD CONSTRAINT "deals_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "deals" ADD CONSTRAINT "deals_lost_reason_required_check"
CHECK ("status" <> 'LOST' OR ("lost_reason" IS NOT NULL AND length(btrim("lost_reason")) > 0));
ALTER TABLE "deals" ADD CONSTRAINT "deals_lost_reason_only_when_lost_check"
CHECK ("status" = 'LOST' OR "lost_reason" IS NULL);
ALTER TABLE "deals" ADD CONSTRAINT "deals_closed_at_check" CHECK (("status" = 'OPEN') = ("closed_at" IS NULL));
