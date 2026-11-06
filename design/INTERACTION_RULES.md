# Interaction and Content Rules

- Use clinic language: “Hasta” means animal patient; “Hasta sahibi” means customer/owner. Avoid ambiguous use of “müşteri” in clinical forms.
- Every record detail displays code, status, created/updated metadata and responsible staff where relevant.
- Use Turkish dates (`dd.MM.yyyy`) and 24-hour time in UI; API stores ISO UTC.
- Monetary amounts show currency; decimals and thousands separators use Turkish locale.
- Quantity controls show unit beside every number. Lot selection shows expiry explicitly.
- Search should support name, phone, microchip, patient code, SKU and barcode as applicable.
- Warn on duplicate owner/patient before save; do not silently merge.
- Before finalizing a service, show a review summary: service lines, actual consumed products, selected lots, stock remaining, discounts/tax and total charge.
- If stock is insufficient, offer a clear resolution; never silently skip an expected material.
- Distinguish “Kaydedildi” from “Sunucuya gönderildi” and “Kesinleştirildi”.
- For medical decisions, label fields as veterinarian-entered/confirmed. Avoid AI or app-generated diagnosis claims.
- Use clear empty-state language and one primary next action per screen.
