# Architecture Decision Log

| ID | Decision | Reason | Status |
|---|---|---|---|
| ADR-001 | Modular monolith backend | Faster delivery and simpler isolated customer deployments; module boundaries preserve later extraction | Accepted |
| ADR-002 | One customer installation per clinic group in v1 | Aligns with one-time license sales and customer data isolation | Accepted |
| ADR-003 | Branch-aware data model | Supports clinic groups without introducing SaaS billing | Accepted |
| ADR-004 | Shared NestJS API for web and React Native | Single source of truth for clinical, inventory and finance rules | Accepted |
| ADR-005 | Service finalization is atomic | Prevent partial clinical/stock/finance records and duplicate mobile retries | Accepted |
| ADR-006 | Append-only inventory and finance ledger | Traceability and audit integrity | Accepted |
| ADR-007 | Staff mobile app first; owner app later | Focus initial scope on clinic workflow and reduce product surface | Accepted |
| ADR-008 | Provider adapters for SMS/WhatsApp/e-invoice/labs | Avoid hard vendor coupling and enable customer-specific integrations | Accepted |
| ADR-009 | Regulatory fields configurable; no unverified official integrations | Requirements depend on current law and clinic permissions | Accepted |
| ADR-010 | Faz 01'de pnpm 10 + Turborepo 2 kullanımı (lockfile: pnpm-lock.yaml, `packageManager` alanı sabitlenir) | Faz promptu pnpm workspaces/Turborepo talep eder; tek kilit dosyası çift paket yöneticisi tutarsızlığını önler | Accepted — 2026-11-07 |
| ADR-011 | Docker'sız yerel geliştirmede gömülü PostgreSQL (`scripts/dev-postgres.mjs`); CI/staging/production'da Docker Compose PostgreSQL | Sandbox ve hafif geliştirme ortamlarında Docker olmadan gerçek migration/seed doğrulaması sağlar; üretim yolu değişmez | Accepted — 2026-11-07 |
| ADR-012 | Faz 01'de API, veritabanı olmadan açılabilir; readiness kontrolü durumu dürüstçe raporlar (db down → HTTP 503) | Geliştirme ve CI'da altyapı olmadan uygulama kabuğunun doğrulanabilmesi; sahte "up" durumu raporlanmaz | Accepted — 2026-11-07 |
| ADR-013 | Her fazın sonunda standart doğrulama zincirine Playwright E2E + ekran görüntüleri eklenir (`apps/web/e2e`, ekran görüntüleri repoya commit edilir) | Faz başına UI regresyonunu yakalamak, klinik paydaşa görülebilir çıktı vermek ve faz kapanışını tek ölçüte bağmak; unit/integration testleri yerinde kalır | Accepted — 2026-11-07 |

Append new decisions with date, context, options, consequences and approval owner.
| ADR-014 | Faz 03'te HS256 JWT için bağımlılıksız `node:crypto` HMAC uygulaması ve parola için scrypt (N=16384, r=8, p=1); jose/bcrypt gibi bağımlılık eklenmez | jose v6 yalnızca ESM dağıtır, API CommonJS derlenir (ts-nest build); Node yerleşik scrypt + HMAC-SHA256 standart ve denetlenebilirdir; bağımlılık yüzeyi küçülür. Token doğrulama unit testleriyle (imza/süre/iss/aud) kapsanır | Accepted — 2026-11-07 |
| ADR-015 | Web istemcisinde access/refresh token Faz 03'te localStorage'da tutulur; 401'de tek seferlik sessiz refresh denenir | Demo fazında httpOnly cookie altyapısı (CSRF, SameSite, cookie-parser) Faz 15 güvenlik sıkılaştırmasına ertelendi; mobil istemci de Bearer kullanacağı için API sözleşmesi Bearer esaslı kalır. Bilinen XSS yüzeyi CHANGELOG'da sınırlar altında belgelendi | Accepted — 2026-11-07 |
| ADR-016 | İzinler ve şube erişimi JWT payload'a gömülmez; JwtAuthGuard her istekte veritabanından taze yükler | İzin matrisi değişikliği anında etkin olur (eski token'larla yetki sürüklenmez); istek başına 1 ek sorgu kabul edilebilir (demo ölçeği); Faz 15'te ölçüm gerekirse kısa ömürlü talep bazlı önbellek eklenebilir | Accepted — 2026-11-07 |
