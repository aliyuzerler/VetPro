# Türkiye Market Feature Benchmark (5 November 2026)

This is a feature benchmark based on public vendor pages, not an independent verification of vendor customer counts, uptime, clinical validity or pricing. Re-check before commercial launch.

## Observed competitor feature patterns

| Product / vendor page | Publicly described capabilities | Implication for VetCore |
|---|---|---|
| VetApp | Owner/patient, appointment, SOAP, vaccine, service-to-sale, inventory, cashier/current account; web + Android + iOS claims | Basic patient/appointment/stock bundle is not enough to differentiate |
| Veterian | Appointment calendar, doctor shifts, reminders, owner/patient records, medical records, live flowboard, stock | Flowboard and role scheduling should be included |
| KlinikVet | Patient records, microchip, vaccine card, owner mobile app, reports, notifications, KVKK/security marketing claims | Owner app can be an optional follow-on, not initial staff MVP |
| VetBis | Multi-branch, staff, dynamic forms, SOAP, surgery, lab, hospitalization, vaccine, inventory, billing, cashier, reporting | Broad all-in-one coverage expected in mature competitor category |
| VETIVAR | Patient/owner, appointment, vaccine, prescriptions, stock, cash/current account, reports, multi-branch | Financial and branch scope should be part of architecture |
| Kolayvet | Appointment, customer/patient, reminders, accounting, product/stock | Simplicity and fast onboarding are important |

## Differentiation opportunity
1. **Service-to-stock-to-charge transaction integrity:** service templates define expected stock materials; actual lot and usage are captured; stock ledger and charge post together atomically.
2. **Traceable inventory:** lot/expiry/FEFO, cold-chain notes, recall/quarantine, returns and cross-branch transfer.
3. **Offline-aware staff mobile app:** clinical drafts and media capture in poor connectivity, with safe server-confirmed posting for finance/stock.
4. **Customer-owned installation and one-time license:** target clinics that prefer a dedicated installation and predictable ownership; updates/support sold separately.
5. **Exportability and backup transparency:** structured clinic-owned data export, documented restore test, no vendor lock-in.

## Public competitor pages
- VetBis features: https://vetbis.com/tr/ozellikler
- VetApp: https://www.vetapp.com.tr/ and https://www.vetapp.com.tr/ozellikler
- Veterian: https://veterian.com/tr/
- KlinikVet: https://klinikvet.app/
- VETIVAR: https://www.vetivar.com/ozellikler
- Kolayvet: https://www.kolayvet.com/ozellikler

## Product recommendation
Do not build a wide set of shallow features at once. Deliver the central clinic flow with high reliability first, then surgery/lab/hospitalization/grooming/boarding as controlled modules. In live sales demos, show one patient from booking through examination, vaccine/service, lot-specific stock decrement, charge, payment and printed visit summary.
