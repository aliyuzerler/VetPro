import { describe, expect, it } from 'vitest';
import { containsSecretKey } from './integrations.domain';
import { IntegrationAdapterFactory } from './adapters/sandbox-adapters';
import { SandboxEInvoiceAdapter, SandboxLabAdapter } from './adapters/sandbox-adapters';

describe('containsSecretKey — provider secret yazım engeli', () => {
  it('secret benzeri anahtar adlarını yakalar', () => {
    expect(containsSecretKey({ apiKey: 'x' })).toBe('apiKey');
    expect(containsSecretKey({ password: 'x' })).toBe('password');
    expect(containsSecretKey({ client_secret: 'x' })).toBe('client_secret');
    expect(containsSecretKey({ accessToken: 'x' })).toBe('accessToken');
  });

  it('secret olmayan anahtarlara izin verir', () => {
    expect(containsSecretKey({ orgCode: 'VETCORE-DEMO' })).toBeNull();
    expect(containsSecretKey({ endpointHint: 'https://sandbox' })).toBeNull();
    expect(containsSecretKey(null)).toBeNull();
  });
});

describe('sandbox adapter stub\'ları', () => {
  it('e-fatura sandbox ping deterministik OK döner ve sandbox modunu belirtir', async () => {
    const adapter = new SandboxEInvoiceAdapter();
    expect(adapter.mode).toBe('sandbox');
    const ping = await adapter.ping({ orgCode: 'VETCORE-DEMO' });
    expect(ping.ok).toBe(true);
    expect(ping.detail).toContain('canlı bağlantı yok');
  });

  it('e-fatura taslak fatura dış kimlik üretir (sandbox statüsü ile)', async () => {
    const adapter = new SandboxEInvoiceAdapter();
    const invoice = await adapter.createDraftInvoice({ orgCode: 'VET' }, {
      receiverName: 'Zeynep Aksoy',
      amount: 1250,
      currency: 'TRY',
    });
    expect(invoice.externalId).toMatch(/^SBX-EI-VET-/);
    expect(invoice.status).toBe('sandbox_draft_created');
  });

  it('lab stub sipariş gönderir ve sonucu pending döner (gerçek analizör verisi değil)', async () => {
    const adapter = new SandboxLabAdapter();
    expect(adapter.mode).toBe('sandbox');
    const submitted = await adapter.submitOrder({}, { labelCode: 'LAB-261108-0001', testCode: 'LAB-CBC' });
    expect(submitted.externalId).toMatch(/^SBX-LAB-/);
    const result = await adapter.fetchResult({}, submitted.externalId);
    expect(result.status).toBe('pending');
  });

  it('fabrika kind + provider kombinasyonlarını çözümler', () => {
    const factory = new IntegrationAdapterFactory();
    expect(factory.resolve('einvoice', 'vetcore-sandbox', 'sandbox').kind).toBe('einvoice');
    expect(factory.resolve('lab', 'vetcore-sandbox', 'sandbox').kind).toBe('lab');
    // Tanınmayan sağlayıcı sandbox stub'a düşer — canlı mod taklit edilmez.
    const unknown = factory.resolve('lab', 'unknown-provider', 'live');
    expect(unknown.mode).toBe('sandbox');
  });
});
