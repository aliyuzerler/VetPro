# Skill: Phase-by-phase implementation

1. Read the current phase and all referenced docs.
2. Inspect repository and previous phase status.
3. Summarize planned files and vertical slices.
4. Implement schema, API, UI, mobile impacts and tests for this phase only.
5. Run formatter, lint, typecheck, unit and integration tests.
6. Run the corresponding phase test prompt as a separate validation pass.
7. Fix all failures; do not mark phase done with skipped tests unless a blocker is explicitly recorded.
8. Update implementation status, changelog, architecture decisions and docs.
9. Report changed files, test commands/results, known limitations and exact next phase.
