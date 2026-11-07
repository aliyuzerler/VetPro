/**
 * VetCore sentetik seed — yalnızca demo verisi (Faz 03 güncel sürümü).
 * GERÇEK klinik verisi asla kullanılmaz (agents.md kuralı).
 * Kapsam: klinik + şubeler, izin kataloğu, sistem rol şablonları, sentetik personel
 * (scrypt hash), personel-rol/şube eşlemeleri, oda ve depo placeholder kayıtları.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Demo parola (yalnızca sentetik demo hesapları için). */
const DEMO_PASSWORD = 'VetCore2026!';

/** API ile aynı format: scrypt:N:r:p:salt:key */
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const key = scryptSync(password, salt, 64, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString('hex')}:${key.toString('hex')}`;
}

const PERMISSIONS = [
  { key: 'clinical.sign', group: 'clinical', name: 'Muayene imzası', description: 'Karar ve SOAP kayıtlarını imzalar' },
  { key: 'inventory.adjust', group: 'inventory', name: 'Stok düzeltme', description: 'Sayım farkı ve manuel stok düzeltmesi yapar' },
  { key: 'finance.refund', group: 'finance', name: 'İade', description: 'Tahsilat iadesi oluşturur' },
  { key: 'reports.export', group: 'reports', name: 'Rapor dışa aktarma', description: 'Raporları dışa aktarır' },
  { key: 'audit.view', group: 'audit', name: 'Denetim kaydı', description: 'Denetim defterini görüntüler' },
  { key: 'settings.manage', group: 'settings', name: 'Klinik ayarları', description: 'Klinik profili ve ayarları düzenler' },
  { key: 'branch.manage', group: 'settings', name: 'Şube yönetimi', description: 'Şube kayıtlarını yönetir' },
  { key: 'staff.manage', group: 'staff', name: 'Personel yönetimi', description: 'Personel, rol ve şube atamalarını yönetir' },
  { key: 'roles.manage', group: 'staff', name: 'Rol yönetimi', description: 'Rolleri ve izin matrisini düzenler' },
  { key: 'room.manage', group: 'settings', name: 'Oda yönetimi', description: 'Muayene/operasyon odalarını yönetir' },
  { key: 'warehouse.manage', group: 'inventory', name: 'Depo yönetimi', description: 'Depo tanımlarını yönetir' },
] as const;

async function main(): Promise<void> {
  // 1) İzin kataloğu (global)
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { name: permission.name, description: permission.description, group: permission.group },
      create: permission,
    });
  }

  // 2) Klinik
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

  // 3) Şubeler
  const merkez = await prisma.branch.upsert({
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

  const sube2 = await prisma.branch.upsert({
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

  // 4) Sistem rol şablonları (düzenlenebilir)
  const ALL = PERMISSIONS.map((permission) => permission.key);
  const roleDefs = [
    { key: 'admin', name: 'Klinik Yöneticisi', description: 'Tüm izinler, tüm şubeler', isSystem: true, allBranches: true, permissions: ALL },
    { key: 'veteriner', name: 'Veteriner Hekim', description: 'Klinik karar ve muayene imzası', isSystem: true, allBranches: false, permissions: ['clinical.sign'] },
    { key: 'resepsiyon', name: 'Resepsiyon', description: 'Karşılama ve randevu (kısıtlı)', isSystem: true, allBranches: false, permissions: [] },
    { key: 'stok', name: 'Stok Yöneticisi', description: 'Stok düzeltme ve depo yönetimi', isSystem: true, allBranches: false, permissions: ['inventory.adjust', 'warehouse.manage'] },
    { key: 'finans', name: 'Finans', description: 'İade ve rapor dışa aktarma', isSystem: true, allBranches: false, permissions: ['finance.refund', 'reports.export'] },
  ] as const;

  const roles = new Map<string, string>();
  for (const roleDef of roleDefs) {
    const role = await prisma.role.upsert({
      where: { clinicId_key: { clinicId: clinic.id, key: roleDef.key } },
      update: {
        name: roleDef.name,
        description: roleDef.description,
        isSystem: roleDef.isSystem,
        allBranches: roleDef.allBranches,
      },
      create: {
        clinicId: clinic.id,
        key: roleDef.key,
        name: roleDef.name,
        description: roleDef.description,
        isSystem: roleDef.isSystem,
        allBranches: roleDef.allBranches,
      },
    });
    roles.set(roleDef.key, role.id);

    // Rol izinlerini eşitle (idempotent: fazlasını sil, eksiklerini ekle)
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (roleDef.permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: roleDef.permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })),
      });
    }
  }

  // 5) Sentetik personel
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const staffDefs = [
    {
      email: 'admin@vetcore-demo.example', firstName: 'Deniz', lastName: 'Yıldız',
      title: 'Klinik Yöneticisi', roleKey: 'admin', branchCodes: ['MRKZ', 'SUB2'], defaultBranch: 'MRKZ',
    },
    {
      email: 'veteriner@vetcore-demo.example', firstName: 'Ayşe', lastName: 'Demir',
      title: 'Veteriner Hekim', roleKey: 'veteriner', branchCodes: ['MRKZ'], defaultBranch: 'MRKZ',
    },
    {
      email: 'resepsiyon@vetcore-demo.example', firstName: 'Mert', lastName: 'Kaya',
      title: 'Resepsiyon', roleKey: 'resepsiyon', branchCodes: ['MRKZ'], defaultBranch: 'MRKZ',
    },
    {
      email: 'stok@vetcore-demo.example', firstName: 'Elif', lastName: 'Şahin',
      title: 'Stok Sorumlusu', roleKey: 'stok', branchCodes: ['SUB2'], defaultBranch: 'SUB2',
    },
  ] as const;

  const branchByCode = new Map([['MRKZ', merkez], ['SUB2', sube2]]);
  for (const staffDef of staffDefs) {
    const staff = await prisma.staff.upsert({
      where: { email: staffDef.email },
      update: {
        firstName: staffDef.firstName,
        lastName: staffDef.lastName,
        title: staffDef.title,
        passwordHash,
        active: true,
      },
      create: {
        clinicId: clinic.id,
        email: staffDef.email,
        passwordHash,
        firstName: staffDef.firstName,
        lastName: staffDef.lastName,
        title: staffDef.title,
      },
    });

    const roleId = roles.get(staffDef.roleKey);
    if (!roleId) throw new Error(`Rol bulunamadı: ${staffDef.roleKey}`);
    await prisma.staffRole.upsert({
      where: { staffId_roleId: { staffId: staff.id, roleId } },
      update: {},
      create: { staffId: staff.id, roleId },
    });

    for (const branchCode of staffDef.branchCodes) {
      const branch = branchByCode.get(branchCode);
      if (!branch) throw new Error(`Şube bulunamadı: ${branchCode}`);
      await prisma.staffBranch.upsert({
        where: { staffId_branchId: { staffId: staff.id, branchId: branch.id } },
        update: { isDefault: branchCode === staffDef.defaultBranch },
        create: {
          staffId: staff.id,
          branchId: branch.id,
          isDefault: branchCode === staffDef.defaultBranch,
        },
      });
    }
  }

  // 6) Oda ve depo placeholder master kayıtları
  const rooms = [
    { branch: merkez, name: 'Muayene Odası 1', kind: 'examination' },
    { branch: merkez, name: 'Muayene Odası 2', kind: 'examination' },
    { branch: merkez, name: 'Operasyon Odası', kind: 'surgery' },
    { branch: merkez, name: 'Laboratuvar', kind: 'lab' },
    { branch: sube2, name: 'Muayene Odası 1', kind: 'examination' },
    { branch: sube2, name: 'Operasyon Odası', kind: 'surgery' },
  ] as const;
  for (const room of rooms) {
    await prisma.room.upsert({
      where: { branchId_name: { branchId: room.branch.id, name: room.name } },
      update: { kind: room.kind },
      create: { branchId: room.branch.id, name: room.name, kind: room.kind },
    });
  }

  const warehouses = [
    { branch: merkez, name: 'Merkez Ana Depo' },
    { branch: sube2, name: 'Şube Deposu' },
  ] as const;
  for (const warehouse of warehouses) {
    await prisma.warehouse.upsert({
      where: { branchId_name: { branchId: warehouse.branch.id, name: warehouse.name } },
      update: {},
      create: { branchId: warehouse.branch.id, name: warehouse.name, isDefault: true },
    });
  }

  const [branchCount, staffCount, roleCount, permissionCount] = await Promise.all([
    prisma.branch.count({ where: { clinicId: clinic.id } }),
    prisma.staff.count({ where: { clinicId: clinic.id } }),
    prisma.role.count({ where: { clinicId: clinic.id } }),
    prisma.permission.count(),
  ]);

  console.log('Seed tamamlandı (sentetik demo verisi):');
  console.log(`  Klinik: ${clinic.name} (${clinic.slug})`);
  console.log(`  Şube sayısı: ${branchCount}`);
  console.log(`  Personel: ${staffCount} | Rol: ${roleCount} | İzin: ${permissionCount}`);
  console.log(`  Demo parola (tüm sentetik hesaplar): ${DEMO_PASSWORD}`);
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
