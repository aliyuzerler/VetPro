# Performance Rules
- Paginate large tables and timelines; virtualize long mobile lists.
- Avoid N+1 database queries; use measured indexes and query plans.
- Run large reports and exports asynchronously.
- Cache only derived/read data with explicit invalidation.
- Resize image uploads and generate thumbnails.
- Batch mobile sync; exponential backoff with jitter.
- Do not retry side effects without an idempotency key.
- Monitor DB, storage, queue and sync lag.
