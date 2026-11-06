# Screen Map

## Web application

### A. Overview
- Dashboard: today's appointments, waiting patients, revenue summary, low stock, expiring lots, overdue vaccines, tasks and alerts.
- Flowboard: live clinic status lanes.

### B. Clinic
- Owners list/detail/create/edit; owner detail tabs: overview, pets, visits, balance, documents, communication log.
- Patients list/detail/create/edit; patient detail tabs: summary, timeline, clinical, vaccines, prescriptions, labs, files, finance.
- Appointments calendar/list; appointment create/edit; waitlist.

### C. Clinical
- Encounter workbench: patient identity/alerts, SOAP, vital signs, diagnosis, service selection, used products/lot, prescription, attachments and follow-up.
- Service catalog; price list; service consumption rules.
- Vaccine calendar and due/overdue list.
- Prescription list/detail/print.
- Lab order/result; surgery case; anesthesia chart; hospitalization board/rounds.

### D. Stock & procurement
- Product list/detail; categories; unit conversions; supplier list/detail.
- Stock overview by branch/warehouse; lot/expiry view; movement ledger.
- Goods receipt, purchase order, supplier return, stock count, stock adjustment, transfer.
- Temperature log and quarantine/recall.

### E. Finance
- Daily charges; payments; owner account statements; cash register open/close; refunds; expenses; supplier payables.
- Fiscal integration status panel (adapter-based; no fake official invoice status).

### F. People and administration
- Staff, roles, permission matrix, shifts, branch access.
- Branches, rooms, warehouses, service catalog, tax/numbering, print templates, notification templates, integrations, backup, audit log.

### G. Reports
- Daily/monthly finance, debt aging, service distribution, vet workload, patient activity, vaccination due, inventory valuation, expiry, product consumption, supplier purchase, lab turnaround, hospital census.

## React Native staff app
- Login / branch select / optional biometric unlock.
- Today dashboard and appointment agenda.
- Patient search and patient summary with alerts.
- Appointment detail and check-in/status.
- Encounter draft: SOAP, vital signs, photo attachment, service selection, prescription draft.
- Task list and notifications.
- Vaccine due actions and patient timeline.
- Stock quick search and availability; no privileged adjustment without permission.
- Sync center: queued, synced, conflicts, retry.
- Settings, account, branch, support and privacy notice.

## Optional future owner experience (not v1)
- Owner identity verification, pet profiles, appointment requests, vaccine reminders, document access, post-visit instructions and secure clinic messaging. Must have explicit clinic approval and a privacy/legal review.
