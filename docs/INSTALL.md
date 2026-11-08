# Kurulum Rehberi — VetCore (tek müşteri kurulumu)

Hedef kitle: kurulum yapan teknik personel. Süre: boş bir sunucuda ~45 dakika.
Bu rehber kalıcı lisanslı, aboneliksiz kurulumu anlatır; güncelleme ve geri alma
için docs/DEPLOYMENT.md, yedek/restore için docs/RESTORE_RUNBOOK.md okunur.

## 1. Donanım ve yazılım varsayımları

| Bileşen | Alt sınır | Önerilen |
|---|---|---|
| CPU | 2 çekirdek | 4+ çekirdek |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 100+ GB SSD (yedek alanı dahil) |
| OS | Linux (Docker Compose v2 çalıştıran herhangi bir dağıtım) | Ubuntu 22.04 LTS |
| Ağ | Klinik iç LAN veya VPS; 80/443 erişimi | Statik IP + alan adı |
| Yedek | Yerel disk | Offsite kopya (RPO hedefi: 24 saat) |

> Bu varsayımlar pilot ölçeği içindir (bkz. docs/HANDOVER.md donanım listesi).
> Performans hedeflerinin doğrulaması kurulum donanımında yenilenir (§7).

## 2. Ön gereksinimler

1. Docker Engine 24+ ve Docker Compose v2 kurulu.
2. Alan adı klinik DNS'ine yönlendirilmiş; 80/443 portları erişilebilir.
3. Satıcıdan alınan teslim paketi: sürüm arşivi + **lisans anahtarı**
   (`VETCORE.<yük>.<imza>` biçimli) + bu depo.
4. (Let's Encrypt kullanılacaksa) sertifika istemcisi; aksi halde klinik CA sertifikası.

## 3. Kurulum adımları

```bash
# 1) Paket açılır ve ortam dosyası hazırlanır
unzip vetcore-release-<sürüm>.zip && cd vetcore
cp infra/docker/.env.example infra/docker/.env

# 2) .env doldurulur — ZORUNLU SIRLAR boş bırakılırsa kurulum bilinçli durur:
#    POSTGRES_PASSWORD, AUTH_JWT_SECRET (32+ rastgele karakter),
#    S3_ACCESS_KEY/S3_SECRET_KEY, VETCORE_BACKUP_KEY (bkz. RESTORE_RUNBOOK §anahtar).
#    VETCORE_LICENSE_SIGNING_KEY satıcı tarafından verilir (kalıcı lisans imza anahtarı).

# 3) TLS sertifikası yerleştirilir (depoya commit edilmez)
mkdir -p infra/docker/certs
#    fullchain.pem + privkey.pem → infra/docker/certs/

# 4) Altyapı + uygulama ayağa kaldırılır
docker compose -f infra/docker/docker-compose.yml --profile app up -d
#    Zorunlu değişken eksikse compose hata mesajıyla durur; .env tamamlanır.

# 5) Şema migrasyonu ve (opsiyonel) demo verisi
docker compose -f infra/docker/docker-compose.yml exec api \
  sh -c "npx prisma migrate deploy"
#    Üretim kurulumunda seed ÇALIŞTIRILMAZ — sentetik demo verisi yalnız geliştirmedir.

# 6) Sağlık kontrolü
curl -fsS https://<klinik-alan-adı>/api/v1/health/readiness | jq .
#    Beklenen: {"status":"ok", checks:[{name:"api"...},{name:"database"...}]}
```

## 4. Klinik kimlik yapılandırması ve lisans aktivasyonu

1. Tarayıcıdan `https://<klinik-alan-adı>/giris` → ilk kurulumda seed ile gelen
   yönetici hesabı (kurulum personeli şifre değiştirir; seed parolası üretimde kullanılmaz).
2. **Ayarlar → Klinik Profili**: klinik adı, saat dilimi (Europe/Istanbul), para birimi (TRY).
3. **Ayarlar → Şubeler / Personel / Roller**: gerçek şube ve personel kayıtları;
   seed rolleri silinmez, şablon olarak kullanılır.
4. **Ayarlar → Lisans**: satıcı anahtarını (`VETCORE.….`) girin → Etkinleştir.
   Doğrulama tamamen bu sunucuda çevrimdışı yapılır; anahtar son 4 karakter
   maskeli gösterilir, aktivasyon denetim kaydına yazılır.
   - Aktivasyon 503 `LICENSE_SIGNING_DISABLED` dönerse `.env` içinde
     `VETCORE_LICENSE_SIGNING_KEY` boş bırakılmıştır.
   - **Not**: Abonelik yoktur; uzaktan kill switch veya telemetri yoktur.
     Lisans yalnız kurulum kaydıdır ve kapatma kuvveti taşımaz.

## 5. Kurulum sonrası doğrulama (smoke)

1. Sahip + hasta kaydı oluştur (bkz. README ekran akışları).
2. Randevu aç, muayene yaz, hizmet kesinleştir, tahsilat al.
3. Belgeler sayfasından PDF üret ve önizle.
4. Ayarlar → Yedekler: manuel yedek al; manifest/checksum görünümünü doğrula.
5. `docker compose logs api --since 5m` içinde hata/hassas veri yok.

## 6. Kurulum güncellemesi ve geri alma (özet)

- Güncelleme: `git pull` / yeni sürüm arşivi → `pnpm db:deploy` (geriye uyumlu
  migrasyon) → `--profile app up -d` (yeniden derleme) → smoke test.
- Geri alma: önce `docs/RESTORE_RUNBOOK.md` restore tatbikatına göre yedek al;
  uygulama sürümünü önceki imaja döndür, şema değişikliği içeriyorsa yedekten
  restore et. Detaylı prosedür: docs/DEPLOYMENT.md §Güncelleme ve geri alma.

## 7. Kurulum donanımında performans doğrulaması

Kurulumu yapan personel hedef değerleri kendi donanımında ölçer:

```bash
# API + PostgreSQL çalışırken (N=40 istek/senaryo):
node scripts/f15-perf-bench.mjs   # PERF_BASE_URL=https://<klinik-alan-adı> ile
```

Hedefler (docs/PERFORMANCE.md): ortak okuma p95 < 400 ms, arama p95 < 500 ms.
Ölçüm sonucu docs/HANDOVER.md'deki teslim formuna yazılır.

## 8. Sık karşılaşılan sorunlar

| Belirtim | Neden | Çözüm |
|---|---|---|
| `compose up` hemen duruyor | Zorunlu sır boş (`:?` kapısı) | `.env` içindeki ilgili alanı doldur |
| 503 readiness | PostgreSQL hazır değil / DATABASE_URL hatalı | `docker compose logs postgres`; .env kontrol |
| Aktivasyon 503 LICENSE_SIGNING_DISABLED | İmza anahtarı yapılandırılmamış | `.env` → VETCORE_LICENSE_SIGNING_KEY |
| PDF'te Türkçe karakter bozuk | (Bilinen yok) — gömülü font | Yine de görülürse satıcıya sürüm raporla |
| Yedek restore kapısı 403 | `VETCORE_BACKUP_ALLOW_RESTORE=false` | Tatbikatta geçici true (RESTORE_RUNBOOK) |
