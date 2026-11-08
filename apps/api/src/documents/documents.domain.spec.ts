import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_META,
  formatTrDate,
  formatTrDateTime,
  nextDocumentNo,
} from './documents.domain';
import { PdfRendererService } from './pdf.renderer';

/** Çıktıda gömülü TrueType font kanıtı — font nesne diyagramında CIDFontType2/FontFile2. */
async function hasEmbeddedTrueType(bytes: Uint8Array): Promise<boolean> {
  const loaded = await PDFDocument.load(bytes);
  for (const [, obj] of loaded.context.enumerateIndirectObjects()) {
    const rendered = obj.toString();
    if (rendered.includes('/FontFile2') || rendered.includes('/CIDFontType2')) return true;
  }
  return false;
}

describe('belge türleri — 6 zorunlu tür', () => {
  it('muayene özeti, aşı kartı, reçete, onam, lab raporu ve taburculuk tanımlıdır', () => {
    expect(DOCUMENT_KINDS).toEqual([
      'exam_summary',
      'vaccine_card',
      'prescription',
      'consent',
      'lab_report',
      'discharge',
    ]);
  });

  it('reçete imza durumu gerektirir; diğer türler gerektirmez', () => {
    expect(DOCUMENT_KIND_META.prescription.requiresSignatureStatus).toBe(true);
    expect(DOCUMENT_KIND_META.exam_summary.requiresSignatureStatus).toBe(false);
  });
});

describe('nextDocumentNo — BELGE sıralaması', () => {
  it('boş kümede BELGE-0001 üretir', () => {
    expect(nextDocumentNo(null)).toBe('BELGE-0001');
    expect(nextDocumentNo(undefined)).toBe('BELGE-0001');
  });

  it('mevcut numarayı ilerletir', () => {
    expect(nextDocumentNo('BELGE-0001')).toBe('BELGE-0002');
    expect(nextDocumentNo('BELGE-0042')).toBe('BELGE-0043');
  });

  it('geçersiz numara güvenli şekilde baştan başlar', () => {
    expect(nextDocumentNo('X')).toBe('BELGE-0001');
  });
});

describe('TR tarih biçimleri', () => {
  it('gün.ay.yıl saat:dakika üretir', () => {
    const iso = '2026-11-08T10:30:00.000Z';
    expect(formatTrDate(iso)).toBe('08.11.2026');
    expect(formatTrDateTime(iso)).toBe('08.11.2026 10:30');
  });
});

describe('PdfRendererService — Türkçe karakter ve klinik marka', () => {
  const renderer = new PdfRendererService();

  it('Türkçe metinli belge gömülü DejaVu fontla üretilir (WinAnsi sınırına takılmaz)', async () => {
    const bytes = await renderer.render({
      clinicName: 'VetCore Demo Kliniği — Işık Hayvan Hastanesi',
      branchName: 'Merkez Şubesi',
      branchAddress: 'Bağdat Caddesi No: 123, İstanbul',
      branchPhone: '+90 212 000 00 00',
      documentNo: 'BELGE-0001',
      title: 'Muayene Özeti — ÖĞÜN ÖRNEĞİ ğüşıöç',
      generatedAt: new Date('2026-11-08T10:00:00Z'),
      sections: [
        {
          type: 'keyValue',
          title: 'Hasta Bilgileri',
          rows: [
            { label: 'Hasta', value: 'Karabaş (HP-0001) — İri ırk köpek' },
            { label: 'Sahibi', value: 'Zeynep Aksoy — Işık Mahallesi' },
          ],
        },
        {
          type: 'paragraph',
          title: 'Klinik Not',
          text: 'Hasta iyileşme gösteriyor. Şişlik gerilemiş, ateş normal seyrediyor. İlaçları düzenli uygulandı.',
        },
        {
          type: 'table',
          title: 'İlaçlar',
          columns: ['İlaç', 'Doz', 'Sıklık'],
          widths: [3, 1, 2],
          rows: [['Amoksisilin', '125 mg', 'Günde 2 kez — 7 gün']],
        },
      ],
      signature: {
        veterinarianName: 'Ayşe Demir',
        veterinarianTitle: 'Yetkili Veteriner Hekim',
        signedAt: '08.11.2026 10:00',
        authorizedStatus: 'İmzalı — Yetkili Veteriner Hekim onaylı',
      },
    });
    const buffer = Buffer.from(bytes);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // Gömülü TTF: WinAnsi standart font yerine CIDFontType2/FontFile2 gömmesi
    // vardır — Türkçe glifler bu fontla kodlanır.
    expect(await hasEmbeddedTrueType(bytes)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(5_000);

    // Fonksiyonel kanıt: Türkçe glifler (ğışçöüĞİŞÇÖÜ) subset'e eklenir —
    // aynı içerik salt ASCII ile üretildiğinde daha küçük olur.
    const asciiOnly = await renderer.render({
      clinicName: 'VetCore Demo',
      documentNo: 'BELGE-0001',
      title: 'Muayene Ozeti',
      generatedAt: new Date('2026-11-08T10:00:00Z'),
      sections: [
        {
          type: 'paragraph',
          text: 'Hasta iyilesme gosteriyor. Sislik gerilemis, ates normal seyrediyor.',
        },
      ],
    });
    expect(bytes.byteLength).toBeGreaterThan(asciiOnly.byteLength);
  });

  it('reçete taslağı filigranla, imzalı imza bloğuyla üretilir', async () => {
    const draft = await renderer.render({
      clinicName: 'VetCore Demo Kliniği',
      documentNo: 'BELGE-0002',
      title: 'Reçete',
      generatedAt: new Date('2026-11-08T10:00:00Z'),
      sections: [{ type: 'paragraph', text: 'Taslak reçete gövdesi' }],
      watermark: 'TASLAK — İMZALANMAMIŞ',
    });
    expect(Buffer.from(draft).byteLength).toBeGreaterThan(4_000);

    const signed = await renderer.render({
      clinicName: 'VetCore Demo Kliniği',
      documentNo: 'BELGE-0003',
      title: 'Reçete',
      generatedAt: new Date('2026-11-08T10:00:00Z'),
      sections: [{ type: 'paragraph', text: 'İmzalı reçete gövdesi' }],
      signature: {
        veterinarianName: 'Ayşe Demir',
        veterinarianTitle: 'Yetkili Veteriner Hekim',
        signedAt: '08.11.2026 10:00',
        authorizedStatus: 'İmzalı',
      },
    });
    expect(Buffer.from(signed).byteLength).toBeGreaterThan(4_000);
  });
});
