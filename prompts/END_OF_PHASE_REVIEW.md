# End-of-Phase Review Prompt

Review the implementation of the current phase against its build and test prompt. Inspect the actual code, database migrations and tests. Verify no future-phase scope was implemented in a way that creates technical debt. Run lint, typecheck, relevant tests and affected app builds. Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, and `docs/DECISIONS.md`. State whether it is safe to proceed. If not, fix blockers and re-run tests. Do not begin a new phase.
