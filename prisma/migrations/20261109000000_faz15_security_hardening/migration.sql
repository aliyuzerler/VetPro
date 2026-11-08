-- ── Faz 15: güvenlik sertleştirme ──────────────────────────────────────────
-- 1) Denetim kaydı (audit_events) APPEND-ONLY: docs/SECURITY.md §8 gereği
--    denetim kaydı "tamper-resistant" olmalı; UPDATE/DELETE veritabanı düzeyinde
--    bloklanır. Yalnızca kontrollü bakım prosedürü (klinik sahibi + yedek
--    doğrulamalı) farklı bir migration ile açılabilir.
-- 2) Kalıcı lisans aktivasyon kaydı: aboneliksiz tek seferlik aktivasyon defteri.

-- ── 1) Denetim defteri append-only tetikleyicileri ─────────────────────────

CREATE OR REPLACE FUNCTION block_audit_event_mutation() RETURNS trigger AS $$
BEGIN
  -- FK ON DELETE SET NULL güncellemesine izin ver (Faz 03 deseni korunur):
  -- staff/branch referansı silindiğinde yalnız staff_id/branch_id NULL'a iner
  -- ve başka hiçbir kolon değişmez — tamper-resistance anlamlı kolonlarda kalır.
  IF TG_OP = 'UPDATE'
     AND NEW.staff_id IS NULL AND OLD.staff_id IS NOT NULL
     AND (NEW."branchId" IS NOT DISTINCT FROM OLD."branchId")
     AND (NEW."branchId" IS NULL OR NEW.staff_id IS NULL)
     AND NEW.clinic_id IS NOT DISTINCT FROM OLD.clinic_id
     AND NEW.action IS NOT DISTINCT FROM OLD.action
     AND NEW.entity_type IS NOT DISTINCT FROM OLD.entity_type
     AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
     AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
     AND NEW.ip IS NOT DISTINCT FROM OLD.ip
     AND NEW.user_agent IS NOT DISTINCT FROM OLD.user_agent
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_events append-only: % blocked (tamper-resistant audit log)', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_events_no_update
  BEFORE UPDATE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION block_audit_event_mutation();

CREATE TRIGGER trg_audit_events_no_delete
  BEFORE DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION block_audit_event_mutation();

-- ── 2) Lisans aktivasyon defteri ───────────────────────────────────────────
-- Basit ve şeffaf kalıcı lisans: satıcı tarafından imzalanan anahtar (HMAC-SHA256),
-- kurulumda bir kez doğrulanır ve kaydedilir. Uzak kill switch, telefon-home veya
-- telemetri YOKTUR — doğrulama tamamen çevrimdışıdır.

CREATE TABLE "license_activations" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "license_key" TEXT NOT NULL,
    "licensee_name" TEXT NOT NULL,
    "product_edition" TEXT NOT NULL DEFAULT 'standard',
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_by_staff_id" UUID,
    "note" TEXT,

    CONSTRAINT "license_activations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "license_activations_clinic_id_key" ON "license_activations"("clinic_id");
CREATE INDEX "license_activations_activated_at_idx" ON "license_activations"("activated_at");

ALTER TABLE "license_activations" ADD CONSTRAINT "license_activations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_activations" ADD CONSTRAINT "license_activations_activated_by_staff_id_fkey" FOREIGN KEY ("activated_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
