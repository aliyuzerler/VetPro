# Deployment and Operations

## Customer deployment model
Default: isolated installation per clinic customer. Hosting can be on clinic server, customer VPS or a contracted managed server. Confirm internet, backup and mobile network requirements before sale.

## Docker Compose services
- reverse-proxy (TLS termination)
- web
- api
- worker
- postgres
- redis
- minio or external S3

Do not expose PostgreSQL, Redis or MinIO admin ports publicly. Use private Docker network and firewall. Only reverse proxy should be public.

## Environments
- local development: synthetic fixtures, local object storage and test SMS/email adapters.
- staging: masked synthetic data, production-like backup/restore, sandbox provider credentials.
- production: strong passwords, secrets manager, TLS, firewall, backup and monitoring.

## Release process
1. Verify DB backup and restore point.
2. Run CI: lint, typecheck, unit/integration/e2e, dependency/security scan.
3. Apply backward-compatible DB migration.
4. Deploy API/worker/web.
5. Run health and smoke tests.
6. Verify queue workers, file storage, push and notification adapters.
7. Record version and rollback procedure.

## Backup
- Daily full backup plus WAL/PITR if customer infrastructure supports it; frequency should match clinic's accepted RPO.
- Encrypt backup archive; keep offsite copy separate from host.
- Include PostgreSQL, object files, configuration metadata and version/license metadata. Never include secrets in plaintext.
- Retention configurable; perform regular restore test to isolated environment.
- Provide manual export/backup action to clinic owner.

## Customer handover
- Installation guide, admin credentials handover, role setup checklist, data migration template, training guide, backup responsibility matrix, update/support terms, recovery contact and version history.
