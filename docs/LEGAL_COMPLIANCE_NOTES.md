# Legal and Regulatory Readiness Notes (Türkiye)

This file is an engineering checklist, not legal advice or a declaration of compliance. Requirements must be reviewed against the current consolidated legislation, official guidance and the specific clinic's authorizations before production use.

## Personal data / KVKK
- Owner and staff contact/identity records are personal data. The clinic's role as data controller and the software provider's role (where applicable) must be set in contracts and actual processing flows.
- Build configurable privacy notice versions, delivery records, contact preferences, data export and retention controls.
- The KVKK authority states that notice content should identify the controller, processing purposes, recipient groups/purposes, collection method/legal basis and data subject rights. See official source below.
- A general privacy policy is not automatically a substitute for activity-specific notice. Obtain legal review; do not assume consent is always the correct legal basis.

## Veterinary medicinal products / prescriptions
- Tarım ve Orman Bakanlığı guidance states that veterinary medicinal products are governed by Law 5996 and secondary legislation including the Veterinary Medicinal Products Regulation; product marketing/sales permissions and related responsibilities exist.
- The regulation was amended in November 2024. Keep product identifiers, lot/batch, expiry, supplier/source, receipt/sale/application records, prescriber/administrator identity and prescription data configurable. Confirm exactly which records apply to a specific clinic's license and activities.
- Do not claim that VetCore is an official e-prescription or ministry system integration unless a documented, authorized interface exists and has passed certification/acceptance where required.
- Do not enable sale/dispensing flows that conflict with a clinic's license or product restrictions. Role and product category controls are configurable and reviewed with clinic counsel/competent authority.

## E-Invoice / e-Archive
- Treat fiscal invoicing as an integration to an authorized GİB method/provider or the clinic's accounting system. A locally generated PDF/receipt is not an official e-invoice.
- Isolate provider adapter, store provider document IDs/statuses and reconcile retries. Validate current GİB technical and commercial requirements before implementation.

## Practical release checklist
- Obtain written clinic confirmation of required prescription/register fields and retention periods.
- Verify current official legislation and amendments on release date.
- Validate e-invoice/e-archive provider contract and test credentials.
- Approve privacy notice, data processing agreement, retention policy and communication preferences with legal counsel.
- Document data export, backup, breach/incident and user access procedures.

## Official references checked for this design
- Tarım ve Orman Bakanlığı, Veteriner Sağlık Ürünleri: https://www.tarimorman.gov.tr/HAYGEM/Menu/67/Veteriner-Saglik-Urunleri
- Tarım ve Orman Bakanlığı, 25.11.2024 amendment announcement: https://www.tarimorman.gov.tr/HHGM/Haber/96/Veteriner-Tibbi-Urunler-Hakkinda-Yonetmelikte-Degisiklik-Yapilmasina-Dair-Yonetmeligi-Ve-Turk-Gida-Kodeksi-Seker-Tebligi-Yayimlanmistir
- KVKK, Aydınlatma Yükümlülüğü: https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-
- KVKK, Aydınlatma yükümlülüğü kamuoyu duyurusu: https://www.kvkk.gov.tr/Icerik/6765/AYDINLATMA-YUKUMLULUGUNUN-YERINE-GETIRILMESI-HAKKINDA-KAMUOYU-DUYURUSU
- GİB e-Belge technical documentation portal: https://ebelge.gib.gov.tr/
