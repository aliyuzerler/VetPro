# Test Strategy

## Test pyramid
- Unit: domain rules, permissions, pricing, date calculations, unit conversions, notification scheduling.
- Integration: PostgreSQL transactions, inventory ledger, charge/payment allocation, upload access, branch isolation, sync idempotency.
- API contract: OpenAPI request/response and stable error codes.
- Web E2E: owner/patient → appointment → encounter → service → stock → charge → payment.
- Mobile E2E: agenda → patient lookup → offline draft → reconnect/sync → canonical confirmation.
- Security: IDOR, privilege escalation, branch access, mass assignment, file upload, token rotation, export authorization.
- Performance: patient search, calendar, patient timeline, stock balances, ledger and dashboard aggregation.

## Mandatory high-risk test cases
1. Two users finalize a service using the last unit of the same stock lot simultaneously; at most one succeeds.
2. A service finalization failure after stock validation leaves no service charge or stock movement.
3. Retried request with same idempotency key creates no duplicate service, stock movement or charge.
4. Reversing a service creates reversal entries and preserves original movements.
5. Expired/quarantined lot cannot be consumed under default policy.
6. Staff from branch A cannot read/write branch B restricted records.
7. Receptionist cannot sign prescription or refund unless explicitly granted permission.
8. Offline queued visit note survives app restart and sync conflict; no silent overwrite.
9. Payment allocation cannot exceed permitted amount; refunds reference original payment.
10. Backup restores database and object files to a clean isolated environment.
