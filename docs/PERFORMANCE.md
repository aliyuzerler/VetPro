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
