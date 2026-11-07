import { describe, expect, it } from 'vitest';
import { findOwnerDuplicates, findPatientDuplicates } from './duplicates';

const owners = [
  {
    id: 'owner-1',
    firstName: 'Zeynep',
    lastName: 'Aksoy',
    phoneNumbers: ['905321112233', '902161112233'],
    emails: ['zeynep.aksoy@example.com'],
  },
  {
    id: 'owner-2',
    firstName: 'Mehmet',
    lastName: 'Yılmaz',
    phoneNumbers: ['905334445566'],
    emails: [],
  },
];

describe('findOwnerDuplicates — mükerrer sahip uyarısı', () => {
  it('aynı telefon (biçimden bağımsız) güçlü eşleşme verir', () => {
    const matches = findOwnerDuplicates({ phone: '0532 111 22 33' }, owners);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe('owner-1');
    expect(matches[0]!.reasons).toContain('phone');
  });

  it('ikinci telefon da eşleşir (cep dışı kanal)', () => {
    const matches = findOwnerDuplicates({ phone: '02161112233' }, owners);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reasons).toContain('phone');
  });

  it('aynı e-posta eşleşme verir', () => {
    const matches = findOwnerDuplicates({ email: 'Zeynep.Aksoy@example.com' }, owners);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reasons).toContain('email');
  });

  it('aynı ad+soyad zayıf eşleşme olarak gösterilir (yazım farkı senaryosu)', () => {
    const matches = findOwnerDuplicates({ firstName: 'zeynep', lastName: 'AKSOY' }, owners);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reasons).toEqual(['name']);
  });

  it('telefon + ad aynı anda eşleşirse nedenler birleşir', () => {
    const matches = findOwnerDuplicates(
      { firstName: 'Zeynep', lastName: 'Aksoy', phone: '+90 532 111 22 33' },
      owners,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reasons).toEqual(expect.arrayContaining(['phone', 'name']));
  });

  it('ilgisiz kayıt eşleşme vermez', () => {
    expect(findOwnerDuplicates({ phone: '0555 000 00 00' }, owners)).toHaveLength(0);
    expect(findOwnerDuplicates({ firstName: 'Ayşe', lastName: 'Kaya' }, owners)).toHaveLength(0);
  });

  it('boş girdi eşleşme üretmez (tüm alanlar opsiyonel)', () => {
    expect(findOwnerDuplicates({}, owners)).toHaveLength(0);
  });
});

const patients = [
  {
    id: 'patient-1',
    name: 'Pamuk',
    ownerId: 'owner-1',
    microchip: '985101000000001',
    speciesId: 'species-cat',
  },
  {
    id: 'patient-2',
    name: 'Karabaş',
    ownerId: 'owner-1',
    microchip: '985101000000002',
    speciesId: 'species-dog',
  },
  { id: 'patient-3', name: 'Duman', ownerId: 'owner-2', microchip: null, speciesId: 'species-cat' },
];

describe('findPatientDuplicates — mükerrer hasta uyarısı', () => {
  it('aynı mikroçip güçlü eşleşme verir (biçimden bağımsız)', () => {
    const matches = findPatientDuplicates({ microchip: '985-101 000 000 001' }, patients);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe('patient-1');
    expect(matches[0]!.reasons).toContain('microchip');
  });

  it('aynı sahibe aynı ad zayıf eşleşme verir', () => {
    const matches = findPatientDuplicates({ ownerId: 'owner-1', name: 'pamuk' }, patients);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reasons).toEqual(['owner-name']);
  });

  it('farklı sahibin aynı adlı hastası eşleşme vermez', () => {
    expect(findPatientDuplicates({ ownerId: 'owner-2', name: 'Pamuk' }, patients)).toHaveLength(0);
  });

  it('mikroçuksuz adaylar mikroçip sorgusuyla eşleşmez', () => {
    expect(findPatientDuplicates({ microchip: '985101000000009' }, patients)).toHaveLength(0);
  });
});
