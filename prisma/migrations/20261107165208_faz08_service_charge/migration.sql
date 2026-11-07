-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "reversed_at" TIMESTAMP(3),
ADD COLUMN     "reversed_by_staff_id" UUID;

-- CreateTable
CREATE TABLE "charges" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "encounter_id" UUID,
    "service_record_id" UUID,
    "owner_id" UUID NOT NULL,
    "patient_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'open',
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "total" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge_lines" (
    "id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "tax_amount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "charges_clinic_id_status_idx" ON "charges"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "charges_owner_id_idx" ON "charges"("owner_id");

-- CreateIndex
CREATE INDEX "charges_branch_id_created_at_idx" ON "charges"("branch_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "charges_service_record_id_key" ON "charges"("service_record_id");

-- CreateIndex
CREATE INDEX "charge_lines_charge_id_idx" ON "charge_lines"("charge_id");

-- CreateIndex
CREATE INDEX "charge_lines_source_type_source_id_idx" ON "charge_lines"("source_type", "source_id");

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_reversed_by_staff_id_fkey" FOREIGN KEY ("reversed_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_service_record_id_fkey" FOREIGN KEY ("service_record_id") REFERENCES "service_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_lines" ADD CONSTRAINT "charge_lines_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
