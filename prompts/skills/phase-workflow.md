# Skill: Phase-by-phase implementation

1. Read the current phase and all referenced docs.
2. Inspect repository and previous phase status.
3. Summarize planned files and vertical slices.
4. Implement schema, API, UI, mobile impacts and tests for this phase only.
5. Run formatter, lint, typecheck, unit and integration tests.
6. Run the corresponding phase test prompt as a separate validation pass.
7. **Playwright E2E (standard at every phase end):** extend `apps/web/e2e/` with specs covering
   every new user-facing surface of the phase, run `pnpm --filter @vetcore/web e2e` with the API
   and embedded PostgreSQL up, and commit the refreshed screenshots from
   `apps/web/e2e/screenshots/` together with the phase deliverables. A phase without a green
   Playwright run and current screenshots is not complete.
8. **Storybook component tests (standard at every phase end, ADR-017):** add or update stories
   for every new/changed design-system or UI primitive, then
   `pnpm --filter @vetcore/web storybook:build && pnpm --filter @vetcore/web storybook:test`
   (render smoke + play interaction tests + axe accessibility; violations fail the run).
   Refresh `docs/screenshots/storybook/` with `node scripts/storybook-screenshots.mjs`.
   A phase without green Storybook tests and current screenshots is not complete.
9. Fix all failures; do not mark phase done with skipped tests unless a blocker is explicitly recorded.
10. Update implementation status, changelog, architecture decisions and docs; refresh the README
    screenshots sections and **push to GitHub** with the phase.
11. Report changed files, test commands/results, screenshots, known limitations and exact next phase.
