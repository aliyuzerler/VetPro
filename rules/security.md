# Security Rules
- Deny by default; backend permission check on every protected operation.
- Enforce clinic and branch access on all data access paths.
- No secrets in source, logs, screenshots or client bundles.
- Validate file uploads; store privately; serve via authorized short-lived URLs.
- Use secure sessions and refresh-token rotation.
- Audit clinical signing, prescriptions, stock, finance, role changes and exports.
- Never delete posted inventory/finance records; reverse with traceable entries.
- Protect all side-effecting operations with transactions and idempotency.
- Run security scans and test IDOR/privilege escalation before release.
