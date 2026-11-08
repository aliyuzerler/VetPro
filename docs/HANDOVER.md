# Müşteri Teslim Dokümanı — VetCore (Faz 15 kapanışı)

Bu doküman teslim paketinin son parçasıdır: destek modeli, kalan riskler, donanım
varsayımları ve manuel mevzuat doğrulama listesi. Güncelleme/geri alma prosedürü
docs/DEPLOYMENT.md'de, restore tatbikatı docs/RESTORE_RUNBOOK.md'dedir.

## 1. Teslim kapsamı (Faz 01–15)

- Kimlik/RBAC/şube kapsamı, sahip-hasta, randevu/akış, muayene (SOAP/vital/tanı),
  hizmet kataloğu, ürün/depo/parti (append-only defter), hizmet→stok→ücret atomik
  akış, kasa/tahsilat/cari/gider, reçete/aşı/hatırlatma, laboratuvar/cerrahi/yatış,
  bildirim/PDF/entegrasyon adaptörleri, mobil personel uygulaması + çevrimdışı
  senkron, raporlar/CSV-XLSX-PDF dışa aktarma/içe aktarma/şifreli yedekleme,
  güvenlik sertleştirme, performans ölçümü, kurulum ve teslim dokümantasyonu.
- **Abonelik/billing yok**: kalıcı (tek seferlik) lisans aktivasyonu vardır;
  uzaktan kill switch ve telemetri kodu bilinçli olarak yazılmamıştır
  (secret+SAST taramaları bağımsız doğrular).

## 2. Sorumluluk matrisi

| Konu | Satıcı (VetCore) | Klinik |
|---|---|---|
| Uygulama hataları | Sürüm düzeltmeleri | Hata bildirimi |
| Güvenlik yamaları | Belirtilen sürüm notlarıyla | Zamanında sürüm yükleme |
| TLS sertifikası | Rehber (docs/INSTALL.md §3) | Sertifika temini + yenileme |
| Yedek alma | Planlı yedek işi (worker) | Offsite kopya + restore tatbikatı yılda ≥1 |
| Sunucu/disk/izleme | Kapasite önerisi | Donanım, disk alanı, günlük takip |
| KVKK/mevzuat uyumu | Kontroller + doküman (bu dosya §5) | Hukuki doğrulama, aydınlatma metinleri |

## 3. Kalan riskler (kabul edilmiş, belgelenmiş)

| # | Risk | Seviye | Neden açık | Telafi |
|---|---|---|---|---|
| R-01 | MFA/TOTP yok (docs/SECURITY.md §2 hedefi ileri sürüm) | Orta | Kapsam kararı — tek müşteri kurulum, LAN kullanımı ağırlıklı | Katı parola politikası + login hız sınırı + oturum revoke |
| R-02 | Web token'ları localStorage'da (ADR-015) | Orta | httpOnly cookie + CSRF Faz 15 kapsamı dışı bırakıldı (mobil Bearer paritesi) | XSS yüzeyi Next.js varsayılan kaçışlarla kapalı; tarayıcı uyarıları |
| R-03 | Çok örnekli kurulumda bellek içi hız limiti örnek başına | Düşük | Tek örnekli kurulum modeli (ADR-002) | nginx limit_req ikinci katman |
| R-04 | Lisans doğrulaması paylaşılan sır (HMAC) | Düşük | Çevrimdışı doğrulama gereği (kill switch/telefon-home yasağı) | Satıcı sırrı yalnız sunucu env; sızıntıda anahtar rotasyonu prosedürü |
| R-05 | E-iletişim (SMS/WhatsApp/e-fatura) canlı sağlayıcı doğrulanmadı | Orta | ADR-009: yetkili doğrulama olmadan canlı mod açılmaz | Sandbox stub ile çalışır; sözleşme sonrası adaptör aktivasyonu |
| R-06 | Denetim kaydı DBA tarafından teknik olarak değiştirilebilir | Düşük | Tek PostgreSQL örneği; tam WORM arşivi kapsam dışı | Offsite yedek uzlaştırması + kontrollü DB erişimi |

## 4. Donanım varsayımları ve kapasite

- Pilot hedefi: 2–10 eşzamanlı personel, ~5.000 aktif hasta, ~200.000 stok satırı/yıl.
- Test ortamı ölçümü (gömülü PG, sandbox — **müşteri donanımı değildir**):
  ortak okuma p95 ≤ 20 ms, arama p95 ≤ 40 ms (bkz. docs/PERFORMANCE.md §Sonuçlar).
  Kurulum donanımında INSTALL.md §7 akışıyla ölçüm yenilenir ve aşağıdaki tabloya yazılır:

| Senaryo | Hedef | Kurulum ölçümü (doldurulur) |
|---|---|---|
| Ortak okuma p95 | < 400 ms | ____________ |
| Sahip/hasta arama p95 | < 500 ms | ____________ |
| Dashboard ilk anlamlı içerik | < 2,5 sn | ____________ |

- Disk: hasta dosyaları + yedekler büyümesiyle 100 GB'tan hızlı tüketebilir;
  aylık `du` takibi ve yedek retention ayarı (Ayarlar → Yedekler) önerilir.

## 5. Manuel mevzuat doğrulama listesi (klinik hukuk danışmanı)

Aşağıdaki maddeler ürün içinde yapılandırılabilir alanlar olarak tasarlanmıştır;
**hiçbirine uyum iddiası içerilmez** — her klinik kendi hukuk danışmanıyla doğrular:

1. KVKK: aydınlatma metni şablonları (sahip/personel) kurulumda doldurulmalı;
   açık rıza kayıtları OwnerConsent'te tutulur (pazarlama ≠ operasyonel hatırlatma).
2. Veri saklama süreleri: klinik/hasta kayıtları için yasal saklama süresi ile
   retention/purge politikası hukuk görüşüyle eşlenmelidir (ürün silmeyi arşive çevirir).
3. Veteriner reçete mevzuatı: REC-#### numaralandırma ve imza bloğu biçiminin
   güncel mevzuatla uyumu; e-reçete entegrasyonu **yapılmadı** (ADR-009).
4. Faturalama: Charge/ChargeLine muhasebe fişi değildir; ön muhasebe çıktılarının
   müşterinin mali müşaviriyle eşleştirilmesi gerekir.
5. Hayvan kimlik numarası/mikroçip alanları yapılandırılabilir; resmî kayıt sistemleriyle
   doğrulanmış entegrasyon yoktur.
6. İletişim: SMS/WhatsApp ticari ileti onay akışları sağlayıcı sözleşmesine tabidir.

## 6. Destek ve iletişim akışı

1. Sorun bildirimi: klinik yetkilisi → satıcı destek kanalı (sürüm + korelasyon kimliği eklenir).
2. Seviye tanımı: (a) sistem açılmıyor / veri kaybı riski — acil; (b) fonksiyon bozuk —
   yüksek; (c) UX/rapor talebi — normal. Sürüm bilgi kaynağı: `/api/v1/health` yanıtı
   (`version` alanı) ve CHANGELOG.md.
3. Her destek kaydında `x-correlation-id` değeri paylaşılarak API logundaki karşılığı aranır.

## 7. Eğitim kaynakları

- README.md: ekran akışları ve ekran görüntüleri (docs/screenshots).
- docs/DOMAIN_WORKFLOWS.md: klinik iş akışları (muayene→hizmet→ücret→tahsilat).
- docs/RESTORE_RUNBOOK.md: yedek/restore tatbikatı adımları.
- docs/THREAT_MODEL.md: güvenlik mimarisi ve kontrol listesi.
