/**
 * VetCore sentetik seed — yalnızca demo verisi (Faz 05 güncel sürümü).
 * GERÇEK klinik verisi asla kullanılmaz (agents.md kuralı).
 * Kapsam: klinik + şubeler, izin kataloğu, sistem rol şablonları, sentetik personel
 * (scrypt hash), personel-rol/şube eşlemeleri, oda ve depo placeholder kayıtları,
 * tür/ırk kataloğu, sentetik sahip/hasta uyarı/kilo kayıtları (Faz 04) ve randevu
 * türleri, çalışma saatleri, bugünün sentetik randevuları + bekleme listesi (Faz 05).
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from './permissions';

const prisma = new PrismaClient();

/** Demo parola (yalnızca sentetik demo hesapları için). */
const DEMO_PASSWORD = 'VetCore2026!';

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const key = scryptSync(password, salt, 64, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString('hex')}:${key.toString('hex')}`;
}

async function main(): Promise<void> {
  // 1) İzin kataloğu (global)
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        name: permission.name,
        description: permission.description,
        group: permission.group,
      },
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
    {
      key: 'admin',
      name: 'Klinik Yöneticisi',
      description: 'Tüm izinler, tüm şubeler',
      isSystem: true,
      allBranches: true,
      permissions: ALL,
    },
    {
      key: 'veteriner',
      name: 'Veteriner Hekim',
      description: 'Klinik karar, hasta ve sahip yönetimi',
      isSystem: true,
      allBranches: false,
      permissions: [
        'clinical.sign',
        'owner.manage',
        'patient.manage',
        'appointment.manage',
        'appointment.override',
      ],
    },
    {
      key: 'resepsiyon',
      name: 'Resepsiyon',
      description: 'Karşılama, sahip ve hasta kaydı (kısıtlı)',
      isSystem: true,
      allBranches: false,
      permissions: [
        'owner.manage',
        'patient.manage',
        'appointment.manage',
      ],
    },
    {
      key: 'stok',
      name: 'Stok Yöneticisi',
      description: 'Stok düzeltme ve depo yönetimi',
      isSystem: true,
      allBranches: false,
      permissions: ['inventory.adjust', 'warehouse.manage'],
    },
    {
      key: 'finans',
      name: 'Finans',
      description: 'İade ve rapor dışa aktarma',
      isSystem: true,
      allBranches: false,
      permissions: ['finance.refund', 'reports.export'],
    },
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
      email: 'admin@vetcore-demo.example',
      firstName: 'Deniz',
      lastName: 'Yıldız',
      title: 'Klinik Yöneticisi',
      roleKey: 'admin',
      branchCodes: ['MRKZ', 'SUB2'],
      defaultBranch: 'MRKZ',
    },
    {
      email: 'veteriner@vetcore-demo.example',
      firstName: 'Ayşe',
      lastName: 'Demir',
      title: 'Veteriner Hekim',
      roleKey: 'veteriner',
      branchCodes: ['MRKZ'],
      defaultBranch: 'MRKZ',
    },
    {
      email: 'resepsiyon@vetcore-demo.example',
      firstName: 'Mert',
      lastName: 'Kaya',
      title: 'Resepsiyon',
      roleKey: 'resepsiyon',
      branchCodes: ['MRKZ'],
      defaultBranch: 'MRKZ',
    },
    {
      email: 'stok@vetcore-demo.example',
      firstName: 'Elif',
      lastName: 'Şahin',
      title: 'Stok Sorumlusu',
      roleKey: 'stok',
      branchCodes: ['SUB2'],
      defaultBranch: 'SUB2',
    },
  ] as const;

  const branchByCode = new Map([
    ['MRKZ', merkez],
    ['SUB2', sube2],
  ]);
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

  // 7) Tür/ırk kataloğu (global master veri) — Faz 04
  const speciesDefs = [
    {
      key: 'cat',
      name: 'Kedi',
      breeds: [
        'Tekir',
        'British Shorthair',
        'Siyam',
        'İran Kedisi',
        'Scottish Fold',
        'Maine Coon',
        'Van Kedisi',
      ],
    },
    {
      key: 'dog',
      name: 'Köpek',
      breeds: [
        'Kangal',
        'Golden Retriever',
        'Labrador Retriever',
        'Alman Kurdu',
        'Poodle',
        'Beagle',
        'Chihuahua',
        'Siberian Husky',
      ],
    },
    { key: 'bird', name: 'Kuş', breeds: ['Muhabbet Kuşu', 'Kanarya', 'Papağan'] },
    { key: 'rabbit', name: 'Tavşan', breeds: ['Hollanda Tavşanı', 'Lop', 'Angora Tavşanı'] },
    { key: 'rodent', name: 'Kemirgen', breeds: ['Hamster', 'Kobay'] },
    { key: 'reptile', name: 'Sürüngen', breeds: ['Kaplumbağa', 'Kertenkele', 'Yılan'] },
  ] as const;
  const speciesByKey = new Map<string, string>();
  for (const speciesDef of speciesDefs) {
    const species = await prisma.species.upsert({
      where: { key: speciesDef.key },
      update: { name: speciesDef.name },
      create: { key: speciesDef.key, name: speciesDef.name },
    });
    speciesByKey.set(speciesDef.key, species.id);
    for (const breedName of speciesDef.breeds) {
      await prisma.breed.upsert({
        where: { speciesId_name: { speciesId: species.id, name: breedName } },
        update: {},
        create: { speciesId: species.id, name: breedName },
      });
    }
  }

  // 8) Sentetik sahip + hasta kayıtları — Faz 04 (idempotent: telefonla bul, yoksa oluştur)
  const normalizeTrPhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('5')) return `90${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `90${digits.slice(1)}`;
    if (digits.length === 12 && digits.startsWith('90')) return digits;
    return digits;
  };

  const breedId = async (speciesKey: string, breedName: string): Promise<string> => {
    const speciesId = speciesByKey.get(speciesKey);
    if (!speciesId) throw new Error(`Tür bulunamadı: ${speciesKey}`);
    const breed = await prisma.breed.findFirst({ where: { speciesId, name: breedName } });
    if (!breed) throw new Error(`Irk bulunamadı: ${breedName}`);
    return breed.id;
  };

  const ownerDefs = [
    {
      firstName: 'Zeynep',
      lastName: 'Aksoy',
      identityNo: null,
      address: 'Bahariye Cad. No:12, Kadıköy/İstanbul',
      notes: 'Sentetik demo kaydı',
      contacts: [
        {
          kind: 'phone',
          value: '+90 532 111 22 33',
          normalized: '905321112233',
          label: 'Cep',
          isPrimary: true,
        },
        {
          kind: 'phone',
          value: '0216 111 22 33',
          normalized: '902161112233',
          label: 'Ev',
          isPrimary: false,
        },
        {
          kind: 'email',
          value: 'zeynep.aksoy@example.com',
          normalized: 'zeynep.aksoy@example.com',
          label: null,
          isPrimary: true,
        },
      ],
      consents: { kvkk: true, sms: true, email: false, whatsapp: false, marketing: false },
      patients: [
        {
          code: 'HP-0001',
          name: 'Pamuk',
          speciesKey: 'cat',
          breedName: 'Tekir',
          branchCode: 'MRKZ',
          gender: 'female',
          birthDate: new Date('2022-04-10'),
          neutered: true,
          color: 'Gri tekir',
          microchip: '985101000000001',
          alerts: [{ kind: 'chronic', label: 'Kronik böbrek yetmezliği', severity: 'medium' }],
          weights: [
            { weightKg: 4.2, measuredAt: new Date('2026-08-15'), note: 'Routine' },
            { weightKg: 4.35, measuredAt: new Date('2026-10-20'), note: null },
          ],
        },
        {
          code: 'HP-0002',
          name: 'Karabaş',
          speciesKey: 'dog',
          breedName: 'Kangal',
          branchCode: 'MRKZ',
          gender: 'male',
          birthDate: new Date('2020-01-15'),
          neutered: true,
          color: 'Sarı',
          microchip: '985101000000002',
          alerts: [],
          weights: [{ weightKg: 32.5, measuredAt: new Date('2026-09-01'), note: null }],
        },
      ],
    },
    {
      firstName: 'Mehmet',
      lastName: 'Yılmaz',
      identityNo: null,
      address: 'Demo Mah. 3. Sk. No:7, Üsküdar/İstanbul',
      notes: null,
      contacts: [
        {
          kind: 'phone',
          value: '0533 444 55 66',
          normalized: '905334445566',
          label: 'Cep',
          isPrimary: true,
        },
      ],
      consents: { kvkk: true, sms: true, email: false, whatsapp: false, marketing: false },
      patients: [
        {
          code: 'HP-0003',
          name: 'Duman',
          speciesKey: 'cat',
          breedName: 'British Shorthair',
          branchCode: 'MRKZ',
          gender: 'male',
          birthDate: new Date('2021-08-21'),
          neutered: false,
          color: 'Mavi-gri',
          microchip: '985101000000003',
          alerts: [{ kind: 'allergy', label: 'Kuduz aşısı sonrası reaksiyon', severity: 'high' }],
          weights: [{ weightKg: 5.1, measuredAt: new Date('2026-10-05'), note: null }],
        },
      ],
    },
    {
      firstName: 'Ayşe',
      lastName: 'Kaya',
      identityNo: null,
      address: 'Örnek Cad. No:44, Beşiktaş/İstanbul',
      notes: null,
      contacts: [
        {
          kind: 'phone',
          value: '+90 542 777 88 99',
          normalized: '905427778899',
          label: 'Cep',
          isPrimary: true,
        },
        {
          kind: 'email',
          value: 'ayse.kaya@example.com',
          normalized: 'ayse.kaya@example.com',
          label: null,
          isPrimary: true,
        },
      ],
      consents: { kvkk: true, sms: false, email: true, whatsapp: false, marketing: false },
      patients: [
        {
          code: 'HP-0004',
          name: 'Boncuk',
          speciesKey: 'dog',
          breedName: 'Golden Retriever',
          branchCode: 'SUB2',
          gender: 'female',
          birthDate: new Date('2019-05-30'),
          neutered: true,
          color: 'Altın',
          microchip: null,
          alerts: [{ kind: 'chronic', label: 'Kalça displazisi', severity: 'medium' }],
          weights: [{ weightKg: 28.0, measuredAt: new Date('2026-09-18'), note: null }],
        },
      ],
    },
  ] as const;

  const branchByCode2 = new Map([
    ['MRKZ', merkez],
    ['SUB2', sube2],
  ]);
  const adminStaff = await prisma.staff.findUnique({
    where: { email: 'admin@vetcore-demo.example' },
  });
  for (const ownerDef of ownerDefs) {
    // Idempotentlik: birincil telefon normalize değeriyle mevcut sahibi bul.
    const primaryPhone = ownerDef.contacts.find(
      (c) => c.kind === 'phone' && c.isPrimary,
    )?.normalized;
    let owner = primaryPhone
      ? await prisma.owner.findFirst({
          where: { clinicId: clinic.id, contacts: { some: { normalized: primaryPhone } } },
        })
      : null;
    if (!owner) {
      owner = await prisma.owner.create({
        data: {
          clinicId: clinic.id,
          firstName: ownerDef.firstName,
          lastName: ownerDef.lastName,
          identityNo: ownerDef.identityNo,
          address: ownerDef.address,
          notes: ownerDef.notes,
        },
      });
    }
    for (const contact of ownerDef.contacts) {
      const exists = await prisma.ownerContact.findFirst({
        where: { ownerId: owner.id, normalized: contact.normalized },
      });
      if (!exists) {
        await prisma.ownerContact.create({
          data: {
            ownerId: owner.id,
            kind: contact.kind,
            value: contact.value,
            normalized: contact.normalized,
            label: contact.label,
            isPrimary: contact.isPrimary,
          },
        });
      }
    }
    for (const [kind, granted] of Object.entries(ownerDef.consents)) {
      await prisma.ownerConsent.upsert({
        where: { ownerId_kind: { ownerId: owner.id, kind } },
        update: {
          granted,
          grantedAt: granted ? new Date() : null,
          revokedAt: granted ? null : new Date(),
        },
        create: { ownerId: owner.id, kind, granted, grantedAt: granted ? new Date() : null },
      });
    }
    for (const patientDef of ownerDef.patients) {
      const speciesId = speciesByKey.get(patientDef.speciesKey);
      if (!speciesId) throw new Error(`Tür bulunamadı: ${patientDef.speciesKey}`);
      const breedIdValue = await breedId(patientDef.speciesKey, patientDef.breedName);
      const branch = branchByCode2.get(patientDef.branchCode);
      if (!branch) throw new Error(`Şube bulunamadı: ${patientDef.branchCode}`);
      const patient = await prisma.patient.upsert({
        where: { clinicId_code: { clinicId: clinic.id, code: patientDef.code } },
        update: { name: patientDef.name, ownerId: owner.id },
        create: {
          clinicId: clinic.id,
          branchId: branch.id,
          ownerId: owner.id,
          speciesId,
          breedId: breedIdValue,
          code: patientDef.code,
          name: patientDef.name,
          microchip: patientDef.microchip,
          gender: patientDef.gender,
          birthDate: patientDef.birthDate,
          neutered: patientDef.neutered,
          color: patientDef.color,
        },
      });
      for (const alert of patientDef.alerts) {
        const exists = await prisma.patientAlert.findFirst({
          where: { patientId: patient.id, label: alert.label, active: true },
        });
        if (!exists) {
          await prisma.patientAlert.create({
            data: {
              patientId: patient.id,
              kind: alert.kind,
              label: alert.label,
              severity: alert.severity,
              createdByStaffId: adminStaff?.id ?? null,
              active: true,
            },
          });
        }
      }
      for (const weight of patientDef.weights) {
        const exists = await prisma.weightObservation.findFirst({
          where: { patientId: patient.id, measuredAt: weight.measuredAt },
        });
        if (!exists) {
          await prisma.weightObservation.create({
            data: {
              patientId: patient.id,
              weightKg: weight.weightKg,
              measuredAt: weight.measuredAt,
              note: weight.note,
              createdByStaffId: adminStaff?.id ?? null,
            },
          });
        }
      }
    }
  }

  // 9) Randevu türleri — Faz 05 (klinik katalog; idempotent: klinik+ad unique)
  const appointmentTypeDefs = [
    { name: 'Muayene', durationMin: 20, colorKey: 'brand' },
    { name: 'Aşı', durationMin: 15, colorKey: 'green' },
    { name: 'Kontrol', durationMin: 15, colorKey: 'cyan' },
    { name: 'Operasyon', durationMin: 60, colorKey: 'red' },
    { name: 'Diş Temizliği', durationMin: 30, colorKey: 'violet' },
  ] as const;
  const typeByName = new Map<string, string>();
  for (const typeDef of appointmentTypeDefs) {
    const type = await prisma.appointmentType.upsert({
      where: { clinicId_name: { clinicId: clinic.id, name: typeDef.name } },
      update: { durationMin: typeDef.durationMin, colorKey: typeDef.colorKey, active: true },
      create: {
        clinicId: clinic.id,
        name: typeDef.name,
        durationMin: typeDef.durationMin,
        colorKey: typeDef.colorKey,
      },
    });
    typeByName.set(typeDef.name, type.id);
  }

  // 10) Çalışma saatleri — Faz 05. Veteriner hekim (Ayşe Demir) MRKZ'de Pzt–Cmt
  // 09:00–18:00; şube düzeyi varsayılan 08:00–19:00 (hekim tanımsızsa yedek).
  // Europe/Istanbul sabit UTC+03 (2016'dan beri kalıcı) → Date.UTC ile -3 saat ofseti.
  const veterinerStaff = await prisma.staff.findUnique({
    where: { email: 'veteriner@vetcore-demo.example' },
  });
  const workingDays = [1, 2, 3, 4, 5, 6]; // Pazartesi–Cumartesi
  /** ScheduleBlock'ta bileşik unique yok (staffId NULL satırları Postgres unique'e sığmaz);
   * idempotentlik findFirst + create/update deseniyle sağlanır. */
  const upsertBlock = async (where: {
    staffId: string | null;
    kind: 'working' | 'blocked';
    weekday: number;
    startMin: number;
  }, data: { endMin: number; note: string }) => {
    const existing = await prisma.scheduleBlock.findFirst({
      where: {
        branchId: merkez.id,
        staffId: where.staffId,
        kind: where.kind,
        weekday: where.weekday,
        startMin: where.startMin,
      },
    });
    if (existing) {
      await prisma.scheduleBlock.update({
        where: { id: existing.id },
        data: { endMin: data.endMin, note: data.note },
      });
    } else {
      await prisma.scheduleBlock.create({
        data: {
          clinicId: clinic.id,
          branchId: merkez.id,
          staffId: where.staffId,
          kind: where.kind,
          weekday: where.weekday,
          startMin: where.startMin,
          endMin: data.endMin,
          note: data.note,
        },
      });
    }
  };
  for (const weekday of workingDays) {
    await upsertBlock(
      { staffId: veterinerStaff?.id ?? null, kind: 'working', weekday, startMin: 540 },
      { endMin: 1080, note: 'Hekim çalışma saatleri' },
    );
  }
  await upsertBlock(
    { staffId: null, kind: 'working', weekday: 1, startMin: 480 },
    { endMin: 1140, note: 'Şube varsayılan çalışma saatleri (Pzt)' },
  );

  // 11) Bugünün sentetik randevuları — Faz 05. Akış panosu ve takvimin gerçek
  // verisi; seed her koşumda idempotent (şube+tür+hasta+zaman araması).
  /** İstanbul yerel saatini UTC instant'a çevirir (Europe/Istanbul = sabit UTC+03). */
  const istanbulInstant = (y: number, m: number, d: number, h: number, min: number): Date =>
    new Date(Date.UTC(y, m - 1, d, h - 3, min));

  const today = new Date();
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth() + 1;
  const td = today.getUTCDate();
  // Yerel (İstanbul) bugünün tarih parçaları — UTC+3 ile UTC tarihi fark verebilir
  const istanbulToday = istanbulInstant(ty, tm, td, 12, 0);
  const iy = istanbulToday.getUTCFullYear();
  const im = istanbulToday.getUTCMonth() + 1;
  const idd = istanbulToday.getUTCDate();

  const patientByCode = async (code: string) => {
    const patient = await prisma.patient.findUnique({
      where: { clinicId_code: { clinicId: clinic.id, code } },
    });
    if (!patient) throw new Error(`Hasta bulunamadı: ${code}`);
    return patient;
  };
  const pamuk = await patientByCode('HP-0001');
  const karabas = await patientByCode('HP-0002');
  const duman = await patientByCode('HP-0003');
  const boncuk = await patientByCode('HP-0004');

  const appointmentDefs = [
    {
      patient: pamuk,
      typeName: 'Kontrol',
      startHour: 10,
      durationMin: 15,
      status: 'completed',
      roomName: 'Muayene Odası 1',
      notes: 'Böbrek değerleri takibi',
      checkedInMin: 8,
      waitingMin: 5,
      inConsultMin: 0,
      completedMin: 12,
    },
    {
      patient: karabas,
      typeName: 'Aşı',
      startHour: 11,
      durationMin: 15,
      status: 'in_consultation',
      roomName: 'Muayene Odası 1',
      notes: 'Yıllık karma aşı',
      checkedInMin: -10,
      waitingMin: -5,
      inConsultMin: -2,
      completedMin: null,
    },
    {
      patient: duman,
      typeName: 'Muayene',
      startHour: 14,
      durationMin: 20,
      status: 'waiting',
      roomName: 'Muayene Odası 2',
      notes: 'İştah kaybı şikâyeti',
      checkedInMin: -15,
      waitingMin: -12,
      inConsultMin: null,
      completedMin: null,
    },
    {
      patient: boncuk,
      typeName: 'Operasyon',
      startHour: 16,
      durationMin: 60,
      status: 'scheduled',
      roomName: 'Operasyon Odası',
      notes: 'Kısırlaştırma planı (SUB2 randevusu MRKZ hekimi ile)',
      checkedInMin: null,
      waitingMin: null,
      inConsultMin: null,
      completedMin: null,
    },
  ] as const;

  const roomByName = async (branchId: string, name: string) => {
    const room = await prisma.room.findFirst({ where: { branchId, name } });
    if (!room) throw new Error(`Oda bulunamadı: ${name}`);
    return room;
  };

  for (const def of appointmentDefs) {
    const typeId = typeByName.get(def.typeName);
    if (!typeId || !veterinerStaff) throw new Error('Randevu seed önkoşulu eksik');
    const room = await roomByName(merkez.id, def.roomName);
    const start = istanbulInstant(iy, im, idd, def.startHour, 0);
    const end = new Date(start.getTime() + def.durationMin * 60_000);
    const checkedInAt =
      def.checkedInMin === null ? null : new Date(start.getTime() + def.checkedInMin * 60_000);
    const waitingAt =
      def.waitingMin === null ? null : new Date(start.getTime() + def.waitingMin * 60_000);
    const inConsultationAt =
      def.inConsultMin === null ? null : new Date(start.getTime() + def.inConsultMin * 60_000);
    const completedAt =
      def.completedMin === null ? null : new Date(start.getTime() + def.completedMin * 60_000);

    const exists = await prisma.appointment.findFirst({
      where: {
        clinicId: clinic.id,
        branchId: merkez.id,
        patientId: def.patient.id,
        appointmentTypeId: typeId,
        scheduledStart: start,
      },
    });
    if (!exists) {
      await prisma.appointment.create({
        data: {
          clinicId: clinic.id,
          branchId: merkez.id,
          patientId: def.patient.id,
          ownerId: def.patient.ownerId,
          appointmentTypeId: typeId,
          staffId: veterinerStaff.id,
          roomId: room.id,
          scheduledStart: start,
          scheduledEnd: end,
          status: def.status,
          notes: def.notes,
          checkedInAt,
          waitingAt,
          inConsultationAt,
          completedAt,
          createdById: adminStaff?.id ?? null,
        },
      });
    }
  }

  // 12) Bekleme listesi — Faz 05 (idempotent: hasta + waiting durumu araması)
  const waitlistNote = 'Sabah 09:00–11:00 arası tercih eder';
  const waitlistExists = await prisma.waitlistEntry.findFirst({
    where: { clinicId: clinic.id, patientId: duman.id, status: 'waiting', note: waitlistNote },
  });
  if (!waitlistExists && veterinerStaff) {
    await prisma.waitlistEntry.create({
      data: {
        clinicId: clinic.id,
        branchId: merkez.id,
        patientId: duman.id,
        ownerId: duman.ownerId,
        appointmentTypeId: typeByName.get('Kontrol') ?? null,
        preferredStaffId: veterinerStaff.id,
        preferredStartMin: 540,
        preferredEndMin: 660,
        note: waitlistNote,
        status: 'waiting',
        createdById: adminStaff?.id ?? null,
      },
    });
  }

  const [branchCount, staffCount, roleCount, permissionCount] = await Promise.all([
    prisma.branch.count({ where: { clinicId: clinic.id } }),
    prisma.staff.count({ where: { clinicId: clinic.id } }),
    prisma.role.count({ where: { clinicId: clinic.id } }),
    prisma.permission.count(),
  ]);
  const [ownerCount, patientCount] = await Promise.all([
    prisma.owner.count({ where: { clinicId: clinic.id } }),
    prisma.patient.count({ where: { clinicId: clinic.id } }),
  ]);
  const [appointmentCount, waitlistCount, typeCount] = await Promise.all([
    prisma.appointment.count({ where: { clinicId: clinic.id } }),
    prisma.waitlistEntry.count({ where: { clinicId: clinic.id } }),
    prisma.appointmentType.count({ where: { clinicId: clinic.id } }),
  ]);

  console.log('Seed tamamlandı (sentetik demo verisi):');
  console.log(`  Klinik: ${clinic.name} (${clinic.slug})`);
  console.log(`  Şube sayısı: ${branchCount}`);
  console.log(`  Personel: ${staffCount} | Rol: ${roleCount} | İzin: ${permissionCount}`);
  console.log(`  Sahip: ${ownerCount} | Hasta: ${patientCount} | Tür: ${speciesDefs.length}`);
  console.log(`  Randevu: ${appointmentCount} | Randevu türü: ${typeCount} | Bekleme: ${waitlistCount}`);
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
