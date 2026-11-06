# VetCore Yedekleme Altyapısı

Bu klasör yedekleme işlerinin konfigürasyonunu içerir.

**Faz 01 kapsamı:** yedekleme iş mantığı bu fazda geliştirilmez (kapsam sızıntısı yasak).
Yedekleme, doğrulama ve kurtarma tatbikatları **Faz 14/15** kapsamında inşa edilir:

- Günlük tam yedek + WAL/PITR (müşteri altyapısı destekliyorsa)
- Şifreli arşiv, offsite kopya
- Restore tatbikatı zorunludur (docs/PERFORMANCE.md §Reliability)

Planlama notları için: `docs/DEPLOYMENT.md` (Backup bölümü).
