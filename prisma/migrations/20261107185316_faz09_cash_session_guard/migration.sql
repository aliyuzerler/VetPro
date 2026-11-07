-- Faz 09 — kasa oturumu bütünlüğü (Prisma şema DDL'i ile ifade edilemeyen kısıtlar).
-- 1) Bir kasa aynı anda yalnızca tek açık oturuma sahip olabilir (kısmi tekil indeks).
CREATE UNIQUE INDEX "cash_sessions_one_open_per_register" ON "cash_sessions"("register_id") WHERE "status" = 'open';
-- 2) Sayımlar açıklama alanıyla birlikte anlamlıdır: fark ≠ 0 satırlarında
--    difference_note NOT NULL olamaz çünkü kapanış servis katmanında doğrulanır;
--    ancak defter bütünlüğü için veritabanı düzeyinde de kısıtlanır.
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_difference_note_required"
  CHECK ("difference_note" IS NOT NULL OR "difference" IS NULL OR "difference" = 0);
