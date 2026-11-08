/**
 * Faz 13 — Playwright öncesi DB kalıntı temizliği.
 * Yarım kalan e2e koşumlarından kalan test randevuları/taslakları/sync
 * kayıtları silinir (demo veritabanı; seed kayıtlarına dokunulmaz).
 */
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const p = new PrismaClient();
  try {
    // Test randevuları: seed yalnız BUGÜN için randevu üretir; yarın ve sonrası
    // tüm randevular e2e kalıntısıdır (takvim 409 çakışmalarını önler).
    const ist = new Date(Date.now() + 180 * 60_000);
    const y = ist.getUTCFullYear();
    const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ist.getUTCDate() + 1).padStart(2, '0');
    const tomorrowStart = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
    const futureAppointments = await p.appointment.findMany({
      where: { scheduledStart: { gte: tomorrowStart } },
      select: { id: true },
    });
    if (futureAppointments.length) {
      await p.appointment.deleteMany({ where: { id: { in: futureAppointments.map((a) => a.id) } } });
      console.log('gelecek gün randevu kalıntısı silindi:', futureAppointments.length);
    } else {
      console.log('gelecek gün randevu kalıntısı yok');
    }

    // Bekleme listesi kalıntıları (E2E önekli notlar)
    const waitlist = await p.waitlistEntry.deleteMany({
      where: { note: { startsWith: "E2E" } },
    });
    console.log('bekleme listesi kalıntısı:', waitlist.count);

    // Test muayene taslakları (bilinen başlıklar + tümü-boş SOAP taslakları)
    const testTitles = [
      'Çevrimdışı açılan taslak — kusma',
      'Sürüm testi',
      'REPLAY testi',
      'Yarış testi',
      'Pull delta testi',
    ];
    const encounters = await p.encounter.findMany({
      where: {
        OR: [
          { chiefComplaint: { in: testTitles } },
          {
            status: 'draft',
            chiefComplaint: null,
            subjective: null,
            objective: null,
            assessment: null,
            plan: null,
            notes: null,
          },
        ],
      },
      select: { id: true },
    });
    if (encounters.length) {
      await p.encounter.deleteMany({ where: { id: { in: encounters.map((e) => e.id) } } });
      console.log('kalıntı taslak silindi:', encounters.length);
    } else {
      console.log('kalıntı taslak yok');
    }

    // Test sync işlem kayıtları (demo DB'de yalnız test kaynaklıdır)
    const ops = await p.syncOperation.deleteMany({});
    console.log('sync işlem kaydı silindi:', ops.count);
  } finally {
    await p.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
