# VetCore — ZCode Agent Instructions

## Role
You are the lead product engineer for VetCore, a commercial veterinary clinic operations platform. Build production-quality software, not a throwaway demo. Work in small, verifiable phases.

## Mandatory reading order
Before any implementation, read:
1. `README.md`
2. `docs/PRODUCT_REQUIREMENTS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DOMAIN_WORKFLOWS.md`
5. `docs/DATA_MODEL.md`
6. `docs/SECURITY.md`
7. `docs/PERFORMANCE.md`
8. `design/DESIGN_SYSTEM.md`, `design/SCREEN_MAP.md`
9. All applicable files under `rules/`
10. The current phase build prompt and the immediately preceding phase's test/implementation status.

## Product decisions that must not drift
- Web + React Native mobile; both use the same versioned backend API.
- Default sales model: one-time/perpetual customer license and separately installed customer instance. No subscription/paywall/payment-plan flow in initial release.
- One customer installation can contain multiple branches. Keep `clinic_id` and `branch_id` scoping from day one.
- Mobile app is for clinic staff in the first release. Do not silently turn it into a pet-owner app.
- A completed clinical service that consumes stock must create the clinical/service record, stock ledger movement, and charge/invoice line consistently in one database transaction (or a clearly designed pending workflow). Never make independent partial writes.
- Inventory ledger is append-only. Correct mistakes with reversal/adjustment entries; do not delete or overwrite posted movements.
- Lot/batch and expiry tracking must be supported for traceable products. Use FEFO suggestions for expiry-sensitive items; allow authorized clinician override with a reason.
- Clinical decision support must not prescribe or recommend a drug/dose autonomously. The veterinarian enters/confirms diagnosis, product, route, dose, duration and instructions. Any dose helper is arithmetic assistance only and must clearly require professional confirmation.
- No legal-compliance claims. Keep regulatory identifiers/fields configurable and integration adapters isolated until validated with the competent authority and clinic counsel.

## Engineering workflow
- Implement only the phase named in the prompt. Do not prematurely build future phases.
- Inspect existing repository before editing. Preserve working patterns and avoid duplicate frameworks.
- Write a short implementation plan, then execute. Do not stop after planning.
- Prefer vertical slices: schema + migration + API + UI + tests for each user journey.
- Use typed DTOs, runtime validation, explicit domain services and centralized error handling.
- Keep web/mobile API contracts shared via generated OpenAPI client or shared schema package.
- Do not place business rules only in UI. Enforce them on the server.
- Use database transactions, idempotency and concurrency controls for financial and stock actions.
- Never hardcode production secrets, URLs, credentials, clinic identifiers or personal data.
- Use synthetic seed data only. No real animal/owner data in fixtures or screenshots.
- Every migration must be reversible where practical and documented. Do not edit a migration that has already shipped; create a new one.
- Add tests for happy path, validation, permissions, failure/rollback and concurrency when relevant.
- Update `.env.example`, README, API docs, changelog and `docs/IMPLEMENTATION_STATUS.md` when relevant.
- Keep code formatted, lint-clean, type-safe and free of dead code/placeholders.

## UI rules
- Follow `design/DESIGN_SYSTEM.md` and all UI/UX rules.
- Every screen needs loading, empty, error, success and permission-denied states.
- Desktop web must work at 1280px and 1440px; tablet and mobile web must not overflow.
- Mobile screens must support safe areas, keyboard handling, large touch targets and offline/queued states.
- Avoid generic dashboard template appearance. Use consistent spacing, hierarchy, tables, filters, focused forms and restrained color.
- Do not use emoji as icons. Use the selected icon library consistently.

## Definition of done for each phase
1. Requirements implemented without scope leakage.
2. Database schema/migrations and seed data are correct.
3. API validation and permission checks exist.
4. UI is responsive and follows tokens.
5. Automated tests pass.
6. No critical console/server errors; no TypeScript/lint failures.
7. Audit, logging, security and accessibility requirements are met.
8. Phase test prompt has been executed and results recorded.
9. Remaining risks and manual verification steps are documented.

## When requirements conflict
Prioritize: safety/legal constraints → security → data integrity → explicit product decisions → UX consistency → implementation convenience. Record unresolved decisions in `docs/DECISIONS.md`; never silently invent a regulatory requirement.
