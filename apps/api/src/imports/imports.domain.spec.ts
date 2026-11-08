import { describe, expect, it } from 'vitest';
import {
  buildTemplateCsv,
  matchOwner,
  matchPatient,
  matchProduct,
  normalizeChip,
  normalizeEmail,
  normalizePhone,
  parseCsv,
  parseGender,
  parseIsoDate,
  rowStatus,
  toTable,
  validateOwnerRow,
  validatePatientRow,
  validateProductRow,
} from './imports.domain';

describe('Faz 14 içe aktarma alan mantığı', () => {
  it('parseCsv: BOM, tırnak içi virgül, "" kaçışı, CRLF/LF', () => {
    const csv = '\uFEFFad,not\r\n"Ayşe","Merhaba, dünya"\r\n"Ali","Dedi ki ""tamam"""\r\n';
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(['ad', 'not']);
    expect(rows[1]).toEqual(['Ayşe', 'Merhaba, dünya']);
    expect(rows[2]![1]).toBe('Dedi ki "tamam"');
  });

  it('parseCsv: tırnak içi CRLF korunur', () => {
    const rows = parseCsv('a,b\r\n"x\r\ny",2\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['x\r\ny', '2']);
  });

  it('toTable: başlık-nesne eşlemesi', () => {
    const table = toTable(parseCsv('ad,soyad\nAy,Yılmaz'));
    expect(table.headers).toEqual(['ad', 'soyad']);
    expect(table.rows[0]).toEqual({ rowNumber: 2, values: { ad: 'Ay', soyad: 'Yılmaz' } });
  });

  it('normalizePhone: 05xx → 90xx, 10 rakam → 90...', () => {
    expect(normalizePhone('0532 123 45 67')).toBe('905321234567');
    expect(normalizePhone('5321234567')).toBe('905321234567');
    expect(normalizePhone('905321234567')).toBe('905321234567');
  });

  it('normalizeEmail/normalizeChip', () => {
    expect(normalizeEmail(' Ayse@Ornek.COM ')).toBe('ayse@ornek.com');
    expect(normalizeChip('900-123 ab')).toBe('900-123AB'.replace('-', ''));
  });

  it('parseGender + parseIsoDate', () => {
    expect(parseGender('Dişi')).toBe('female');
    expect(parseGender('erkek')).toBe('male');
    expect(parseGender('')).toBe('unknown');
    expect(parseIsoDate('2023-05-14')).not.toBeNull();
    expect(parseIsoDate('14.05.2023')).toBeNull();
  });

  it('validateOwnerRow: zorunlu alanlar + eposta/telefon en az biri', () => {
    const ok = validateOwnerRow({ rowNumber: 2, values: { ad: 'Ayşe', soyad: 'Yılmaz', eposta: 'a@b.com' } });
    expect(Object.keys(ok.errors)).toHaveLength(0);
    const missing = validateOwnerRow({ rowNumber: 3, values: { ad: '', soyad: 'X' } });
    expect(missing.errors['ad']).toBeDefined();
    expect(missing.errors['eposta']).toBeDefined();
    const badEmail = validateOwnerRow({ rowNumber: 4, values: { ad: 'A', soyad: 'B', eposta: 'geçersiz' } });
    expect(badEmail.errors['eposta']).toBeDefined();
  });

  it('validatePatientRow: hayvanAdi+tur zorunlu; tarih formatı', () => {
    const ok = validatePatientRow({
      rowNumber: 2,
      values: { hayvanAdi: 'Pamuk', tur: 'Kedi', sahipEposta: 'a@b.com', dogumTarihi: '2023-05-14' },
    });
    expect(Object.keys(ok.errors)).toHaveLength(0);
    const bad = validatePatientRow({ rowNumber: 3, values: { tur: 'Kedi', dogumTarihi: '2023/05/14' } });
    expect(bad.errors['hayvanAdi']).toBeDefined();
    expect(bad.errors['dogumTarihi']).toBeDefined();
  });

  it('validateProductRow: kod/ad/birim zorunlu; sayı alanları', () => {
    const ok = validateProductRow({ rowNumber: 2, values: { kod: 'U1', ad: 'İlaç', birim: 'adet', minStok: '5', satisFiyati: '49.90' } });
    expect(Object.keys(ok.errors)).toHaveLength(0);
    expect(ok.parsed['minStock']).toBe(5);
    const bad = validateProductRow({ rowNumber: 3, values: { ad: 'X', birim: 'adet', satisFiyati: '-3' } });
    expect(bad.errors['kod']).toBeDefined();
    expect(bad.errors['satisFiyati']).toBeDefined();
  });

  it('matchOwner: eposta veya telefon eşleşmesi; ad tek başına yeterli değil', () => {
    const pool = [
      {
        id: 'o1',
        firstName: 'Ayşe',
        lastName: 'Yılmaz',
        emails: ['ayse@ornek.com'],
        phones: ['905321234567'],
      },
    ];
    expect(matchOwner({ email: 'ayse@ornek.com', phone: null }, pool)).toBe('o1');
    expect(matchOwner({ email: null, phone: '905321234567' }, pool)).toBe('o1');
    expect(matchOwner({ email: 'baska@ornek.com', phone: null }, pool)).toBeNull();
    expect(matchOwner({ email: null, phone: null }, pool)).toBeNull();
  });

  it('matchPatient: mikroçip kesin; sahip+ad+tür ikincil', () => {
    const pool = [
      { id: 'p1', name: 'Pamuk', speciesName: 'Kedi', microchip: '900123', ownerId: 'o1' },
      { id: 'p2', name: 'Kar', speciesName: 'Köpek', microchip: null, ownerId: 'o2' },
    ];
    expect(matchPatient({ microchip: '900123', name: 'X', speciesName: 'Kedi', resolvedOwnerId: null }, pool)).toBe('p1');
    expect(
      matchPatient({ microchip: null, name: 'pamuk', speciesName: 'Kedi', resolvedOwnerId: 'o1' }, pool),
    ).toBe('p1');
    expect(matchPatient({ microchip: null, name: 'Pamuk', speciesName: 'Kedi', resolvedOwnerId: 'o2' }, pool)).toBeNull();
  });

  it('matchProduct: kod/barkod kesin; farklı ad aynı kod duplicate sayılır', () => {
    const pool = [{ id: 'u1', code: 'URN-1', barcode: '8690', name: 'Eski Ad' }];
    expect(matchProduct({ code: 'urn-1', barcode: null }, pool)).toBe('u1');
    expect(matchProduct({ code: 'URN-9', barcode: '8690' }, pool)).toBe('u1');
    expect(matchProduct({ code: 'URN-9', barcode: null }, pool)).toBeNull();
  });

  it('rowStatus: hata > duplicate > valid önceliği', () => {
    expect(rowStatus({ ad: 'zorunlu' }, null)).toBe('error');
    expect(rowStatus({}, 'id1')).toBe('duplicate');
    expect(rowStatus({}, null)).toBe('valid');
  });

  it('buildTemplateCsv: ürün şablonu başlıkları', () => {
    const csv = buildTemplateCsv('products').toString('utf8');
    expect(csv).toContain('kod,ad,kategori,birim');
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });
});
