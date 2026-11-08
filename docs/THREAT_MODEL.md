# Threat Model — VetCore (Faz 15)

Modelleme yöntemi: STRIDE-per-element. Kapsam: tek müşteri kurulumu (on-prem / VPS),
web yönetim arayüzü, REST API, React Native mobil istemci, PostgreSQL, nesne depolama
(MinIO/S3), bildirim sağlayıcı adaptörleri ve yedek/restore zinciri. Model, kurulum
başına yeniden gözden geçirilir (bkz. docs/HANDOVER.md sorumluluk matrisi).

## 1. Sistem öğeleri ve güven sınırları

| Öğe | Güven sınırı | Not |
|---|---|---|
| Tarayıcı (personel) | İnternet ↔ nginx TLS | Bearer token localStorage'da (ADR-015 bilinen yüzey) |
| Mobil uygulama (personel) | İnternet ↔ API | expo-secure-store; çevrimdışı kuyruk cihazda |
| nginx ters vekil | DMZ ↔ iç ağ | TLS sonlandırma, hız bölgesi, güvenlik başlıkları |
| API (NestJS) | İç ağ | Guard zinciri: Jwt → Permission → BranchScope |
| Worker (kuyruk) | İç ağ | Yalnız Redis + API iç uçları |
| PostgreSQL | İç ağ (internal: true) | Port host'a yayınlanmaz |
| MinIO / S3 | İç ağ | Dosyalar API aracılığıyla servis edilir (dış URL yok) |
| Yedek arşiv | Host dosya sistemi + offsite | AES-256-GCM, sha256 manifest |

## 2. STRIDE analizi ve tedaviler

| # | Tehdit (STRIDE) | Senaryo | Mevcut tedavi | Kalan risk |
|---|---|---|---|---|
| T-01 | Spoofing | Parola deneme saldırısıyla oturum ele geçirme | scrypt karma; login/refresh IP başına hız sınırı (API 20/dk, nginx authzone 30/dk); refresh rotasyonu + reuse detection | MFA/TOTP yok — Faz 15 sonrası öneri (bkz. HANDOVER) |
| T-02 | Spoofing | Çalıntı access token ile istek | 15 dk TTL; refresh döndürme; logout/revoke sunucu tarafı oturum silme | Kısa TTL penceresi geri alınamaz |
| T-03 | Tampering | Yanıt gövdesinin ara katmanda değiştirilmesi | TLS zorunlu (443), HSTS 180 gün | Sertifika yönetimi müşteri sorumluluğu |
| T-04 | Tampering | Denetim kaydının değiştirilmesi | `audit_events` UPDATE/DELETE veritabanı tetikleyicisiyle bloklu (Faz 15 migration); denetim okuma `audit.view` izinli | Süper kullanıcı (DBA) yine de bypass edebilir — offsite yedek uzlaştırmasıyla denetlenir |
| T-05 | Tampering | Yedek arşivinin değiştirilmesi | sha256 manifest + dosya bazlı checksum + AES-256-GCM auth tag; restore checksum doğrulaması | Anahtar (VETCORE_BACKUP_KEY) host'ta env olarak durur |
| T-06 | Repudiation | Personel işlemi reddetmesi | Append-only denetim defteri (aktör, aksiyon, varlık, IP, UA, metadata); lisans aktivasyonu da denetlenir | Denetim girişleri hassas okumaları kapsar (rapor dışa aktarma) |
| T-07 | Information disclosure | IDOR ile başka şube/hastanın verisi | BranchScopeGuard her şube kapsamlı uçta; service katmanı ikinci kontrol (clinicId + branchId); API düzeyi IDOR e2e testleri (test/security.e2e-spec.ts) | — |
| T-08 | Information disclosure | SQL enjeksiyonu | Prisma parametreli sorgular; kaçınılmaz ham tanımlayıcı kullanımları `assertIdentifier` beyaz listesiyle (Faz 15 SAST düzeltmesi) | — |
| T-09 | Information disclosure | Hassas verinin log/sıza | Log zarfı korelasyon kimliği taşır, sır/PII taşımaz; secret scan (scripts/security-scan.sh) CI kapısı | Müşteri log toplama altyapısı kendi KVKK değerlendirmesini yapmalı |
| T-10 | Information disclosure | Dosya deposuna doğrudan erişim | Private storage: dış URL yok, indirme yalnız kimlikli API ucu; MinIO portları internal ağ | — |
| T-11 | Denial of Service | API'yi istek baskısıyla kilitleme | Bellek içi kayan pencere limiti (API 600/dk, auth 20/dk, 429 + Retry-After) + nginx limit_req | Tek örnek limit; çok örnekli kurulumda nginx bölgesi üstlenir |
| T-12 | Denial of Service | Büyük dosya yüklemeyle disk doldurma | 10 MB/dosya üst sınırı, MIME + uzantı beyaz listesi | Kota/temizlik işi önerilir (HANDOVER bakım listesi) |
| T-13 | Elevation of privilege | İzin olmayan uca erişim | Deny-by-default PermissionsGuard; izin kataloğu tek kaynak (prisma/permissions.ts); rol değişiklikleri denetlenir | — |
| T-14 | Elevation of privilege | Yetkisiz şube yazımı | BranchScope + `allBranches` bayraklı rol ayrımı; çapraz şube 403 | — |
| T-15 | Tampering (lisans) | Sahte lisans anahtarıyla aktivasyon | HMAC-SHA256 imza + zaman-güvenli karşılaştırma; imza anahtarı yalnız sunucu env'si; aktivasyon denetimi | Offline doğrulama gereği sertifika zinciri yerine paylaşılan sır — satıcı sırrının korunması kritik |
| T-16 | Kill switch / telemetri | Uzaktan kilitleme, gizli veri toplama | TASARIMLA YOK: ağ çağrısı yapan lisans/billing/telemetri kodu yoktur (secret+SAST taramaları bağımsız doğrular) | — |
| T-17 | Supply chain | Bağımlılığa enjekte edilen zararlı kod | lockfile sabit (pnpm-lock.yaml); `pnpm audit` Faz 15'te koşuldu (bkz. rapor); yeni bağımlılık eklenmedi (Faz 15: 0 yeni runtime paketi) | Periyodik audit müşteri CI'ında tekrarlanmalı |
| T-18 | Repudiation | Bildirimlerin inkâr edilemezliği | Kuyruk satırı + deneme geçmişi + consent kontrolü (409 CONSENT_REQUIRED); sağlayıcı mesaj kimliği deterministik | Sağlayıcı tarafında mutabakat manuel |

## 3. Açık bulgular durumu

- Kritik/Yüksek: **0 açık bulgu** (Faz 15 kapanışında; bkz. docs/HANDOVER.md kalan risk listesi).
- Orta: T-01 MFA yokluğu; T-15 paylaşılan sır modeli; T-11 çok örnekli limit — hepsi
  belgelenmiş, kabul edilmiş, müşteri sözleşmesiyle sorumluluk paylaşılmıştır.
- Taramalar: `scripts/security-scan.sh` (secret, 0 bulgu), `scripts/sast-scan.mjs`
  (SAST, 0 bulgu — 8 denetlenmiş `sast-ok` bastırması), `pnpm audit --prod` (rapor
  CHANGELOG'da).

## 4. Modelin bakımı

Bu model; yeni modül, yeni dış entegrasyon veya mimari değişikliğinde (ör. httpOnly
cookie'ye geçiş, çok şubeli grup kurulumu) güncellenir. Son güncelleme: Faz 15 — 2026-11-09.
