/**
 * VetCore sentetik seed — yalnızca demo verisi.
 * GERÇEK klinik verisi asla kullanılmaz (agents.md kuralı).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const clinic = await prisma.clinic.upsert({
    where: { slug: 'vetcore-demo' },
    update: {},
    create: {
      name: 'VetCore Demo Kliniği',
      legalName: 'Demo Veteriner Klinik Hizmetleri Ltd. Şti.',
      slug: 'vetcore-demo',
      timezone: 'Europe/Istanbul',
      locale: 'tr-TR',
      currency: 'TRY',
    },
  });

  await prisma.branch.upsert({
    where: { clinicId_code: { clinicId: clinic.id, code: 'MRKZ' } },
    update: {},
    create: {
      clinicId: clinic.id,
      name: 'Merkez Şube',
      code: 'MRKZ',
      address: 'Örnek Mah. Demo Cad. No:1, Kadıköy/İstanbul',
      phone: '+90 216 000 00 00',
      email: 'merkez@vetcore-demo.example',
      isPrimary: true,
    },
  });

  await prisma.branch.upsert({
    where: { clinicId_code: { clinicId: clinic.id, code: 'SUB2' } },
    update: {},
    create: {
      clinicId: clinic.id,
      name: 'İkinci Şube',
      code: 'SUB2',
      address: 'Demo Mah. Örnek Sk. No:2, Beşiktaş/İstanbul',
      phone: '+90 212 000 00 00',
      email: 'sube2@vetcore-demo.example',
      isPrimary: false,
    },
  });

  const branchCount = await prisma.branch.count({ where: { clinicId: clinic.id } });

  console.log('Seed tamamlandı (sentetik demo verisi):');
  console.log(`  Klinik: ${clinic.name} (${clinic.slug})`);
  console.log(`  Şube sayısı: ${branchCount}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('Seed hatası:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
