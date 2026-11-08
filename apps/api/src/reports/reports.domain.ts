/**
 * Rapor alan mantığı — Faz 14. Saf fonksiyonlar: rapor kataloğu, yaşlandırma
 * kovaları, gelir gruplaması, doluluk ve turnaround hesapları; tablo modeli;
 * CSV (RFC 4180 + UTF-8 BOM) ve XLSX (minimal ZIP, store) üretimi. Prisma
 * sorguları service'tedir; buradaki her şey birim testlenebilirdir.
 *
 * Sayı/süre biçimi kararları (kabul kriteri: "sayı formatı doğru olmalı"):
 * - CSV: makine okunabilirliği için ondalık AYIRICI NOKTA (ISO), binlik ayraç
 *   yok; dosya başına UTF-8 BOM (\uFEFF) — Excel Türkçe karakteri BOM'suz
 *   yanlış kodlar (kabul kriteri: UTF-8/Türkçe karakter).
 * - XLSX: money hücreleri gerçek sayı hücresi (n) — görüntüleme yerel ayarı
 *   Excel'e kalır; metin hücreleri inlineStr; Türkçe başlıklar UTF-8 XML.
 * - PDF: tr-TR görüntüleme biçimi (1.234,56) — insan okur raporu.
 */

export type ReportColumn = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'money' | 'date';
};

export type ReportCellValue = string | number | null;

export interface ReportTable {
  key: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCellValue>[];
  /** Toplam satırı gösterilecek kolonlar (money/number) */
  totalColumns?: string[];
}

export type ReportFormat = 'csv' | 'xlsx' | 'pdf';

/** Rapor kataloğu — UI ve servis aynı listeyi kullanır. */
export const REPORT_CATALOG = [
  { key: 'gelir', title: 'Gelir Raporu', description: 'Günlük/aylık tahsilat, iade ve net gelir', periodParam: true },
  { key: 'borc-yaslandirma', title: 'Borç Yaşlandırma', description: 'Açık ücretlerin 0-30/31-60/61-90/90+ gün kovaları', periodParam: false },
  { key: 'hizmet-dagilimi', title: 'Hizmet Dağılımı', description: 'Hizmet başına adet ve ciro', periodParam: false },
  { key: 'hekim-is-yuku', title: 'Hekim İş Yükü', description: 'Hekim başına muayene, cerrahi, lab, yatış, reçete', periodParam: false },
  { key: 'asi-takip', title: 'Aşı Takip', description: 'Uygulanan aşılar, yaklaşan ve gecikmiş hatırlatmalar', periodParam: false },
  { key: 'stok-deger-skt', title: 'Stok Değer / SKT', description: 'Depo değeri ve son kullanma tarihi kovaları', periodParam: false },
  { key: 'urun-tuketim', title: 'Ürün Tüketim', description: 'Tüketim hareketlerinin ürün bazında miktar/maliyet', periodParam: false },
  { key: 'tedarik-satinalma', title: 'Tedarik Satın Alma', description: 'Mal kabulün tedarikçi bazında miktar/maliyet', periodParam: false },
  { key: 'lab-turnaround', title: 'Lab Turnaround', description: 'Sipariş→sonuç süreleri, test bazında ortalama', periodParam: false },
  { key: 'yatis-doluluk', title: 'Yatış Doluluk', description: 'Kennel doluluk oranı ve hasta-gün', periodParam: false },
] as const;

export type ReportKey = (typeof REPORT_CATALOG)[number]['key'];

export function isReportKey(key: string): key is ReportKey {
  return REPORT_CATALOG.some((r) => r.key === key);
}

// ─── Biçimlendiriciler ───────────────────────────────────────────────────────

/** tr-TR para metni: 1.234,56 (PDF/web görüntüsü) */
export function formatTrMoney(value: number): string {
  const fixed = Math.abs(value).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const grouped = (intPart ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}${grouped},${decPart ?? '00'}`;
}

/** CSV hücresi: money → "1234.56" (ISO, nokta), number → düz metin */
export function csvCell(value: ReportCellValue, type: ReportColumn['type']): string {
  if (value === null || value === undefined) return '';
  if (type === 'money') return Number(value).toFixed(2);
  if (type === 'date') return String(value);
  if (typeof value === 'number') return String(value);
  // RFC 4180: çift tırnak ve ayraç güvenli kaçırtma
  const text = String(value);
  if (/[",\r\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** CSV üretimi — UTF-8 BOM + ayraç virgül + CRLF satırı (RFC 4180). */
export function buildCsv(table: ReportTable): Buffer {
  const lines: string[] = [];
  lines.push(table.columns.map((c) => csvCell(c.label, 'text')).join(','));
  for (const row of table.rows) {
    lines.push(table.columns.map((c) => csvCell(row[c.key] ?? null, c.type)).join(','));
  }
  if (table.totalColumns && table.totalColumns.length > 0 && table.rows.length > 0) {
    const totalCells = table.columns.map((c, idx) => {
      if (idx === 0) return csvCell('TOPLAM', 'text');
      if (table.totalColumns?.includes(c.key)) {
        const sum = table.rows.reduce(
          (acc, row) => acc + (typeof row[c.key] === 'number' ? (row[c.key] as number) : 0),
          0,
        );
        return csvCell(sum, c.type);
      }
      return '';
    });
    lines.push(totalCells.join(','));
  }
  // \uFEFF BOM: Excel'in UTF-8'i Türkçe gliflerle doğru çözmesi için
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

// ─── Minimal ZIP (store) — XLSX kapsayıcısı ─────────────────────────────────

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.byteLength; i++) {
    const byte = buf[i] ?? 0;
    crc = (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS tarih/saat (ZIP 2-sn çözünürlük, 1980 tabanlı). */
export function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getUTCFullYear(), 1980);
  const time =
    (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (Math.floor(date.getUTCSeconds() / 2) & 0x1f);
  const dateVal = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, date: dateVal };
}

export interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Sıkıştırmasız (store) ZIP üretimi — XLSX kapsayıcısı için yeterli ve
 * bağımlılıksız. UTF-8 ad bayrağı (bit 11) açıktır; python zipfile/Excel okur.
 */
export function buildZip(entries: ZipEntry[], when = new Date()): Buffer {
  const { time, date } = dosDateTime(when);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const size = entry.data.byteLength;

    const local = Buffer.alloc(30 + nameBytes.byteLength);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 flag
    local.writeUInt16LE(0, 8); // store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.byteLength, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);
    locals.push(local, entry.data);

    const central = Buffer.alloc(46 + nameBytes.byteLength);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBytes.byteLength, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);

    offset += local.byteLength + size;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colLetter(index: number): string {
  let s = '';
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function sheetXml(table: ReportTable): string {
  const rowsXml: string[] = [];
  // Başlık satırı (satır 1)
  const headerCells = table.columns
    .map((c, i) => `<c r="${colLetter(i)}1" t="inlineStr"><is><t>${xmlEscape(c.label)}</t></is></c>`)
    .join('');
  rowsXml.push(`<row r="1">${headerCells}</row>`);
  // Veri satırları
  table.rows.forEach((row, rowIdx) => {
    const cells = table.columns
      .map((c, colIdx) => {
        const ref = `${colLetter(colIdx)}${rowIdx + 2}`;
        const value = row[c.key] ?? null;
        if (value === null || value === undefined) return '';
        if (c.type === 'money' || c.type === 'number') {
          const num = typeof value === 'number' ? value : Number(value);
          if (Number.isFinite(num)) return `<c r="${ref}" t="n"><v>${num}</v></c>`;
        }
        return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(String(value))}</t></is></c>`;
      })
      .join('');
    rowsXml.push(`<row r="${rowIdx + 2}">${cells}</row>`);
  });
  // Toplam satırı
  if (table.totalColumns && table.totalColumns.length > 0 && table.rows.length > 0) {
    const rowIdx = table.rows.length + 2;
    const cells = table.columns
      .map((c, colIdx) => {
        const ref = `${colLetter(colIdx)}${rowIdx}`;
        if (colIdx === 0) return `<c r="${ref}" t="inlineStr"><is><t>TOPLAM</t></is></c>`;
        if (table.totalColumns?.includes(c.key)) {
          const sum = table.rows.reduce(
            (acc, row) => acc + (typeof row[c.key] === 'number' ? (row[c.key] as number) : 0),
            0,
          );
          return `<c r="${ref}" t="n"><v>${sum}</v></c>`;
        }
        return '';
      })
      .join('');
    rowsXml.push(`<row r="${rowIdx}">${cells}</row>`);
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml.join('')}</sheetData></worksheet>`;
}

/** XLSX üretimi — bağımlılıksız minimal OOXML (store ZIP). */
export function buildXlsx(table: ReportTable): Buffer {
  const sheetName = xmlEscape(table.title.replace(/[[\]:*?/\\]/g, ' ')).slice(0, 31) || 'Rapor';
  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
        'utf8',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        'utf8',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        'utf8',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
        'utf8',
      ),
    },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml(table), 'utf8') },
  ];
  return buildZip(entries);
}

// ─── Rapor hesapları (saf) ──────────────────────────────────────────────────

export const AGING_BUCKETS = [
  { key: 'b0-30', label: '0-30 gün', minDays: 0, maxDays: 30 },
  { key: 'b31-60', label: '31-60 gün', minDays: 31, maxDays: 60 },
  { key: 'b61-90', label: '61-90 gün', minDays: 61, maxDays: 90 },
  { key: 'b90+', label: '90+ gün', minDays: 91, maxDays: Number.POSITIVE_INFINITY },
] as const;

/** Ücret yaşına göre kova anahtarı (referans gününe göre tam gün farkı). */
export function agingBucketKey(createdAt: Date, reference: Date): string {
  const days = Math.floor((reference.getTime() - createdAt.getTime()) / 86_400_000);
  if (days < 0) return 'b0-30'; // geleceğe düşen kayıt (saat dilimi kenarı) genç kovada
  const bucket = AGING_BUCKETS.find((b) => days >= b.minDays && days <= b.maxDays);
  return bucket ? bucket.key : 'b90+';
}

/** Yaşlandırma satırlarını kova sırasına dizer; boş kovalar 0 ile gelir. */
export function buildAgingTable(
  items: Array<{ createdAt: Date; remaining: number }>,
  reference: Date,
): ReportTable {
  const buckets = new Map<string, { bucket: string; count: number; amount: number }>(
    AGING_BUCKETS.map((b) => [b.key, { bucket: b.label, count: 0, amount: 0 }]),
  );
  for (const item of items) {
    const key = agingBucketKey(item.createdAt, reference);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.amount += item.remaining;
    }
  }
  return {
    key: 'borc-yaslandirma',
    title: 'Borç Yaşlandırma',
    columns: [
      { key: 'bucket', label: 'Yaş Aralığı', type: 'text' },
      { key: 'count', label: 'Ücret Adedi', type: 'number' },
      { key: 'amount', label: 'Kalan Tutar', type: 'money' },
    ],
    rows: AGING_BUCKETS.map((b) => {
      const row = buckets.get(b.key);
      return { bucket: row?.bucket ?? b.label, count: row?.count ?? 0, amount: round2(row?.amount ?? 0) };
    }),
    totalColumns: ['count', 'amount'],
  };
}

/** Sayıyı 2 basamağa yuvarlar (Decimal toplamlarının kuyruk hatasına karşı). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface RevenuePeriodRow {
  period: string;
  payments: number;
  refunds: number;
  expenses: number;
}

/** Gelir satırlarından net kolonu ekleyip toplamları hazırlar. */
export function buildRevenueTable(period: 'daily' | 'monthly', rows: RevenuePeriodRow[]): ReportTable {
  const labeled = rows.map((r) => ({
    ...r,
    net: round2(r.payments - r.refunds - r.expenses),
  }));
  return {
    key: 'gelir',
    title: period === 'daily' ? 'Günlük Gelir' : 'Aylık Gelir',
    columns: [
      { key: 'period', label: period === 'daily' ? 'Gün' : 'Ay', type: 'date' },
      { key: 'payments', label: 'Tahsilat', type: 'money' },
      { key: 'refunds', label: 'İade', type: 'money' },
      { key: 'expenses', label: 'Gider', type: 'money' },
      { key: 'net', label: 'Net', type: 'money' },
    ],
    rows: labeled,
    totalColumns: ['payments', 'refunds', 'expenses', 'net'],
  };
}

/** Gün anahtarı: Europe/Istanbul günü (+03 sabit; TR 2016'dan beri yaz saati yok). */
export function istanbulDayKey(date: Date): string {
  const shifted = new Date(date.getTime() + 3 * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

export function istanbulMonthKey(date: Date): string {
  return istanbulDayKey(date).slice(0, 7);
}

export function groupRevenueByPeriod(
  payments: Array<{ amount: number; createdAt: Date }>,
  refunds: Array<{ amount: number; createdAt: Date }>,
  expenses: Array<{ amount: number; paidAt: Date }>,
  period: 'daily' | 'monthly',
): RevenuePeriodRow[] {
  const map = new Map<string, RevenuePeriodRow>();
  const keyOf = period === 'daily' ? istanbulDayKey : istanbulMonthKey;
  const touch = (key: string): RevenuePeriodRow => {
    let row = map.get(key);
    if (!row) {
      row = { period: key, payments: 0, refunds: 0, expenses: 0 };
      map.set(key, row);
    }
    return row;
  };
  for (const p of payments) touch(keyOf(p.createdAt)).payments += p.amount;
  for (const r of refunds) touch(keyOf(r.createdAt)).refunds += r.amount;
  for (const e of expenses) touch(keyOf(e.paidAt)).expenses += e.amount;
  return [...map.keys()]
    .sort()
    .map((k) => {
      const row = map.get(k);
      return {
        period: k,
        payments: round2(row?.payments ?? 0),
        refunds: round2(row?.refunds ?? 0),
        expenses: round2(row?.expenses ?? 0),
      };
    });
}

export interface TurnaroundItem {
  orderedAt: Date;
  completedAt: Date | null;
}

/** Sipariş→sonuç saat cinsinden süre; tamamlanmamışlar hariç. */
export function turnaroundHours(item: TurnaroundItem): number | null {
  if (!item.completedAt) return null;
  const hours = (item.completedAt.getTime() - item.orderedAt.getTime()) / 3_600_000;
  return hours >= 0 ? round2(hours * 100) / 100 : null;
}

/** Ortalama + en hızlı/en yavaş; boş liste 0 ortalama döner. */
export function turnaroundSummary(items: TurnaroundItem[]): {
  count: number;
  avgHours: number;
  minHours: number;
  maxHours: number;
} {
  const hours = items.map(turnaroundHours).filter((h): h is number => h !== null);
  if (hours.length === 0) return { count: 0, avgHours: 0, minHours: 0, maxHours: 0 };
  const sum = hours.reduce((a, b) => a + b, 0);
  return {
    count: hours.length,
    avgHours: round2((sum / hours.length) * 100) / 100,
    minHours: round2(Math.min(...hours)),
    maxHours: round2(Math.max(...hours)),
  };
}

export interface OccupancyInput {
  /** Yatış aralıkları (kennel bazında; devamedenler rangeEnd ile kapatılır) */
  stays: Array<{ kennelId: string; admittedAt: Date; dischargedAt: Date | null }>;
  kennelCount: number;
  rangeStart: Date;
  rangeEnd: Date;
}

/**
 * Doluluk: seçili aralıkta kennel-gün cinsinden kapladığı gün / (kennel sayısı ×
 * gün sayısı). Kısmi günler tam gün sayılır (klinik pratiği).
 */
export function occupancyRate(input: OccupancyInput): {
  kennelDays: number;
  capacityDays: number;
  rate: number;
} {
  const totalDays = Math.max(
    1,
    Math.ceil((input.rangeEnd.getTime() - input.rangeStart.getTime()) / 86_400_000),
  );
  const capacityDays = input.kennelCount * totalDays;
  let kennelDays = 0;
  for (const stay of input.stays) {
    const start = stay.admittedAt > input.rangeStart ? stay.admittedAt : input.rangeStart;
    const end = stay.dischargedAt
      ? stay.dischargedAt < input.rangeEnd
        ? stay.dischargedAt
        : input.rangeEnd
      : input.rangeEnd;
    if (end <= start) continue;
    kennelDays += Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
  }
  const rate = capacityDays > 0 ? round2((kennelDays / capacityDays) * 100) : 0;
  return { kennelDays, capacityDays, rate };
}

/** SKT kovaları: süresi geçmiş / ≤30 gün / 31-90 / >90 gün / partisiz. */
export const EXPIRY_BUCKETS = ['expired', 'd0-30', 'd31-90', 'd90+', 'none'] as const;

export type ExpiryBucketKey = (typeof EXPIRY_BUCKETS)[number];

export function expiryBucketKey(expiresAt: Date | null, reference: Date): ExpiryBucketKey {
  if (!expiresAt) return 'none';
  const days = Math.ceil((expiresAt.getTime() - reference.getTime()) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'd0-30';
  if (days <= 90) return 'd31-90';
  return 'd90+';
}

export const EXPIRY_LABELS: Record<ExpiryBucketKey, string> = {
  expired: 'Süresi Geçmiş',
  'd0-30': '≤ 30 gün',
  'd31-90': '31-90 gün',
  'd90+': '> 90 gün',
  none: 'Partisiz',
};

/** Money çıktı normalizasyonu — Decimal → 2 basamak sayı (Faz 09 kararı). */
export function money(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return round2(Number.isFinite(n) ? n : 0);
}

/** Export dosya adı: <rapor>-<yyyyMMdd-HHmm>.<uzantı> (ASCII güvenli). */
export function exportFileName(reportKey: string, format: ReportFormat, when = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${when.getUTCFullYear()}${pad(when.getUTCMonth() + 1)}${pad(when.getUTCDate())}-${pad(when.getUTCHours())}${pad(when.getUTCMinutes())}`;
  return `${reportKey}-${stamp}.${format}`;
}

/** PDF tablo bölümü — ReportTable'dan metin hücreli DocSection'a. */
export function reportTableToPdfSection(table: ReportTable): {
  type: 'table';
  title?: string;
  columns: string[];
  widths: number[];
  rows: string[][];
} {
  const n = table.columns.length;
  const width = 1 / n;
  const rows = table.rows.map((row) =>
    table.columns.map((c) => {
      const value = row[c.key] ?? null;
      if (value === null) return '';
      if (c.type === 'money') return formatTrMoney(typeof value === 'number' ? value : Number(value));
      return String(value);
    }),
  );
  if (table.totalColumns && table.totalColumns.length > 0 && table.rows.length > 0) {
    rows.push(
      table.columns.map((c, idx) => {
        if (idx === 0) return 'TOPLAM';
        if (table.totalColumns?.includes(c.key)) {
          const sum = table.rows.reduce(
            (acc, row) => acc + (typeof row[c.key] === 'number' ? (row[c.key] as number) : 0),
            0,
          );
          return formatTrMoney(sum);
        }
        return '';
      }),
    );
  }
  return {
    type: 'table',
    title: table.title,
    columns: table.columns.map((c) => c.label),
    widths: table.columns.map(() => width),
    rows,
  };
}
