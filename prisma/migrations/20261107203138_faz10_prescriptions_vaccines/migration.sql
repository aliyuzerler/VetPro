-- CreateTable
CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "encounter_id" UUID,
    "veterinarian_id" UUID NOT NULL,
    "code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "official_ref" TEXT,
    "signed_at" TIMESTAMP(3),
    "signed_by_id" UUID,
    "voided_at" TIMESTAMP(3),
    "voided_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_lines" (
    "id" UUID NOT NULL,
    "prescription_id" UUID NOT NULL,
    "product_id" UUID,
    "drug_name" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "dose_amount" DECIMAL(10,3),
    "dose_unit" TEXT,
    "route" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration_days" INTEGER,
    "quantity" DECIMAL(12,3) NOT NULL,
    "quantity_unit" TEXT NOT NULL,
    "instructions" TEXT,
    "dose_calc_weight_kg" DECIMAL(8,3),
    "dose_calc_mg_per_kg" DECIMAL(10,3),
    "dose_calc_formula" TEXT,
    "dose_calc_suggested" DECIMAL(10,3),
    "dose_calc_unit" TEXT,
    "dose_approved" BOOLEAN NOT NULL DEFAULT false,
    "dose_approved_by_staff_id" UUID,
    "dose_approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispense_events" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "prescription_id" UUID NOT NULL,
    "prescription_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "lot_id" UUID,
    "lot_code" TEXT,
    "expires_at" TIMESTAMP(3),
    "qty" DECIMAL(12,3) NOT NULL,
    "movement_id" UUID,
    "dispensed_by_staff_id" UUID NOT NULL,
    "dispensed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "idempotency_key" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispense_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administration_events" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "prescription_line_id" UUID,
    "encounter_id" UUID,
    "product_id" UUID,
    "drug_name" TEXT NOT NULL,
    "dose_given" DECIMAL(10,3),
    "dose_unit" TEXT,
    "route" TEXT,
    "site" TEXT,
    "administered_by_staff_id" UUID NOT NULL,
    "administered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "idempotency_key" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccine_protocols" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "species_id" UUID,
    "name" TEXT NOT NULL,
    "first_dose_age_days" INTEGER NOT NULL DEFAULT 0,
    "booster_interval_days" INTEGER NOT NULL DEFAULT 365,
    "reminder_lead_days" INTEGER NOT NULL DEFAULT 14,
    "dose_label" TEXT,
    "route" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccine_protocols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccine_events" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "protocol_id" UUID,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "lot_code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "encounter_id" UUID,
    "administered_by_staff_id" UUID NOT NULL,
    "administered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dose_label" TEXT,
    "route" TEXT,
    "site" TEXT,
    "note" TEXT,
    "next_due_at" TIMESTAMP(3),
    "idempotency_key" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vaccine_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccine_reminders" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID,
    "patient_id" UUID NOT NULL,
    "vaccine_event_id" UUID,
    "product_id" UUID,
    "kind" TEXT NOT NULL DEFAULT 'booster_due',
    "due_at" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "channel" TEXT,
    "sent_at" TIMESTAMP(3),
    "sent_by_staff_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccine_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prescriptions_clinic_id_status_idx" ON "prescriptions"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "prescriptions_branch_id_status_idx" ON "prescriptions"("branch_id", "status");

-- CreateIndex
CREATE INDEX "prescriptions_patient_id_created_at_idx" ON "prescriptions"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "prescriptions_encounter_id_idx" ON "prescriptions"("encounter_id");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_clinic_id_code_key" ON "prescriptions"("clinic_id", "code");

-- CreateIndex
CREATE INDEX "prescription_lines_prescription_id_idx" ON "prescription_lines"("prescription_id");

-- CreateIndex
CREATE INDEX "prescription_lines_product_id_idx" ON "prescription_lines"("product_id");

-- CreateIndex
CREATE INDEX "dispense_events_prescription_id_idx" ON "dispense_events"("prescription_id");

-- CreateIndex
CREATE INDEX "dispense_events_prescription_line_id_idx" ON "dispense_events"("prescription_line_id");

-- CreateIndex
CREATE INDEX "dispense_events_branch_id_dispensed_at_idx" ON "dispense_events"("branch_id", "dispensed_at");

-- CreateIndex
CREATE UNIQUE INDEX "dispense_events_idempotency_key_key" ON "dispense_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "administration_events_patient_id_administered_at_idx" ON "administration_events"("patient_id", "administered_at");

-- CreateIndex
CREATE INDEX "administration_events_branch_id_administered_at_idx" ON "administration_events"("branch_id", "administered_at");

-- CreateIndex
CREATE UNIQUE INDEX "administration_events_idempotency_key_key" ON "administration_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "vaccine_protocols_clinic_id_active_idx" ON "vaccine_protocols"("clinic_id", "active");

-- CreateIndex
CREATE INDEX "vaccine_protocols_product_id_idx" ON "vaccine_protocols"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "vaccine_protocols_clinic_id_name_key" ON "vaccine_protocols"("clinic_id", "name");

-- CreateIndex
CREATE INDEX "vaccine_events_patient_id_administered_at_idx" ON "vaccine_events"("patient_id", "administered_at");

-- CreateIndex
CREATE INDEX "vaccine_events_branch_id_administered_at_idx" ON "vaccine_events"("branch_id", "administered_at");

-- CreateIndex
CREATE INDEX "vaccine_events_clinic_id_product_id_idx" ON "vaccine_events"("clinic_id", "product_id");

-- CreateIndex
CREATE INDEX "vaccine_events_protocol_id_idx" ON "vaccine_events"("protocol_id");

-- CreateIndex
CREATE UNIQUE INDEX "vaccine_events_idempotency_key_key" ON "vaccine_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "vaccine_reminders_clinic_id_status_due_at_idx" ON "vaccine_reminders"("clinic_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "vaccine_reminders_patient_id_idx" ON "vaccine_reminders"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "vaccine_reminders_vaccine_event_id_kind_key" ON "vaccine_reminders"("vaccine_event_id", "kind");

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_veterinarian_id_fkey" FOREIGN KEY ("veterinarian_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_signed_by_id_fkey" FOREIGN KEY ("signed_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_lines" ADD CONSTRAINT "prescription_lines_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_lines" ADD CONSTRAINT "prescription_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_lines" ADD CONSTRAINT "prescription_lines_dose_approved_by_staff_id_fkey" FOREIGN KEY ("dose_approved_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispense_events" ADD CONSTRAINT "dispense_events_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispense_events" ADD CONSTRAINT "dispense_events_prescription_line_id_fkey" FOREIGN KEY ("prescription_line_id") REFERENCES "prescription_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispense_events" ADD CONSTRAINT "dispense_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispense_events" ADD CONSTRAINT "dispense_events_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispense_events" ADD CONSTRAINT "dispense_events_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispense_events" ADD CONSTRAINT "dispense_events_dispensed_by_staff_id_fkey" FOREIGN KEY ("dispensed_by_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administration_events" ADD CONSTRAINT "administration_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administration_events" ADD CONSTRAINT "administration_events_prescription_line_id_fkey" FOREIGN KEY ("prescription_line_id") REFERENCES "prescription_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administration_events" ADD CONSTRAINT "administration_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administration_events" ADD CONSTRAINT "administration_events_administered_by_staff_id_fkey" FOREIGN KEY ("administered_by_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_protocols" ADD CONSTRAINT "vaccine_protocols_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_protocols" ADD CONSTRAINT "vaccine_protocols_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_protocols" ADD CONSTRAINT "vaccine_protocols_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_events" ADD CONSTRAINT "vaccine_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_events" ADD CONSTRAINT "vaccine_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_events" ADD CONSTRAINT "vaccine_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_events" ADD CONSTRAINT "vaccine_events_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "vaccine_protocols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_events" ADD CONSTRAINT "vaccine_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_events" ADD CONSTRAINT "vaccine_events_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_events" ADD CONSTRAINT "vaccine_events_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_events" ADD CONSTRAINT "vaccine_events_administered_by_staff_id_fkey" FOREIGN KEY ("administered_by_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_reminders" ADD CONSTRAINT "vaccine_reminders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_reminders" ADD CONSTRAINT "vaccine_reminders_vaccine_event_id_fkey" FOREIGN KEY ("vaccine_event_id") REFERENCES "vaccine_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_reminders" ADD CONSTRAINT "vaccine_reminders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_reminders" ADD CONSTRAINT "vaccine_reminders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_reminders" ADD CONSTRAINT "vaccine_reminders_sent_by_staff_id_fkey" FOREIGN KEY ("sent_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_reminders" ADD CONSTRAINT "vaccine_reminders_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
