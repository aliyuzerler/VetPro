# Performance and Reliability Rules

## Targets (initial acceptance targets; validate on agreed customer hardware)
- Common API reads p95 < 400 ms for 50k patient records and 1M stock movement lines with correct indexes and warm cache.
- Search response p95 < 500 ms for owner/patient/product queries.
- Dashboard first useful content < 2.5 s on typical clinic broadband and supported desktop.
- Mobile screen transition < 300 ms for cached screens; no blocking UI for background sync.
- API availability target 99.5% for single-server customer deployments, excluding planned maintenance; clearly disclose local hardware/network dependency.

## Database
- Paginate all unbounded lists; do not fetch full patient timeline or ledger at once.
- Add query indexes based on explain plans; monitor slow queries.
- Use select projections; avoid N+1. Batch related lookups.
- Reports run in async jobs when heavy; show job progress and downloadable result.
- Cache read-heavy dictionaries and product/service catalogs with invalidation strategy.
- Reconcile balance projections and never let cache become source of truth.

## Web and mobile
- Code split routes and lazy load large charts/editors.
- Optimize images on upload; create thumbnails and avoid original-size images in lists.
- Virtualize long lists/timelines.
- Mobile offline DB bounded by retention policy; paginate sync deltas and compress uploads.
- Retry transient errors with exponential backoff and jitter; never retry non-idempotent writes without idempotency key.
- Show queued/syncing/conflict states visibly.

## Reliability
- Health/readiness endpoints; graceful shutdown.
- Background jobs idempotent with retry/dead-letter handling.
- DB migrations executed as controlled deployment step with backup and rollback plan.
- Scheduled backup, checksum and restore drill.
- Monitor disk, DB connections, storage capacity, queue depth, failed jobs, sync backlog and notification failure rate.
- Define RPO/RTO with each customer. Suggested pilot target: RPO 24h maximum before offsite backup; improve based on clinic risk and backup frequency. RTO must be tested, not promised.

---

## Faz 15 — Ölçüm sonuçları ve slow query review (2026-11-09)

### Ölçüm ortamı
Gömülü PostgreSQL 17 (localhost), derlenmiş API (node dist), ölçek verisi:
**12.000 sahip + 10.000 hasta + 200 ürün + 60.000 stok hareketi** (sentetik),
N=40 istek/senario. Betik: `scripts/f15-perf-bench.mjs` (+ `scripts/f15-perf-chain.sh`).

### Sonuçlar (sandbox — müşteri donanımında INSTALL.md §7 ile yenilenir)

| Senaryo | p50 | p95 | max | Hedef | Durum |
|---|---|---|---|---|---|
| Hasta listesi (take=25) | 12 ms | 16 ms | 21 ms | p95 < 400 ms | PASS |
| Hasta arama (search=Bench) | 22 ms | 35 ms | 60 ms | p95 < 500 ms | PASS |
| Hasta detay (id) | 4 ms | 8 ms | 13 ms | p95 < 400 ms | PASS |
| Sahip arama (search=Bench) | 16 ms | 19 ms | 20 ms | p95 < 500 ms | PASS |
| Ürün arama (search=Bench) | 10 ms | 22 ms | 29 ms | p95 < 500 ms | PASS |
| Stok hareket listesi (take=25) | 12 ms | 17 ms | 36 ms | p95 < 400 ms | PASS |

### Slow query review bulgusu (düzeltilmiş)

**Bulgu**: Bulk yükleme (60k stok satırı + 10k hasta) sonrasında sahip arama
ilk 3–5 koşumda ~16,8 sn sürüyordu; ardından kalıcı olarak hızlanıyordu.
`pg_stat_activity` örnekleme + yakalanan Prisma SQL + EXPLAIN ANALYZE ile kök
neden izole edildi: sahiplik `_count` alt sorgusu (`patients` grubu) üzerinde
**bayat planner istatistikleriyle** seçilen patolojik birleşim planı (12k sahip ×
10k hasta). Aynı sorgu `ANALYZE` sonrası 0,1 ms mertebesine iner.

**Düzeltmeler**:
1. `BackupService.restoreRun` — restore replay sonrası manifest tablolarında
   `ANALYZE` (Faz 15); tablo adları `assertIdentifier` beyaz listesinden geçer.
2. `ImportsService.commit` — toplu insert sonrası hedef tablolarda `ANALYZE`.
3. `scripts/f15-perf-bench.mjs` — ölçek verisi sonrası `ANALYZE` (ölçüm
   metolojisinin parçası; bulk yüklemeyen normal klinik işleyişinde autovacuum
   kendi başına yeterlidir).

**Kalan not**: PG otovacuum threshold'ları (varsayılan) bulk yüklemeyi izleyen
analiz penceresi kapatır; çok büyük içe aktarmalarda import ANALYZE'ı bu
pencereyi ortadan kaldırır.

### İndeks gözden geçirmesi
Ana erişim yolları mevcut indekslerle destekleniyor: `owners(clinic_id, last_name,
first_name)` (arama/sıralama), `patients(clinic_id, archived_at)` + `patient_code`,
`stock_movements(clinic_id, kind, posted_at)` + `(warehouse_id, posted_at)`,
denetim `(clinic_id, created_at)`. ILIKE '%…%' ara eşleşmeleri trigram olmadan
sıralı taramaya düşer; ölçekte p95 hedeflerinin altında kaldığından (35–40 ms)
ek indeks eklenmedi — 100k+ hasta ölçeğinde tekrar ölçülür.
