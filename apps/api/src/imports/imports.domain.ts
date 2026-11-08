/**
 * İçe aktarma alan mantığı — Faz 14. Saf fonksiyonlar: RFC 4180 CSV çözümleyici
 * (BOM/CRLF/tırnak), sahip/hasta/ürün şablon tanımları, satır doğrulayıcılar ve
 * duplicate eşleştirme anahtarları. Prisma ve Nest bağımlılığı yoktur — birim
 * testlenebilir. Kritik kural: sessiz overwrite yok; duplicate satır açık
 * 'create'|'skip' kararı olmadan commit edilmez.
 */

// ─── CSV çözümleyici (RFC 4180) ─────────────────────────────────────────────

/**
 * CSV metnini satır dizilerine çözer: BOM temizliği, tırnak içi virgül/CR/LF,
 * "" kaçışı. Tek satırda state machine — büyük dosyada da O(n).
 */
export function parseCsv(text: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < clean.length) {
    const ch = clean[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Son satır: dosya CRLF ile bitmeyebilir
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Tamamen boş satırları at (trailing newline zaten satır üretmez)
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export interface ParsedCsvTable {
  headers: string[];
  rows: Array<{ rowNumber: number; values: Record<string, string> }>;
}

/** Başlık satırını nesne anahtarlarına eşler; boş başlık kolonlarını atar. */
export function toTable(rows: string[][]): ParsedCsvTable {
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0]!.map((h) => h.trim());
  const body = rows.slice(1);
  return {
    headers,
    rows: body.map((cells, idx) => {
      const values: Record<string, string> = {};
      headers.forEach((header, colIdx) => {
        if (header) values[header] = (cells[colIdx] ?? '').trim();
      });
      return { rowNumber: idx + 2, values };
    }),
  };
}

// ─── Şablon tanımları ───────────────────────────────────────────────────────

export type ImportKind = 'owners' | 'patients' | 'products';

export const IMPORT_KINDS: ImportKind[] = ['owners', 'patients', 'products'];

export interface TemplateColumn {
  name: string;
  required: boolean;
  example: string;
  description: string;
}

export interface ImportTemplate {
  kind: ImportKind;
  columns: TemplateColumn[];
}

export const IMPORT_TEMPLATES: Record<ImportKind, ImportTemplate> = {
  owners: {
    kind: 'owners',
    columns: [
      { name: 'ad', required: true, example: 'Ayşe', description: 'Sahip adı (zorunlu)' },
      { name: 'soyad', required: true, example: 'Yılmaz', description: 'Sahip soyadı (zorunlu)' },
      { name: 'eposta', required: false, example: 'ayse@ornek.com', description: 'E-posta (telefon ile en az biri dolu)' },
      { name: 'telefon', required: false, example: '05321234567', description: 'Telefon — yalnız rakam; 90… normalize edilir' },
      { name: 'adres', required: false, example: 'Kadıköy/İstanbul', description: 'Adres' },
      { name: 'tcKimlikNo', required: false, example: '', description: 'TC kimlik no (opsiyonel, KVKK)' },
      { name: 'notlar', required: false, example: '', description: 'Not' },
    ],
  },
  patients: {
    kind: 'patients',
    columns: [
      { name: 'sahipEposta', required: false, example: 'ayse@ornek.com', description: 'Sahip e-posta (sahipTelefon ile en az biri dolu)' },
      { name: 'sahipTelefon', required: false, example: '05321234567', description: 'Sahip telefon' },
      { name: 'hayvanAdi', required: true, example: 'Pamuk', description: 'Hasta adı (zorunlu)' },
      { name: 'tur', required: true, example: 'Kedi', description: 'Tür adı — katalogda olmalı (zorunlu)' },
      { name: 'irk', required: false, example: 'Tekir', description: 'Irk adı — türe bağlı katalogda olmalı' },
      { name: 'cinsiyet', required: false, example: 'disi', description: 'disi | erkek | bilinmiyor' },
      { name: 'dogumTarihi', required: false, example: '2023-05-14', description: 'ISO tarih (YYYY-MM-DD)' },
      { name: 'mikrochip', required: false, example: '900123000123456', description: 'Mikroçip — klinikte tekil' },
    ],
  },
  products: {
    kind: 'products',
    columns: [
      { name: 'kod', required: true, example: 'URN-0001', description: 'Ürün kodu — klinikte tekil (zorunlu)' },
      { name: 'ad', required: true, example: 'Amoksisilin 250mg', description: 'Ürün adı (zorunlu)' },
      { name: 'kategori', required: false, example: 'İlaç', description: 'Kategori adı — katalogda olmalı' },
      { name: 'birim', required: true, example: 'adet', description: 'Baz birim anahtarı — katalogda olmalı (zorunlu)' },
      { name: 'takipTipi', required: false, example: 'lot', description: 'lot | none (varsayılan lot)' },
      { name: 'barKod', required: false, example: '8690000000000', description: 'Barkod' },
      { name: 'minStok', required: false, example: '10', description: 'Minimum stok eşiği' },
      { name: 'satisFiyati', required: false, example: '149.90', description: 'Referans satış fiyatı — nokta ondalık' },
    ],
  },
};

/** Şablon CSV'i üretir: başlık + örnek satır (UTF-8 BOM'lu). */
export function buildTemplateCsv(kind: ImportKind): Buffer {
  const template = IMPORT_TEMPLATES[kind];
  const header = template.columns.map((c) => c.name).join(',');
  const example = template.columns.map((c) =>
    c.example === '' ? '' : /[",\n]/.test(c.example) ? `"${c.example.replace(/"/g, '""')}"` : c.example,
  );
  return Buffer.from(`\uFEFF${header}\r\n${example.join(',')}\r\n`, 'utf8');
}

// ─── Normalizasyon ve eşleştirme ────────────────────────────────────────────

/** E-posta normalize: trim + küçük harf. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Telefon normalize: yalnız rakam; başında 0 varsa 90 ekle (TR). */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `90${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `90${digits.slice(1)}`;
  return digits;
}

/** Mikroçip normalize: büyük harf + rakam dışını at. */
export function normalizeChip(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function parseGender(value: string): 'female' | 'male' | 'unknown' {
  const v = value.trim().toLowerCase();
  if (['disi', 'dişi', 'female', 'f'].includes(v)) return 'female';
  if (['erkek', 'male', 'm'].includes(v)) return 'male';
  return 'unknown';
}

export function parseTrackingType(value: string): 'lot' | 'none' {
  return value.trim().toLowerCase() === 'none' ? 'none' : 'lot';
}

/** ISO tarih; geçersizse null (validator hata üretir). */
export function parseIsoDate(value: string): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Nokta ondalık pozitif sayı; geçersizse null. */
export function parseDecimal(value: string): number | null {
  if (value === '') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// ─── Satır doğrulama ────────────────────────────────────────────────────────

export type RowErrors = Record<string, string>;

export interface ValidatedRow {
  rowNumber: number;
  values: Record<string, string>;
  errors: RowErrors;
  /** Doğrulanmış türetilmiş değerler (servis kayıt yazımında kullanır) */
  parsed: Record<string, unknown>;
}

function requireText(values: Record<string, string>, field: string, errors: RowErrors): string {
  const value = (values[field] ?? '').trim();
  if (!value) errors[field] = 'zorunlu alan';
  return value;
}

/** Sahip satırı doğrulama — ad/soyad zorunlu; eposta/telefon en az biri. */
export function validateOwnerRow(row: { rowNumber: number; values: Record<string, string> }): ValidatedRow {
  const errors: RowErrors = {};
  const firstName = requireText(row.values, 'ad', errors);
  const lastName = requireText(row.values, 'soyad', errors);
  const emailRaw = (row.values['eposta'] ?? '').trim();
  const phoneRaw = (row.values['telefon'] ?? '').trim();
  if (!emailRaw && !phoneRaw) {
    errors['eposta'] = 'eposta veya telefon en az biri dolu olmalı';
  }
  let email: string | null = null;
  if (emailRaw) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw)) {
      errors['eposta'] = 'geçerli bir e-posta değil';
    } else {
      email = normalizeEmail(emailRaw);
    }
  }
  let phone: string | null = null;
  if (phoneRaw) {
    const digits = phoneRaw.replace(/\D/g, '');
    if (digits.length < 10) {
      errors['telefon'] = 'telefon en az 10 rakam olmalı';
    } else {
      phone = normalizePhone(phoneRaw);
    }
  }
  return {
    rowNumber: row.rowNumber,
    values: row.values,
    errors,
    parsed: {
      firstName,
      lastName,
      email,
      phone,
      address: (row.values['adres'] ?? '').trim() || null,
      identityNo: (row.values['tcKimlikNo'] ?? '').trim() || null,
      notes: (row.values['notlar'] ?? '').trim() || null,
    },
  };
}

/** Hasta satırı doğrulama — hayvanAdi+tur zorunlu; sahip eposta/telefon en az biri. */
export function validatePatientRow(row: { rowNumber: number; values: Record<string, string> }): ValidatedRow {
  const errors: RowErrors = {};
  requireText(row.values, 'hayvanAdi', errors);
  requireText(row.values, 'tur', errors);
  const emailRaw = (row.values['sahipEposta'] ?? '').trim();
  const phoneRaw = (row.values['sahipTelefon'] ?? '').trim();
  if (!emailRaw && !phoneRaw) {
    errors['sahipEposta'] = 'sahipEposta veya sahipTelefon en az biri dolu olmalı';
  }
  let ownerEmail: string | null = null;
  if (emailRaw) ownerEmail = normalizeEmail(emailRaw);
  let ownerPhone: string | null = null;
  if (phoneRaw) ownerPhone = normalizePhone(phoneRaw);
  let birthDate: Date | null = null;
  const birthRaw = (row.values['dogumTarihi'] ?? '').trim();
  if (birthRaw) {
    birthDate = parseIsoDate(birthRaw);
    if (!birthDate) errors['dogumTarihi'] = 'tarih YYYY-MM-DD olmalı';
  }
  const chipRaw = (row.values['mikrochip'] ?? '').trim();
  return {
    rowNumber: row.rowNumber,
    values: row.values,
    errors,
    parsed: {
      name: row.values['hayvanAdi']?.trim() ?? '',
      speciesName: row.values['tur']?.trim() ?? '',
      breedName: (row.values['irk'] ?? '').trim() || null,
      ownerEmail,
      ownerPhone,
      gender: parseGender(row.values['cinsiyet'] ?? ''),
      birthDate,
      microchip: chipRaw ? normalizeChip(chipRaw) : null,
    },
  };
}

/** Ürün satırı doğrulama — kod/ad/birim zorunlu; fiyat/miktar sayı. */
export function validateProductRow(row: { rowNumber: number; values: Record<string, string> }): ValidatedRow {
  const errors: RowErrors = {};
  const code = requireText(row.values, 'kod', errors);
  const name = requireText(row.values, 'ad', errors);
  requireText(row.values, 'birim', errors);
  let minStock = 0;
  const minRaw = (row.values['minStok'] ?? '').trim();
  if (minRaw) {
    const parsed = parseDecimal(minRaw);
    if (parsed === null || parsed < 0) errors['minStok'] = 'negatif olmayan sayı olmalı';
    else minStock = parsed;
  }
  let salePrice: number | null = null;
  const priceRaw = (row.values['satisFiyati'] ?? '').trim();
  if (priceRaw) {
    const parsed = parseDecimal(priceRaw);
    if (parsed === null || parsed < 0) errors['satisFiyati'] = 'negatif olmayan sayı olmalı';
    else salePrice = parsed;
  }
  return {
    rowNumber: row.rowNumber,
    values: row.values,
    errors,
    parsed: {
      code,
      name,
      categoryName: (row.values['kategori'] ?? '').trim() || null,
      unitKey: row.values['birim']?.trim().toLowerCase() ?? '',
      trackingType: parseTrackingType(row.values['takipTipi'] ?? ''),
      barcode: (row.values['barKod'] ?? '').trim() || null,
      minStock,
      defaultSalePrice: salePrice,
    },
  };
}

// ─── Duplicate eşleştirme (kayıt havuzu üzerinde) ───────────────────────────

export interface OwnerMatchInput {
  id: string;
  firstName: string;
  lastName: string;
  emails: string[];
  phones: string[];
}

/**
 * Sahip duplicate kuralı: normalize eposta VEYA telefon eşleşmesi kesin
 * duplicate sayılır (kanıt güçlü). Ad+soyad tek başına eşleşme üretmez —
 * yanlış pozitifleri önler.
 */
export function matchOwner(
  parsed: { email: string | null; phone: string | null },
  pool: OwnerMatchInput[],
): string | null {
  for (const candidate of pool) {
    if (parsed.email && candidate.emails.includes(parsed.email)) return candidate.id;
    if (parsed.phone && candidate.phones.includes(parsed.phone)) return candidate.id;
  }
  return null;
}

export interface PatientMatchInput {
  id: string;
  name: string;
  speciesName: string;
  microchip: string | null;
  ownerId: string;
}

/**
 * Hasta duplicate kuralı: mikroçip eşleşmesi kesin; yoksa aynı sahibe kayıtlı
 * aynı ad+tür eşleşmesi duplicate sayılır.
 */
export function matchPatient(
  parsed: {
    microchip: string | null;
    name: string;
    speciesName: string;
    resolvedOwnerId: string | null;
  },
  pool: PatientMatchInput[],
): string | null {
  if (parsed.microchip) {
    const byChip = pool.find((candidate) => candidate.microchip === parsed.microchip);
    if (byChip) return byChip.id;
  }
  if (parsed.resolvedOwnerId) {
    const byIdentity = pool.find(
      (candidate) =>
        candidate.ownerId === parsed.resolvedOwnerId &&
        candidate.name.toLocaleLowerCase('tr') === parsed.name.toLocaleLowerCase('tr') &&
        candidate.speciesName === parsed.speciesName,
    );
    if (byIdentity) return byIdentity.id;
  }
  return null;
}

export interface ProductMatchInput {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
}

/** Ürün duplicate kuralı: kod kesin; barkod kesin; ad tek başına yeterli değil. */
export function matchProduct(parsed: { code: string; barcode: string | null }, pool: ProductMatchInput[]): string | null {
  const byCode = pool.find((candidate) => candidate.code.toLowerCase() === parsed.code.toLowerCase());
  if (byCode) return byCode.id;
  if (parsed.barcode) {
    const byBarcode = pool.find((candidate) => candidate.barcode === parsed.barcode);
    if (byBarcode) return byBarcode.id;
  }
  return null;
}

/** Satır durumları — preview UI'ın rozetleri bu üç değerle çalışır. */
export type RowStatus = 'valid' | 'error' | 'duplicate';

export function rowStatus(errors: RowErrors, matchedId: string | null): RowStatus {
  if (Object.keys(errors).length > 0) return 'error';
  if (matchedId) return 'duplicate';
  return 'valid';
}

/** Çözüm değerleri — duplicate satır için yalnız create/skip geçerli. */
export function isValidResolution(value: string): value is 'create' | 'skip' {
  return value === 'create' || value === 'skip';
}

/** Import iş adı → dosya adı: sahipler-sablon.csv */
export function templateFileName(kind: ImportKind): string {
  const names: Record<ImportKind, string> = {
    owners: 'sahipler-sablon.csv',
    patients: 'hastalar-sablon.csv',
    products: 'urunler-sablon.csv',
  };
  return names[kind];
}
