-- CreateTable
CREATE TABLE "encounters" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "veterinarian_id" UUID NOT NULL,
    "appointment_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "chief_complaint" TEXT,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "notes" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_at" TIMESTAMP(3),
    "signed_by_id" UUID,
    "closed_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vital_observations" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "encounter_id" UUID,
    "kind" TEXT NOT NULL,
    "value" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "measured_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_by_staff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vital_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnoses" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'primary',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_attachments" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_addendums" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "author_staff_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_addendums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'muayene',
    "duration_min" INTEGER NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_prices" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "branch_id" UUID,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "amount" DECIMAL(10,2) NOT NULL,
    "tax_code" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_consumption_rules" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "product_id" UUID,
    "default_qty" DECIMAL(10,3) NOT NULL,
    "unit" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "allocation_policy" TEXT NOT NULL DEFAULT 'fifo',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_consumption_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_records" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "performed_by_staff_id" UUID,
    "finalized_at" TIMESTAMP(3),
    "idempotency_key" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_record_lines" (
    "id" UUID NOT NULL,
    "service_record_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "service_record_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "encounters_branch_id_status_started_at_idx" ON "encounters"("branch_id", "status", "started_at");

-- CreateIndex
CREATE INDEX "encounters_patient_id_started_at_idx" ON "encounters"("patient_id", "started_at");

-- CreateIndex
CREATE INDEX "encounters_branch_id_started_at_idx" ON "encounters"("branch_id", "started_at");

-- CreateIndex
CREATE INDEX "encounters_veterinarian_id_started_at_idx" ON "encounters"("veterinarian_id", "started_at");

-- CreateIndex
CREATE INDEX "vital_observations_patient_id_kind_measured_at_idx" ON "vital_observations"("patient_id", "kind", "measured_at");

-- CreateIndex
CREATE INDEX "vital_observations_encounter_id_idx" ON "vital_observations"("encounter_id");

-- CreateIndex
CREATE INDEX "diagnoses_encounter_id_idx" ON "diagnoses"("encounter_id");

-- CreateIndex
CREATE INDEX "clinical_attachments_encounter_id_idx" ON "clinical_attachments"("encounter_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_attachments_encounter_id_asset_id_key" ON "clinical_attachments"("encounter_id", "asset_id");

-- CreateIndex
CREATE INDEX "clinical_addendums_encounter_id_created_at_idx" ON "clinical_addendums"("encounter_id", "created_at");

-- CreateIndex
CREATE INDEX "services_clinic_id_active_idx" ON "services"("clinic_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "services_clinic_id_code_key" ON "services"("clinic_id", "code");

-- CreateIndex
CREATE INDEX "service_prices_service_id_valid_from_idx" ON "service_prices"("service_id", "valid_from");

-- CreateIndex
CREATE INDEX "service_prices_branch_id_idx" ON "service_prices"("branch_id");

-- CreateIndex
CREATE INDEX "service_consumption_rules_service_id_idx" ON "service_consumption_rules"("service_id");

-- CreateIndex
CREATE INDEX "service_records_encounter_id_idx" ON "service_records"("encounter_id");

-- CreateIndex
CREATE INDEX "service_records_branch_id_status_idx" ON "service_records"("branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "service_records_idempotency_key_key" ON "service_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "service_record_lines_service_record_id_idx" ON "service_record_lines"("service_record_id");

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_veterinarian_id_fkey" FOREIGN KEY ("veterinarian_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_signed_by_id_fkey" FOREIGN KEY ("signed_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_observations" ADD CONSTRAINT "vital_observations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_observations" ADD CONSTRAINT "vital_observations_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_observations" ADD CONSTRAINT "vital_observations_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_attachments" ADD CONSTRAINT "clinical_attachments_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_attachments" ADD CONSTRAINT "clinical_attachments_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_addendums" ADD CONSTRAINT "clinical_addendums_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_addendums" ADD CONSTRAINT "clinical_addendums_author_staff_id_fkey" FOREIGN KEY ("author_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_consumption_rules" ADD CONSTRAINT "service_consumption_rules_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_performed_by_staff_id_fkey" FOREIGN KEY ("performed_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_record_lines" ADD CONSTRAINT "service_record_lines_service_record_id_fkey" FOREIGN KEY ("service_record_id") REFERENCES "service_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_record_lines" ADD CONSTRAINT "service_record_lines_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
