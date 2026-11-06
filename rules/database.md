# Database Rules
- UUID PKs; clinic and branch scope on all tenant-owned records.
- Foreign keys/check constraints/unique constraints for invariants.
- Immutable posted ledger; reversal instead of update/delete.
- Decimal columns for money and quantities; explicit units.
- Index based on real access patterns; all paginated sorting must be deterministic.
- Do not use `updated_at` as a substitute for full audit history.
- Migrations are append-only after release; include rollback notes.
- Test concurrency around stock allocation and document numbering.
