# VetCore Design System

## Visual direction
Professional, calm, trustworthy veterinary-clinic software. Use a deep teal foundation with restrained mint surfaces and a warm coral accent. Avoid cartoonish paw-print motifs, neon gradients, excessive rounded cards and generic template styling. Data density must remain comfortable for reception and inventory tasks.

## Color tokens
Use `tokens.json` as the source of truth. Main palette:
- Brand deep teal: `#102C2B`, `#173B39`, `#216A64`
- Primary action: `#28847C`
- Soft surface: `#F1FAF8`
- Accent coral: `#D97855` only for selected highlights, not all buttons
- Text: `#1B2528`; secondary: `#6E7C80`; border: `#E2E8E7`
- Status colors only for status semantics (success, warning, danger, info)

## Typography
- Inter or equivalent modern sans-serif; fallback system fonts.
- Desktop dashboard page title 28–32 px; section title 18–20 px; body 14–15 px; table dense text minimum 13 px; helper text 12 px.
- Use tabular numerals for money, quantities and time.
- Turkish glyphs must render correctly: İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç.

## Layout
- Desktop shell: fixed 248 px sidebar, 72 px topbar, content max-width 1600 px, 28 px page padding.
- Content grid: 12 columns; 16–24 px gaps. Avoid card grids when a table or calendar is better.
- Page background `#F7F9F8`, cards white, subtle border and low shadow.
- Keep primary action at predictable top-right position.
- Tables: sticky header for long lists, clear row hover, compact but readable density, right-align numeric columns.
- Forms: label above control, hint below, error next to field; group into meaningful sections.

## Components
- Sidebar navigation with icons and expandable groups: Genel Bakış, Klinik, Hastalar, Randevular, Muayene, Aşı & Reçete, Depo & Stok, Satın Alma, Finans, Laboratuvar, Yatış & Cerrahi, Raporlar, Yönetim.
- Topbar: active branch selector, global search, notifications, help, profile.
- KPI cards: one headline value, label, compact trend or context; avoid arbitrary color fills.
- Status chips: restrained semantic backgrounds and readable text.
- Data table: search/filter/sort/column visibility/pagination/export based on permission.
- Patient identity panel: photo/avatar, name, species/breed, owner, microchip, alerts and current status.
- Patient timeline: chronological event feed with date, event type, staff attribution and drill-down.
- Clinical form: SOAP sections, vital signs grid, sticky save/finalize bar; dangerous action separated visually.
- Stock lot picker: product, location, lot, expiry, available quantity and status; expired/quarantined lots disabled.
- Toasts for confirmations; inline validation for form errors; modal only for focused confirmation/task.

## Interaction patterns
- Preserve filters when returning from detail pages.
- Use drawers for quick create/edit if the context remains visible; use full page for clinical encounter and complex workflows.
- Destructive/irreversible actions require clear reason and confirmation.
- Draft and finalized statuses must be visually distinct. Always show when a mobile record is queued or not yet synchronized.
- Loading skeletons for stable layout; empty state explains next useful action; errors include retry path.

## Mobile adaptation
- Bottom navigation for Today, Patients, Appointments, Tasks, More; use role-aware entries.
- Large touch targets ≥44×44 pt, comfortable one-hand reach and safe-area padding.
- Clinical quick actions are primary; dense reports and complex stock configuration remain web-first.
- Use bottom sheets for pickers; full-screen flows for examination and service finalization.
- Camera upload shows progress and queued/offline indicator.

## Accessibility
- WCAG 2.2 AA-oriented contrast, focus, keyboard, labels, semantic controls and screen-reader names.
- Do not convey status with color alone. Support reduced motion.
- Avoid 12 px text for critical content.
