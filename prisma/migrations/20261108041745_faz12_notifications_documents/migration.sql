-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID,
    "template_id" UUID,
    "channel" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "recipient_value" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "skip_reason" TEXT,
    "last_error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_attempts" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "provider_name" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "provider_name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'sandbox',
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "config" JSONB,
    "last_check_at" TIMESTAMP(3),
    "last_check_result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_documents" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "document_no" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "patient_id" UUID,
    "owner_id" UUID,
    "encounter_id" UUID,
    "prescription_id" UUID,
    "lab_order_id" UUID,
    "hospital_stay_id" UUID,
    "snapshot" JSONB NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_mime" TEXT NOT NULL DEFAULT 'application/pdf',
    "file_size" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "print_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_templates_clinic_id_channel_idx" ON "notification_templates"("clinic_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_clinic_id_code_key" ON "notification_templates"("clinic_id", "code");

-- CreateIndex
CREATE INDEX "notifications_clinic_id_status_idx" ON "notifications"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "notifications_clinic_id_owner_id_idx" ON "notifications"("clinic_id", "owner_id");

-- CreateIndex
CREATE INDEX "notifications_branch_id_status_idx" ON "notifications"("branch_id", "status");

-- CreateIndex
CREATE INDEX "notifications_scheduled_for_status_idx" ON "notifications"("scheduled_for", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_clinic_id_idempotency_key_key" ON "notifications"("clinic_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "notification_attempts_notification_id_idx" ON "notification_attempts"("notification_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_attempts_notification_id_attempt_no_key" ON "notification_attempts"("notification_id", "attempt_no");

-- CreateIndex
CREATE INDEX "integration_connections_clinic_id_idx" ON "integration_connections"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_clinic_id_kind_key" ON "integration_connections"("clinic_id", "kind");

-- CreateIndex
CREATE INDEX "print_documents_clinic_id_kind_created_at_idx" ON "print_documents"("clinic_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "print_documents_branch_id_created_at_idx" ON "print_documents"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "print_documents_patient_id_idx" ON "print_documents"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "print_documents_clinic_id_document_no_key" ON "print_documents"("clinic_id", "document_no");

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_documents" ADD CONSTRAINT "print_documents_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_documents" ADD CONSTRAINT "print_documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_documents" ADD CONSTRAINT "print_documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_documents" ADD CONSTRAINT "print_documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_documents" ADD CONSTRAINT "print_documents_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_documents" ADD CONSTRAINT "print_documents_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_documents" ADD CONSTRAINT "print_documents_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_documents" ADD CONSTRAINT "print_documents_hospital_stay_id_fkey" FOREIGN KEY ("hospital_stay_id") REFERENCES "hospital_stays"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_documents" ADD CONSTRAINT "print_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
