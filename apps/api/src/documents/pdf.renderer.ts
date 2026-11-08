import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { DocSection } from './documents.domain';

/**
 * PDF üretici — Faz 12. pdf-lib + gömülü DejaVu Sans (Regular/Bold):
 * Türkçe glifler (ğışçöüĞİŞÇÖÜ) WinAnsi standart fontla KODLANAMAZ; bu
 * yüzden belge fontu TTF'den gömülür (kabul kriteri: Türkçe karakter +
 * klinik marka testi). Font dosyaları apps/api/assets/fonts altındadır ve
 * hem vitest (cwd=apps/api) hem üretim (node dist/main.js, cwd=apps/api)
 * tarafından çözülür.
 */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const CONTENT_WIDTH = A4[0] - MARGIN * 2;

const INK = rgb(0.09, 0.11, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const BRAND = rgb(0.13, 0.44, 0.4);
const LINE = rgb(0.85, 0.87, 0.89);
const WATERMARK = rgb(0.75, 0.2, 0.2);

interface FontBundle {
  regular: PDFFont;
  bold: PDFFont;
}

function loadFontFile(candidates: string[]): Buffer {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate);
  }
  throw new Error(`Font dosyası bulunamadı: ${candidates.join(' | ')}`);
}

@Injectable()
export class PdfRendererService {
  private regularBytes?: Buffer;
  private boldBytes?: Buffer;

  private fontCandidates(fileName: string): string[] {
    const cwd = process.cwd();
    return [
      resolve(cwd, 'assets/fonts', fileName),
      resolve(cwd, 'apps/api/assets/fonts', fileName),
      resolve(cwd, '..', 'apps/api/assets/fonts', fileName),
    ];
  }

  private fonts(): { regular: Buffer; bold: Buffer } {
    this.regularBytes ??= loadFontFile(this.fontCandidates('DejaVuSans.ttf'));
    this.boldBytes ??= loadFontFile(this.fontCandidates('DejaVuSans-Bold.ttf'));
    return { regular: this.regularBytes, bold: this.boldBytes };
  }

  /**
   * Belgeyi çizer. Türkçe metinler gömülü TTF ile kodlanır — WinAnsi
   * sınırı burada devreye girmez (test: 'ĞÜŞİÖÇ ğüşıöç' başlıklı belge).
   */
  async render(input: {
    clinicName: string;
    branchName?: string | null;
    branchAddress?: string | null;
    branchPhone?: string | null;
    documentNo: string;
    title: string;
    generatedAt: Date;
    sections: DocSection[];
    watermark?: string;
    signature?: {
      veterinarianName: string;
      veterinarianTitle: string;
      signedAt: string;
      authorizedStatus: string;
    };
  }): Promise<Uint8Array> {
    const { regular: regularBytes, bold: boldBytes } = this.fonts();
    const pdf = await PDFDocument.create();
    // TTF gömme (subset) fontkit ister — @pdf-lib/fontkit paketiyle kaydedilir.
    pdf.registerFontkit(fontkit);
    const regular = await pdf.embedFont(regularBytes, { subset: true });
    const bold = await pdf.embedFont(boldBytes, { subset: true });
    pdf.setTitle(`${input.title} — ${input.documentNo}`);
    pdf.setProducer('VetCore');
    pdf.setCreator('VetCore Veteriner Yönetim Sistemi');

    const fonts: FontBundle = { regular, bold };
    let page: PDFPage = pdf.addPage(A4);
    let y = A4[1] - MARGIN;

    y = this.drawHeader(page, y, input, fonts);

    if (input.watermark) {
      this.drawWatermark(page, input.watermark, bold);
    }

    for (const section of input.sections) {
      ({ page, y } = await this.drawSection(pdf, page, y, section, fonts, input));
      if (y < MARGIN + 60) {
        page = pdf.addPage(A4);
        y = A4[1] - MARGIN;
      }
    }

    if (input.signature) {
      ({ page, y } = this.drawSignature(page, y, input.signature, fonts));
    }

    this.drawFooter(page, input, fonts);
    return pdf.save();
  }

  // ------------------------------------------------------------------ çizim yardımcıları

  private drawHeader(
    page: PDFPage,
    startY: number,
    input: {
      clinicName: string;
      branchName?: string | null;
      branchAddress?: string | null;
      branchPhone?: string | null;
      title: string;
      documentNo: string;
    },
    fonts: FontBundle,
  ): number {
    let y = startY;
    // Klinik marka bloğu: baş harf rozeti + klinik adı + şube bilgisi.
    page.drawRectangle({
      x: MARGIN,
      y: y - 40,
      width: 40,
      height: 40,
      color: BRAND,
    });
    const initials = input.clinicName
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR'))
      .join('');
    page.drawText(initials, {
      x: MARGIN + 11,
      y: y - 27,
      size: 16,
      font: fonts.bold,
      color: rgb(1, 1, 1),
    });
    page.drawText(input.clinicName, {
      x: MARGIN + 52,
      y: y - 16,
      size: 15,
      font: fonts.bold,
      color: INK,
    });
    const subLines = [
      input.branchName ?? null,
      input.branchAddress ?? null,
      input.branchPhone ? `Tel: ${input.branchPhone}` : null,
    ].filter((line): line is string => Boolean(line));
    page.drawText(subLines.join(' · '), {
      x: MARGIN + 52,
      y: y - 30,
      size: 8.5,
      font: fonts.regular,
      color: MUTED,
    });
    // Belge başlığı + numara sağda.
    page.drawText(input.title, {
      x: MARGIN + 52,
      y: y - 52,
      size: 13,
      font: fonts.bold,
      color: BRAND,
    });
    page.drawText(input.documentNo, {
      x: A4[0] - MARGIN - fonts.bold.widthOfTextAtSize(input.documentNo, 10),
      y: y - 16,
      size: 10,
      font: fonts.bold,
      color: MUTED,
    });
    y -= 72;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness: 1.2,
      color: BRAND,
    });
    return y - 18;
  }

  private drawWatermark(page: PDFPage, text: string, bold: PDFFont): void {
    page.drawText(text, {
      x: 90,
      y: 420,
      size: 38,
      font: bold,
      color: WATERMARK,
      opacity: 0.16,
      rotate: degrees(32),
    });
  }

  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [''];
  }

  private drawSectionTitle(page: PDFPage, y: number, title: string, fonts: FontBundle): number {
    page.drawText(title, {
      x: MARGIN,
      y: y - 12,
      size: 10.5,
      font: fonts.bold,
      color: BRAND,
    });
    return y - 18;
  }

  private async drawSection(
    pdf: PDFDocument,
    page: PDFPage,
    startY: number,
    section: DocSection,
    fonts: FontBundle,
    _input: unknown,
  ): Promise<{ page: PDFPage; y: number }> {
    void pdf;
    void _input;
    let p = page;
    let y = startY;

    const ensure = (need: number) => {
      if (y - need < MARGIN + 60) {
        p = pdf.addPage(A4);
        y = A4[1] - MARGIN;
      }
    };

    if (section.title) {
      ensure(24);
      y = this.drawSectionTitle(p, y, section.title, fonts);
    }

    if (section.type === 'keyValue') {
      for (const row of section.rows) {
        ensure(16);
        const label = `${row.label}:`;
        p.drawText(label, {
          x: MARGIN,
          y: y - 11,
          size: 9.5,
          font: fonts.bold,
          color: MUTED,
        });
        const valueX = MARGIN + 150;
        const valueLines = this.wrap(row.value, fonts.regular, 9.5, A4[0] - MARGIN - valueX);
        for (const line of valueLines) {
          ensure(14);
          p.drawText(line, {
            x: valueX,
            y: y - 11,
            size: 9.5,
            font: fonts.regular,
            color: INK,
          });
          y -= 13;
        }
      }
      y -= 6;
      return { page: p, y };
    }

    if (section.type === 'paragraph') {
      const lines = this.wrap(section.text, fonts.regular, 9.5, CONTENT_WIDTH);
      for (const line of lines) {
        ensure(14);
        p.drawText(line, {
          x: MARGIN,
          y: y - 11,
          size: 9.5,
          font: fonts.regular,
          color: INK,
        });
        y -= 13;
      }
      y -= 6;
      return { page: p, y };
    }

    // table
    const totalWidth = section.widths.reduce((sum, w) => sum + w, 0);
    const scale = CONTENT_WIDTH / totalWidth;
    const colWidths = section.widths.map((w) => w * scale);
    const drawRow = (cells: string[], isHeader: boolean) => {
      ensure(16);
      const font = isHeader ? fonts.bold : fonts.regular;
      const color = isHeader ? MUTED : INK;
      if (isHeader) {
        p.drawRectangle({
          x: MARGIN,
          y: y - 15,
          width: CONTENT_WIDTH,
          height: 16,
          color: rgb(0.95, 0.96, 0.96),
        });
      }
      let x = MARGIN;
      for (let i = 0; i < cells.length; i += 1) {
        const width = (colWidths[i] ?? 0) - 8;
        const lines = this.wrap(cells[i] ?? '', font, 8.8, width);
        for (const line of lines) {
          ensure(13);
          p.drawText(line, {
            x: x + 4,
            y: y - 12,
            size: 8.8,
            font,
            color,
          });
          y -= 12;
        }
        x += colWidths[i] ?? 0;
      }
      y -= 4;
    };

    drawRow(section.columns, true);
    for (const row of section.rows) drawRow(row, false);
    y -= 8;
    return { page: p, y };
  }

  private drawSignature(
    page: PDFPage,
    startY: number,
    signature: {
      veterinarianName: string;
      veterinarianTitle: string;
      signedAt: string;
      authorizedStatus: string;
    },
    fonts: FontBundle,
  ): { page: PDFPage; y: number } {
    let y = startY - 16;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness: 0.8,
      color: LINE,
    });
    y -= 22;
    page.drawText('İmza / Yetki Durumu', {
      x: MARGIN,
      y,
      size: 10.5,
      font: fonts.bold,
      color: BRAND,
    });
    y -= 16;
    page.drawText(`${signature.veterinarianName} — ${signature.veterinarianTitle}`, {
      x: MARGIN,
      y,
      size: 9.5,
      font: fonts.bold,
      color: INK,
    });
    y -= 13;
    page.drawText(
      `${signature.authorizedStatus} · İmza zamanı: ${signature.signedAt}`,
      {
        x: MARGIN,
        y,
        size: 9.5,
        font: fonts.regular,
        color: INK,
      },
    );
    return { page, y: y - 10 };
  }

  private drawFooter(
    page: PDFPage,
    input: { documentNo: string; generatedAt: Date },
    fonts: FontBundle,
  ): void {
    const y = MARGIN - 18;
    page.drawLine({
      start: { x: MARGIN, y: y + 12 },
      end: { x: A4[0] - MARGIN, y: y + 12 },
      thickness: 0.8,
      color: LINE,
    });
    const stamp = input.generatedAt.toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const left = `${input.documentNo} · Üretim: ${stamp}`;
    page.drawText(left, {
      x: MARGIN,
      y,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    });
    const right = 'VetCore Veteriner Yönetim Sistemi ile üretildi';
    page.drawText(right, {
      x: A4[0] - MARGIN - fonts.regular.widthOfTextAtSize(right, 8),
      y,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    });
  }
}
