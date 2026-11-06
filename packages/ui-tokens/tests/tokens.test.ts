import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCENT_COLORS, BRAND_COLORS, LAYOUT, NEUTRAL_COLORS, STATUS_COLORS } from '../src';

/**
 * tokens.ts değeri design/tokens.json ile uyumlu mu?
 * design/tokens.json tek doğruluk kaynağıdır.
 */
describe('ui-tokens ↔ design/tokens.json uyumu', () => {
  const designTokens = JSON.parse(
    readFileSync(resolve(__dirname, '../../../design/tokens.json'), 'utf-8'),
  ) as {
    color: {
      brand: Record<string, string>;
      accent: Record<string, string>;
      neutral: Record<string, string>;
      status: Record<string, string>;
    };
    layout: Record<string, number>;
  };

  it('marka renkleri eşleşir', () => {
    expect(BRAND_COLORS[600]).toBe(designTokens.color.brand['600']);
    expect(BRAND_COLORS[950]).toBe(designTokens.color.brand['950']);
    expect(BRAND_COLORS[50]).toBe(designTokens.color.brand['50']);
  });

  it('vurgu ve nötr renkler eşleşir', () => {
    expect(ACCENT_COLORS[600]).toBe(designTokens.color.accent['600']);
    expect(NEUTRAL_COLORS[50]).toBe(designTokens.color.neutral['50']);
    expect(NEUTRAL_COLORS[950]).toBe(designTokens.color.neutral['950']);
  });

  it('durum renkleri eşleşir', () => {
    expect(STATUS_COLORS.success).toBe(designTokens.color.status.success);
    expect(STATUS_COLORS.danger).toBe(designTokens.color.status.danger);
  });

  it('yerleşim ölçüleri eşleşir', () => {
    expect(LAYOUT.sidebarWidth).toBe(designTokens.layout.sidebarWidth);
    expect(LAYOUT.topbarHeight).toBe(designTokens.layout.topbarHeight);
    expect(LAYOUT.contentMaxWidth).toBe(designTokens.layout.contentMaxWidth);
  });
});
