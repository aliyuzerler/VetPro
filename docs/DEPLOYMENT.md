# Deployment and Operations

## Customer deployment model
Default: isolated installation per clinic customer. Hosting can be on clinic server, customer VPS or a contracted managed server. Confirm internet, backup and mobile network requirements before sale.

## Docker Compose services
- reverse-proxy (TLS termination)
- web
- api
- worker
- postgres
- redis
- minio or external S3

Do not expose PostgreSQL, Redis or MinIO admin ports publicly. Use private Docker network and firewall. Only reverse proxy should be public.

## Environments
- local development: synthetic fixtures, local object storage and test SMS/email adapters.
- staging: masked synthetic data, production-like backup/restore, sandbox provider credentials.
- production: strong passwords, secrets manager, TLS, firewall, backup and monitoring.

## Release process
1. Verify DB backup and restore point.
2. Run CI: lint, typecheck, unit/integration/e2e, dependency/security scan.
3. Apply backward-compatible DB migration.
4. Deploy API/worker/web.
5. Run health and smoke tests.
6. Verify queue workers, file storage, push and notification adapters.
7. Record version and rollback procedure.

## Backup
- Daily full backup plus WAL/PITR if customer infrastructure supports it; frequency should match clinic's accepted RPO.
- Encrypt backup archive; keep offsite copy separate from host.
- Include PostgreSQL, object files, configuration metadata and version/license metadata. Never include secrets in plaintext.
- Retention configurable; perform regular restore test to isolated environment.
- Provide manual export/backup action to clinic owner.

## Customer handover
- Installation guide, admin credentials handover, role setup checklist, data migration template, training guide, backup responsibility matrix, update/support terms, recovery contact and version history.

---

## Güncelleme prosedürü (Faz 15)

1. Duyuru penceresi belirle (kliniğin mesai dışı tercihine göre).
2. `docker compose -f infra/docker/docker-compose.yml exec api sh -c "npx prisma migrate deploy"` öncesi
   **yedek al** (Ayarlar → Yedekler veya `POST /backup/runs`) ve arşiv + manifest'i
   offsite'e kopyala.
3. Yeni sürüm arşivini aç; `infra/docker/.env` korunur; `certs/` korunur.
4. `docker compose --profile app build && docker compose --profile app up -d`.
5. Smoke: `/api/v1/health/readiness` → ok; giriş; sahibi aç; bir ücret/tahsilat görünümü.
6. Sürüm kaydı: `/api/v1/health` yanıtındaki `version` + CHANGELOG.md başlığı
   destek geçmişine yazılır.

## Geri alma prosedürü (rollback)

- **Uygulama geri alma** (şema değişikliği içermeyen sürümler): önceki sürüm
  arşivini aç → `docker compose --profile app up -d --build`. Şema uyumludur.
- **Şema değişikliği içeren sürümler**: Prisma migrasyonu geriye dönük değildir;
  düzgün yol **yedekten restore**dur:
  1. Uygulamayı durdur (`docker compose --profile app stop api web worker`).
  2. docs/RESTORE_RUNBOOK.md adımlarıyla **staging ortamında** restore doğrula
     (checksum + satır mutabakatı PASS olmalı).
  3. Üretim DB'sinde restore kapısı kontrollü açılır
     (`VETCORE_BACKUP_ALLOW_RESTORE=true`, `backup.manage` yetkisi) → restore →
     kapı kapatılır → uygulama önceki sürüm imajıyla başlatılır.
- Her rollback sonrası: denetim kaydından son `BACKUP_RESTORED` girişi ve
  sürüm/doğrulama notları destek geçmişine yazılır.

## Observability (Faz 15)

- Liveness `/api/v1/health`, readiness `/api/v1/health/readiness` (db ping latencies).
- Her yanıt `x-correlation-id` taşır; destek kayıtları bu kimlikle eşleşir.
- Compose healthcheck'leri servis bazlı; nginx 429'ları hız baskısı sinyalidir.
- İzleme önerisi (klinik tarafı): disk doluluğu, yedek dizin büyümesi, API
  container restart sayısı, günlük hata logu sayımı.
