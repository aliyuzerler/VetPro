# Skill: Inventory and finance transaction integrity

- Model inventory as immutable ledger movements plus reconciled projections.
- Use lot/expiry where configured; block expired or quarantined lots by default.
- Validate and lock stock before posting; protect against concurrent depletion.
- Finalize service, stock consumption and charge atomically.
- Require idempotency on all mobile-retryable side effects.
- Reverse posted actions; never silently delete them.
- Keep unit conversions and cost calculations explicit and tested.
