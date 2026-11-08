-- CreateTable
CREATE TABLE "sync_operations" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "client_operation_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID,
    "expected_version" TEXT NOT NULL DEFAULT '0',
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_operations_clinic_id_branch_id_created_at_idx" ON "sync_operations"("clinic_id", "branch_id", "created_at");

-- CreateIndex
CREATE INDEX "sync_operations_clinic_id_staff_id_created_at_idx" ON "sync_operations"("clinic_id", "staff_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_operations_clinic_id_client_operation_id_key" ON "sync_operations"("clinic_id", "client_operation_id");

-- AddForeignKey
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
