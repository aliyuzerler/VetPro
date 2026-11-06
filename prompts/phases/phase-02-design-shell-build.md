# Phase 02 — Tasarım sistemi ve uygulama kabukları / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Tasarım sistemi ve uygulama kabukları

## Instructions
design/tokens.json ve DESIGN_SYSTEM.md dosyasını kaynak kabul ederek web ve mobilde temel tema, tipografi, spacing, renk, form, buton, tablo, modal/drawer, status chip, toast, skeleton, empty/error state bileşenlerini oluştur. Web sidebar/topbar ve responsive dashboard shell; mobil bottom navigation ve ekran kabuğunu kur. Türkçe içerik, klinik terminolojisi ve örnek dashboard preview ile tutarlılık sağla. Henüz gerçek API modülleri veya sahte çalışan iş akışı ekleme.

## Acceptance criteria
- Web shell 1280/1440 genişlikte taşmamalı, tablet ve mobile uyumlu olmalı.
- Mobil safe area, keyboard ve 44pt touch target kontrol edilmeli.
- Renkler tokenlardan gelmeli, hardcoded renkler temizlenmeli.
- Loading/empty/error/unauthorized durumları demo component storylerinde görülmeli.
- Türkçe karakterler doğru görünmeli.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
