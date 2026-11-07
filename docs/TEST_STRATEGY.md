# Test Strategy

## Test pyramid
- Unit: domain rules, permissions, pricing, date calculations, unit conversions, notification scheduling.
- Component (Storybook): design-system primitives and UI widgets in isolation — every visual state, interaction `play` tests, axe accessibility checks.
- Integration: PostgreSQL transactions, inventory ledger, charge/payment allocation, upload access, branch isolation, sync idempotency.
- API contract: OpenAPI request/response and stable error codes.
- Web E2E: owner/patient → appointment → encounter → service → stock → charge → payment.
- Mobile E2E: agenda → patient lookup → offline draft → reconnect/sync → canonical confirmation.
- Security: IDOR, privilege escalation, branch access, mass assignment, file upload, token rotation, export authorization.
- Performance: patient search, calendar, patient timeline, stock balances, ledger and dashboard aggregation.

## Standard end-of-phase validation (Playwright + Storybook)
Every phase closes with the same chain, run in order:
1. `pnpm lint`, `pnpm typecheck`, `pnpm test`, affected workspace builds.
2. The phase test prompt executed as an independent QA pass.
3. **Playwright E2E (`pnpm --filter @vetcore/web e2e`)** with embedded PostgreSQL + API running:
   - Specs for every new user-facing surface of the phase are added under `apps/web/e2e/` before the phase can pass.
   - Screenshots are written to `apps/web/e2e/screenshots/` (desktop 1440 + mobile iPhone-14 viewport) and committed with the phase.
   - A green Playwright run plus current screenshots is a completion requirement; failing this blocks the phase regardless of unit/integration results.
4. **Storybook component tests (ADR-017)** — `pnpm --filter @vetcore/web storybook:build` then `pnpm --filter @vetcore/web storybook:test` against the static build:
   - New or changed design-system / UI primitives get stories under `apps/web/src/**/*.stories.tsx` before the phase can pass.
   - The test-runner (Playwright-based) executes every story headless: render smoke, interaction `play` functions and axe accessibility checks (`addon-a11y`; any violation fails the run).
   - Curated screenshots are refreshed via `node scripts/storybook-screenshots.mjs` into `docs/screenshots/storybook/` and the README section updated, then pushed to GitHub together with the phase.
5. **API e2e (integration) tests** (`apps/api/test/*.e2e-spec.ts`) run against the real
   database + full guard chain via `scripts/with-pg.sh` (embedded PostgreSQL wrapper).
   - Tests that need a DB are skipped gracefully when `DATABASE_URL` is unreachable
     (CI parity; unit tests always run).
   - **Decorator metadata parity (Faz 04 QA):** vitest's esbuild transform does not
     emit `design:paramtypes`, which silently disables the NestJS `ValidationPipe`
     (DTO metatype unknown → no 400s). The API workspace uses `unplugin-swc`
     (`apps/api/.swcrc`, `decoratorMetadata: true`) so tests validate exactly like
     production (`nest build`/tsc). Any new API test app must replicate
     `main.ts` setup: global prefix, `ValidationPipe` (whitelist + transform) and
     `GlobalExceptionFilter`.
   - Cross-file DB fixtures must be phase-agnostic: sync from the live permission
     catalog instead of hardcoded lists (Faz 04 defect: a fixed 11-permission fixture
     raced with parallel spec files and stripped new permissions from admin).

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
