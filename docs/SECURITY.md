# Security Rules

## 1. Data classification
- Personal/contact data: owners, staff, emergency contacts.
- Animal clinical data: patient history, treatment, prescription, imaging, lab and surgery data.
- Financial data: charges, payments, refunds, supplier balances and exports.
- Secrets: passwords, signing keys, integration tokens, backup keys.

Treat all clinic data as confidential even when animal health data is not human health data. Owner identity/contact and staff data are personal data.

## 2. Authentication and sessions
- Passwords hashed with Argon2id or a maintained secure password hashing library.
- Never store raw passwords, access tokens or refresh tokens in logs.
- Refresh-token rotation, reuse detection and session revocation.
- Secure, HttpOnly, SameSite cookies on web; secure storage on mobile. Never AsyncStorage for long-lived secrets.
- Privileged roles support MFA/TOTP. Rate limit login and password reset.

## 3. Authorization
- Server-side RBAC and branch scope on every resource request.
- Deny by default; granular permission names such as `inventory.adjust`, `inventory.transfer.approve`, `finance.refund`, `clinical.encounter.sign`, `reports.export`, `audit.view`.
- Do not trust role or branch IDs supplied by client without membership check.
- Hide restricted fields in API responses, not just in UI.
- Log permission changes and privileged actions.

## 4. Data and transport
- TLS for every production connection.
- Encrypt backups and sensitive file storage; key management documented separately from app data.
- Secrets via environment/secret manager, not committed `.env`.
- Parameterized DB queries; validate uploads by size, MIME, extension and content signature; malware scan where available.
- Signed short-lived file URLs; never expose MinIO credentials to client.
- CORS allowlist; secure headers; CSRF controls for cookie-authenticated mutations.

## 5. Clinical record integrity
- Draft can be edited by authorized users; signed record is immutable.
- Corrections use an addendum referencing the original record, author and timestamp.
- Prescriptions and controlled/high-risk product actions require appropriate permission and audit.
- Dose helpers are arithmetic-only and require a veterinarian's explicit confirmation.
- Never generate autonomous diagnosis or therapy recommendations.

## 6. Inventory and finance integrity
- Posted stock movements and payments cannot be deleted or overwritten.
- Reversal/refund requires reason, permission, reference to original event and audit.
- Transaction boundaries and idempotency for finalization, receipt, payment, refund and adjustments.
- Protect against negative stock race conditions with DB-level concurrency controls.
- Use Decimal money and quantities; validate currency and unit.

## 7. Privacy / KVKK readiness
- Define controller/processor responsibilities contractually for each customer deployment.
- Include configurable owner/staff privacy notice templates and a record of which notice/version was presented and when.
- Consent is not a substitute for identifying the correct legal processing condition. Separate marketing permissions from operational reminders.
- Support access, correction and export requests; deletion/anonymization decisions must respect clinical/accounting retention obligations and be reviewed by counsel.
- Minimize collected owner data; define retention and purge policies per clinic/customer legal review.
- Do not claim “KVKK compliant” by default; provide controls and documentation for the clinic's legal review.

## 8. Audit and incident response
- Append-only audit log for sign-in, sensitive read/export where appropriate, record finalization, prescription sign, stock/finance mutations, role changes and backup restore.
- Audit record: actor, action, entity, entity ID, timestamp, branch, request/correlation ID, reason and minimal before/after diff. Never log secrets or excessive personal/clinical payloads.
- Structured application logs, security alerts and documented incident response steps.
- Keep audit data tamper-resistant and restrict delete permissions to controlled maintenance procedures.

## 9. Secure development
- Dependency scanning, SAST, secret scanning and container image scanning in CI.
- Threat model file upload, auth, offline sync, tenant/branch scope, stock race and exports.
- Test IDOR, privilege escalation, mass assignment, injection, stored XSS, CSRF and file upload abuse.
