# Restore Runbook — VetCore Yedekten Dönme Prosedürü (Faz 14)

> Bu runbook `BackupService` manifest'indeki `runbook` alanının işaret ettiği
> prosedürdür. Restore çift kapılıdır: **backup.manage izni** (API kontrolörü)
> ve **`VETCORE_BACKUP_ALLOW_RESTORE=true` env gate'i**. Gate kapalıyken
> uç `403 RESTORE_DISABLED` döner — üretimde bilinçli olarak kapalı tutulur,
> yalnız staging doğrulamasında açılır.

## 1. Yedek arşivi ne içerir?

Her tamamlanmış yedek çalışması (`BackupRun`, tablo `backup_runs`) iki dosya
üretir; ikisi de `VETCORE_BACKUP_DIR` (varsayılan `<cwd>/.backups`) altındaki
`<runId>/` dizininde, `0600` izinleriyle saklanır:

| Dosya | İçerik |
|---|---|
| `backup.vcenc` | AES-256-GCM ile şifreli mantıksal yedek paketi (arşiv) |
| `manifest.json` | `BackupManifest` — runId, clinicId, tarih, algoritma, arşiv sha256, tablo listesi + satır sayıları, object dosya adedi, uygulama sürümü, bu runbook'un yolu |

Arşiv paketi (decrypt sonrası) üç bölüm taşıyan bir bundle'dır
(`apps/api/src/backup/backup.bundle.ts`):

- `db/<tablo>.jsonl` — her kullanıcı tablosu için satır satır JSON (topolojik
  FK sırasıyla; `_prisma_migrations` hariçtir),
- `objects/<uuid>.bin` — özel dosya deposu (hasta dosyaları vb.) içerikleri,
- header — dosya listesi + **dosya başına sha256 checksum**'ları.

Anahtar türetimi: `scrypt(VETCORE_BACKUP_KEY, "vetcore-backup-v1", 32)`.
`VETCORE_BACKUP_KEY` üretimde **zorunlu** ve ayrı saklanmalıdır (demo
varsayılanı yalnız geliştirme içindir); anahtar yedek arşivinin yanında
asla tutulmaz.

## 2. Staging restore doğrulaması (kabul senaryosu)

1. **Ortamı hazırla** — staging API sürecinde:
   ```bash
   export VETCORE_BACKUP_ALLOW_RESTORE=true   # env gate'i aç
   # VETCORE_BACKUP_KEY yedek alındığındaki değerle AYNI olmalı
   ```
2. **Yedek al** — admin oturumuyla `POST /api/v1/backup/run`; çalışma
   `completed` olana dek `GET /backup/runs` izlenir.
3. **Manifest'i doğrula** — `GET /backup/runs/:id/manifest`: `archiveSha256`
   ve tablo/satır sayıları kaydedilmiş olmalı.
4. **Veriyi boz** — doğrulama için herhangi bir tabloda/objede test
   değişikliği yap (örn. bir ürünü sil, bir dosyayı taşı).
5. **Restore çalıştır** — `POST /api/v1/backup/runs/:id/restore`. Servis sırayla:
   1. arşiv sha256'sı manifest ile karşılaştırılır (uyuşmazlık →
      `400 BACKUP_CHECKSUM_MISMATCH`),
   2. arşiv çözülür, bundle dosya checksum'ları doğrulanır (uyuşmazlık →
      `400 BACKUP_FILE_CHECKSUM_MISMATCH`),
   3. tüm kullanıcı tabloları ters topolojik sırada `TRUNCATE` edilir
      (`session_replication_role = replica`, FK'ler geçici devre dışı),
   4. tablolar topolojik sırada 50 satırlık partilerle `INSERT` edilir,
   5. her tablonun gerçek satır sayısı manifest ile karşılaştırılır
      (uyuşmazlık → `400 RESTORE_COUNT_MISMATCH`),
   6. `objects/` dosyaları özel depo köküne `0600` ile geri yazılır,
   7. `BACKUP_RESTORED` denetim kaydı yazılır.
6. **Sonucu doğrula** — yanıt `checksumVerified: true` döner; adım 4'teki
   bozmanın geri geldiğini kontrol et ve demo girişiyle web uygulamasında
   kritik ekranları (kontrol paneli, hastalar, ürünler) aç.
7. **Gate'i kapat** — doğrulama sonrası `VETCORE_BACKUP_ALLOW_RESTORE`
   değişkenini kaldır; süreç yeniden başlatıldığında gate kapalıdır.

## 3. Yetkisiz erişim engelleri

- `backup.manage` izni yoksa `POST /backup/run`, `POST .../restore`,
  `POST /backup/retention` ve manifest/download uçları `403` döner
  (resepsiyon/veteriner/stok rolleri bu izne sahip değildir — e2e:
  `f14-09 resepsiyon yedekleme sayfasına erişemez`).
- İzin olsa bile env gate'i kapalıysa restore `403 RESTORE_DISABLED`.
- Arşiv dosyaları diskte `0600`; API indirme ucu (`GET /backup/runs/:id/download`)
  da `backup.manage` ister — doğrudan dosya yolu erişimi uygulama kullanıcısına
  açılmaz.

## 4. Retention ve yaşam döngüsü

- `backup_configs.retentionDays` (1–3650, varsayılan 30) klinik bazlı saklanır;
  `POST /backup/retention` ile güncellenir (`BACKUP_CONFIG_UPDATED` denetimi).
- `applyRetention`, `retentionUntil` geçmiş ve `running` olmayan çalışmaları
  arşiv + manifest dosyalarıyla birlikte siler (`BACKUP_EXPIRED` denetimi).
- Yedek dizini volume'e bağlanmalıdır (kapsayıcı katmanına yazılan yedek
  kaybolur); `.backups/` repoya girmez.

## 5. Sorun giderme

| Belirti | Neden | Çözüm |
|---|---|---|
| `403 RESTORE_DISABLED` | env gate kapalı | Staging'de `VETCORE_BACKUP_ALLOW_RESTORE=true` ile yeniden başlat |
| `403` (izin yok) | `backup.manage` yok | Admin/yönetici oturumu kullan |
| `BACKUP_CHECKSUM_MISMATCH` | Arşiv bozulmuş/parçalı yazılmış | Çalışmayı yeniden al; arşivi değiştirme |
| `BACKUP_FILE_CHECKSUM_MISMATCH` | Paket içi dosya bozulması | Aynı — arşiv güvenilir değil |
| `RESTORE_COUNT_MISMATCH` | Restore sırasında eşzamanlı yazım | Restore penceresinde yazım trafiğini durdur, tekrar dene |
| Decrypt hatası | Farklı/eksik `VETCORE_BACKUP_KEY` | Anahtar env'ini yedek alındığındaki değerle eşitle |

## 6. Bilinen sınırlar

- Yedek **mantıksal**dır (pg_dump yerine JSONL); tablo şeması restore hedefinde
  migrasyonlarla mevcut olmalıdır (aynı uygulama sürümü şemasıyla restore).
- Restore veritabanını truncate ederek yazdığından yalnız staging'de doğrulanır;
  üretimde bu uç gate ile kapalıdır ve kapalı kalması önerilir.
- Şema değişikliği sonrası eski yedek, yeni şemaya doğrudan restore edilemez —
  sürüm eşleşen ortamda doğrulanır.
