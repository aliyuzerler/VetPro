-- CreateTable
CREATE TABLE "report_exports" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID,
    "report_key" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "date_from" DATE,
    "date_to" DATE,
    "row_count" INTEGER NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preview',
    "file_name" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "valid_rows" INTEGER NOT NULL,
    "error_rows" INTEGER NOT NULL,
    "duplicate_rows" INTEGER NOT NULL,
    "committed_rows" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "raw_data" JSONB NOT NULL,
    "errors" JSONB,
    "matched_id" UUID,
    "resolution" TEXT,
    "created_record_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_runs" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'running',
    "archive_key" TEXT,
    "manifest_key" TEXT,
    "archive_sha256" TEXT,
    "total_bytes" INTEGER NOT NULL,
    "table_count" INTEGER NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "object_file_count" INTEGER NOT NULL DEFAULT 0,
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "encrypted" BOOLEAN NOT NULL DEFAULT true,
    "retention_until" TIMESTAMP(3) NOT NULL,
    "error" TEXT,
    "started_by_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_configs" (
    "clinic_id" UUID NOT NULL,
    "retention_days" INTEGER NOT NULL DEFAULT 30,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_configs_pkey" PRIMARY KEY ("clinic_id")
);

-- CreateIndex
CREATE INDEX "report_exports_clinic_id_created_at_idx" ON "report_exports"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "import_jobs_clinic_id_created_at_idx" ON "import_jobs"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "import_rows_job_id_row_number_idx" ON "import_rows"("job_id", "row_number");

-- CreateIndex
CREATE INDEX "backup_runs_clinic_id_started_at_idx" ON "backup_runs"("clinic_id", "started_at");

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_configs" ADD CONSTRAINT "backup_configs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

