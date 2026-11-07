-- CreateTable
CREATE TABLE "species" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeds" (
    "id" UUID NOT NULL,
    "species_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "identity_no" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "archived_reason" TEXT,
    "merged_into_owner_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_contacts" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "label" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_consents" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "granted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "species_id" UUID NOT NULL,
    "breed_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "microchip" TEXT,
    "gender" TEXT NOT NULL DEFAULT 'unknown',
    "birth_date" DATE,
    "neutered" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "blood_type" TEXT,
    "archived_at" TIMESTAMP(3),
    "archived_reason" TEXT,
    "merged_into_patient_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_alerts" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_staff_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_observations" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "weight_kg" DECIMAL(6,3) NOT NULL,
    "measured_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_by_staff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "uploaded_by_staff_id" UUID,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'document',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "species_key_key" ON "species"("key");

-- CreateIndex
CREATE INDEX "breeds_species_id_idx" ON "breeds"("species_id");

-- CreateIndex
CREATE UNIQUE INDEX "breeds_species_id_name_key" ON "breeds"("species_id", "name");

-- CreateIndex
CREATE INDEX "owners_clinic_id_idx" ON "owners"("clinic_id");

-- CreateIndex
CREATE INDEX "owners_clinic_id_last_name_first_name_idx" ON "owners"("clinic_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "owner_contacts_owner_id_idx" ON "owner_contacts"("owner_id");

-- CreateIndex
CREATE INDEX "owner_contacts_normalized_idx" ON "owner_contacts"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "owner_consents_owner_id_kind_key" ON "owner_consents"("owner_id", "kind");

-- CreateIndex
CREATE INDEX "patients_clinic_id_idx" ON "patients"("clinic_id");

-- CreateIndex
CREATE INDEX "patients_branch_id_idx" ON "patients"("branch_id");

-- CreateIndex
CREATE INDEX "patients_owner_id_idx" ON "patients"("owner_id");

-- CreateIndex
CREATE INDEX "patients_clinic_id_name_idx" ON "patients"("clinic_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "patients_clinic_id_code_key" ON "patients"("clinic_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "patients_clinic_id_microchip_key" ON "patients"("clinic_id", "microchip");

-- CreateIndex
CREATE INDEX "patient_alerts_patient_id_active_idx" ON "patient_alerts"("patient_id", "active");

-- CreateIndex
CREATE INDEX "weight_observations_patient_id_measured_at_idx" ON "weight_observations"("patient_id", "measured_at");

-- CreateIndex
CREATE INDEX "file_assets_patient_id_idx" ON "file_assets"("patient_id");

-- CreateIndex
CREATE INDEX "file_assets_clinic_id_idx" ON "file_assets"("clinic_id");

-- AddForeignKey
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_merged_into_owner_id_fkey" FOREIGN KEY ("merged_into_owner_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_contacts" ADD CONSTRAINT "owner_contacts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_consents" ADD CONSTRAINT "owner_consents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_breed_id_fkey" FOREIGN KEY ("breed_id") REFERENCES "breeds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_merged_into_patient_id_fkey" FOREIGN KEY ("merged_into_patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_alerts" ADD CONSTRAINT "patient_alerts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_alerts" ADD CONSTRAINT "patient_alerts_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_observations" ADD CONSTRAINT "weight_observations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_observations" ADD CONSTRAINT "weight_observations_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_uploaded_by_staff_id_fkey" FOREIGN KEY ("uploaded_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
