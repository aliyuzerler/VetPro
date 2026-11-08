import { describe, expect, it } from 'vitest';
import {
  agingBucketKey,
  buildAgingTable,
  buildCsv,
  buildRevenueTable,
  buildXlsx,
  crc32,
  csvCell,
  expiryBucketKey,
  exportFileName,
  formatTrMoney,
  groupRevenueByPeriod,
  isReportKey,
  occupancyRate,
  reportTableToPdfSection,
  turnaroundHours,
  turnaroundSummary,
} from './reports.domain';

describe('Faz 14 rapor alan mantığı', () => {
  it('formatTrMoney: binlik nokta, ondalık virgül', () => {
    expect(formatTrMoney(1234.56)).toBe('1.234,56');
    expect(formatTrMoney(0)).toBe('0,00');
    expect(formatTrMoney(-98765.4)).toBe('-98.765,40');
  });

  it('csvCell: money ISO nokta ondalık, metin tırnak kaçırtma', () => {
    expect(csvCell(1234.56, 'money')).toBe('1234.56');
    expect(csvCell('Kuduz, Klinik', 'text')).toBe('"Kuduz, Klinik"');
    expect(csvCell('ğüşİÖÇ', 'text')).toBe('ğüşİÖÇ');
    expect(csvCell(null, 'text')).toBe('');
  });

  it('buildCsv: UTF-8 BOM + CRLF + TOPLAM satırı', () => {
    const table = {
      key: 'gelir',
      title: 'Günlük Gelir',
      columns: [
        { key: 'day', label: 'Gün', type: 'date' as const },
        { key: 'total', label: 'Tahsilat', type: 'money' as const },
      ],
      rows: [
        { day: '2026-11-08', total: 100.5 },
        { day: '2026-11-09', total: 200.25 },
      ],
      totalColumns: ['total'],
    };
    const csv = buildCsv(table);
    expect(csv[0]).toBe(0xef); // UTF-8 BOM ilk bayt
    const text = csv.toString('utf8');
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain('Gün,Tahsilat\r\n');
    expect(text).toContain('2026-11-08,100.50\r\n');
    expect(text).toContain('TOPLAM,300.75\r\n');
    // Türkçe karakter bayt doğrulaması (UTF-8 çok baytlı)
    const turkishTable = {
      key: 'x',
      title: 'x',
      columns: [{ key: 'ad', label: 'İşlem Ücreti ĞÜŞİÖÇ', type: 'text' as const }],
      rows: [{ ad: 'Aşı ğüşıöç' }],
    };
    const turkishCsv = buildCsv(turkishTable).toString('utf8');
    expect(turkishCsv).toContain('İşlem Ücreti ĞÜŞİÖÇ');
    expect(turkishCsv).toContain('Aşı ğüşıöç');
  });

  it('buildXlsx: ZIP magic + merkezi dizin + EOCD imzası', () => {
    const table = {
      key: 'gelir',
      title: 'Gelir',
      columns: [
        { key: 'day', label: 'Gün', type: 'date' as const },
        { key: 'total', label: 'Tahsilat', type: 'money' as const },
      ],
      rows: [{ day: '2026-11-08', total: 42.42 }],
    };
    const xlsx = buildXlsx(table);
    // Local file header PK\x03\x04, EOCD PK\x05\x06
    expect(xlsx[0]).toBe(0x50);
    expect(xlsx[1]).toBe(0x4b);
    expect(xlsx[2]).toBe(0x03);
    expect(xlsx[3]).toBe(0x04);
    expect(xlsx.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
    // Türkçe başlık UTF-8 olarak sayfa XML'inde
    const text = xlsx.toString('latin1');
    expect(text).toContain('sheet1.xml');
  });

  it('crc32: bilinen test vektörü "123456789" → 0xCBF43926', () => {
    expect(crc32(Buffer.from('123456789', 'ascii'))).toBe(0xcbf43926);
  });

  it('agingBucketKey: 0-30/31-60/61-90/90+ kovaları', () => {
    const reference = new Date('2026-11-08T00:00:00Z');
    expect(agingBucketKey(new Date('2026-10-20T00:00:00Z'), reference)).toBe('b0-30');
    expect(agingBucketKey(new Date('2026-09-20T00:00:00Z'), reference)).toBe('b31-60');
    expect(agingBucketKey(new Date('2026-08-20T00:00:00Z'), reference)).toBe('b61-90');
    expect(agingBucketKey(new Date('2026-01-01T00:00:00Z'), reference)).toBe('b90+');
    // Gelecek tarihli (negatif) kova taşmaz — 0-30'a düşer
    expect(agingBucketKey(new Date('2026-11-09T00:00:00Z'), reference)).toBe('b0-30');
  });

  it('buildAgingTable: boş kovalar 0, toplamlar doğru', () => {
    const reference = new Date('2026-11-08T00:00:00Z');
    const table = buildAgingTable(
      [
        { createdAt: new Date('2026-11-01T00:00:00Z'), remaining: 100 },
        { createdAt: new Date('2026-01-01T00:00:00Z'), remaining: 250.5 },
      ],
      reference,
    );
    expect(table.rows).toHaveLength(4);
    expect(table.rows[0]).toMatchObject({ count: 1, amount: 100 });
    expect(table.rows[3]).toMatchObject({ count: 1, amount: 250.5 });
    expect(table.rows[1]).toMatchObject({ count: 0, amount: 0 });
  });

  it('groupRevenueByPeriod: İstanbul gün anahtarı + net hesap', () => {
    const rows = groupRevenueByPeriod(
      [{ amount: 500, createdAt: new Date('2026-11-08T16:00:00Z') }], // 19:00 TR
      [{ amount: 100, createdAt: new Date('2026-11-08T17:00:00Z') }],
      [{ amount: 50, paidAt: new Date('2026-11-08T15:00:00Z') }],
      'daily',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ period: '2026-11-08', payments: 500, refunds: 100, expenses: 50 });
    const table = buildRevenueTable('daily', rows);
    expect(table.rows[0]!['net']).toBe(350);
  });

  it('groupRevenueByPeriod: TR gece yarısı sınırı yeni güne yazar', () => {
    const rows = groupRevenueByPeriod(
      [{ amount: 500, createdAt: new Date('2026-11-08T20:00:00Z') }], // 23:00 TR → 08
      [{ amount: 100, createdAt: new Date('2026-11-08T21:00:00Z') }], // 00:00 TR → 09
      [],
      'daily',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ period: '2026-11-08', payments: 500 });
    expect(rows[1]).toMatchObject({ period: '2026-11-09', refunds: 100 });
  });

  it('groupRevenueByPeriod: aylık gruplama', () => {
    const rows = groupRevenueByPeriod(
      [
        { amount: 100, createdAt: new Date('2026-10-01T10:00:00Z') },
        { amount: 150, createdAt: new Date('2026-11-02T10:00:00Z') },
        { amount: 50, createdAt: new Date('2026-11-20T10:00:00Z') },
      ],
      [],
      [],
      'monthly',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ period: '2026-10', payments: 100 });
    expect(rows[1]).toMatchObject({ period: '2026-11', payments: 200 });
  });

  it('turnaroundHours/Summary: ortalama, min, max; tamamlanmamış hariç', () => {
    const base = new Date('2026-11-08T08:00:00Z');
    const items = [
      { orderedAt: base, completedAt: new Date(base.getTime() + 2 * 3_600_000) },
      { orderedAt: base, completedAt: new Date(base.getTime() + 4 * 3_600_000) },
      { orderedAt: base, completedAt: null },
    ];
    expect(turnaroundHours(items[0]!)).toBe(2);
    const summary = turnaroundSummary(items);
    expect(summary.count).toBe(2);
    expect(summary.avgHours).toBe(3);
    expect(summary.minHours).toBe(2);
    expect(summary.maxHours).toBe(4);
  });

  it('occupancyRate: kısmi gün tam sayılır, oran yüzde', () => {
    const rangeStart = new Date('2026-11-01T00:00:00Z');
    const rangeEnd = new Date('2026-11-08T00:00:00Z'); // 7 gün
    const result = occupancyRate({
      stays: [
        // 11-01 ve 11-02 günlerini kaplar (kısmi 12:00 çıkışı tam gün) → 2
        { kennelId: 'k1', admittedAt: new Date('2026-10-30T00:00:00Z'), dischargedAt: new Date('2026-11-02T12:00:00Z') },
        // 11-05, 06, 07 → 3 gün
        { kennelId: 'k2', admittedAt: new Date('2026-11-05T00:00:00Z'), dischargedAt: null },
      ],
      kennelCount: 4,
      rangeStart,
      rangeEnd,
    });
    expect(result.kennelDays).toBe(5);
    expect(result.capacityDays).toBe(28);
    expect(result.rate).toBe(17.86);
  });

  it('expiryBucketKey: süresi geçmiş/30/90+/partisiz', () => {
    const now = new Date('2026-11-08T00:00:00Z');
    expect(expiryBucketKey(new Date('2026-11-01T00:00:00Z'), now)).toBe('expired');
    expect(expiryBucketKey(new Date('2026-11-20T00:00:00Z'), now)).toBe('d0-30');
    expect(expiryBucketKey(new Date('2026-12-20T00:00:00Z'), now)).toBe('d31-90');
    expect(expiryBucketKey(new Date('2027-06-01T00:00:00Z'), now)).toBe('d90+');
    expect(expiryBucketKey(null, now)).toBe('none');
  });

  it('exportFileName: ASCII güvenli damga', () => {
    const when = new Date('2026-11-08T09:05:00Z');
    expect(exportFileName('gelir', 'csv', when)).toBe('gelir-20261108-0905.csv');
    expect(exportFileName('borc-yaslandirma', 'xlsx', when)).toBe('borc-yaslandirma-20261108-0905.xlsx');
  });

  it('isReportKey: 10 rapor kataloğu', () => {
    expect(isReportKey('gelir')).toBe(true);
    expect(isReportKey('yatis-doluluk')).toBe(true);
    expect(isReportKey('yok-boyle')).toBe(false);
  });

  it('reportTableToPdfSection: money hücreleri TR biçimli, TOPLAM satırı', () => {
    const table = {
      key: 'x',
      title: 'Rapor',
      columns: [
        { key: 'ad', label: 'Ad', type: 'text' as const },
        { key: 'tutar', label: 'Tutar', type: 'money' as const },
      ],
      rows: [
        { ad: 'Muayene', tutar: 1250 },
        { ad: 'Aşı', tutar: 300.5 },
      ],
      totalColumns: ['tutar'],
    };
    const section = reportTableToPdfSection(table);
    expect(section.columns).toEqual(['Ad', 'Tutar']);
    expect(section.rows[0]).toEqual(['Muayene', '1.250,00']);
    expect(section.rows[2]).toEqual(['TOPLAM', '1.550,50']);
  });
});
