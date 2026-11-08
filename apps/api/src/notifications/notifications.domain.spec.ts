import { describe, expect, it } from 'vitest';
import {
  MAX_PROVIDER_ATTEMPTS,
  TemplateVarMissingError,
  backoffDelayMs,
  canTransitionNotification,
  classifyFailure,
  consentKindForChannel,
  deriveProviderMessageId,
  normalizeRecipient,
  parseSandboxFailPlan,
  renderTemplate,
  requiredTemplateVars,
} from './notifications.domain';
import {
  NotificationProviderRegistry,
  ProviderError,
  SandboxEmailProvider,
  SandboxSmsProvider,
} from './providers/notification-providers';

describe('consentKindForChannel — iletişim tercihi kuralı', () => {
  it('dış kanallar ilgili OwnerConsent türünü ister', () => {
    expect(consentKindForChannel('sms')).toBe('sms');
    expect(consentKindForChannel('email')).toBe('email');
    expect(consentKindForChannel('whatsapp')).toBe('whatsapp');
  });

  it('push (uygulama içi) dış rıza istemez', () => {
    expect(consentKindForChannel('push')).toBeNull();
  });
});

describe('normalizeRecipient', () => {
  it('telefonu 90xxxxxxxxxx biçimine normalleştirir', () => {
    expect(normalizeRecipient('sms', '0532 123 45 67')).toBe('905321234567');
    expect(normalizeRecipient('sms', '+90 532 123 45 67')).toBe('905321234567');
    expect(normalizeRecipient('whatsapp', '5321234567')).toBe('905321234567');
  });

  it('e-postayı küçük harfe çeker', () => {
    expect(normalizeRecipient('email', ' Ayse.Demir@Example.COM ')).toBe('ayse.demir@example.com');
  });
});

describe('renderTemplate — şablon doldurma', () => {
  it('tüm yer tutucuları doldurur', () => {
    const out = renderTemplate(
      'Sayın {{ownerName}}, {{patientName}} için {{date}} randevunuz var — {{clinicName}}',
      { ownerName: 'Zeynep Ak', patientName: 'Karabaş', date: '12.11.2026', clinicName: 'VetCore Demo' },
    );
    expect(out).toBe('Sayın Zeynep Ak, Karabaş için 12.11.2026 randevunuz var — VetCore Demo');
  });

  it('eksik değişkeni TemplateVarMissingError ile reddeder', () => {
    expect(() => renderTemplate('Sayın {{ownerName}}', {})).toThrow(TemplateVarMissingError);
    try {
      renderTemplate('Sayın {{ownerName}}', {});
    } catch (error) {
      expect((error as TemplateVarMissingError).varName).toBe('ownerName');
    }
  });

  it('requiredTemplateVars yer tutucuları tekilleştirir', () => {
    expect(requiredTemplateVars('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });
});

describe('classifyFailure — retryable/permanent ayrımı', () => {
  it('zaman aşımı/ağ hataları retryable döner', () => {
    expect(classifyFailure('SMS_PROVIDER_TIMEOUT')).toBe('retryable');
    expect(classifyFailure('network unreachable')).toBe('retryable');
  });

  it('geçersiz alıcı/kalıcı işaretler permanent döner', () => {
    expect(classifyFailure('INVALID_RECIPIENT')).toBe('permanent');
    expect(classifyFailure('CONSENT_REVOKED')).toBe('permanent');
  });
});

describe('backoffDelayMs — üstel bekleme', () => {
  it('30 sn → 2 dk → 8 dk ve üst sınır 30 dk', () => {
    expect(backoffDelayMs(1)).toBe(30_000);
    expect(backoffDelayMs(2)).toBe(60_000);
    expect(backoffDelayMs(3)).toBe(120_000);
    expect(backoffDelayMs(9)).toBe(1_800_000);
  });
});

describe('deriveProviderMessageId — retry duplicate güvencesi', () => {
  it('aynı bildirim için her denemede AYNI kimlik üretilir', () => {
    const first = deriveProviderMessageId('notif-1', 'sandbox-sms');
    const second = deriveProviderMessageId('notif-1', 'sandbox-sms');
    expect(first).toBe(second);
    expect(deriveProviderMessageId('notif-2', 'sandbox-sms')).not.toBe(first);
  });
});

describe('canTransitionNotification — durum makinesi', () => {
  it('kuyruk akışı queued→processing→sent izinlidir', () => {
    expect(canTransitionNotification('queued', 'processing')).toBe(true);
    expect(canTransitionNotification('processing', 'sent')).toBe(true);
    expect(canTransitionNotification('processing', 'queued')).toBe(true);
    expect(canTransitionNotification('processing', 'dead_letter')).toBe(true);
    expect(canTransitionNotification('processing', 'failed')).toBe(true);
  });

  it('terminal durumlardan çıkış yoktur', () => {
    expect(canTransitionNotification('sent', 'queued')).toBe(false);
    expect(canTransitionNotification('skipped', 'queued')).toBe(false);
  });

  it('failed ve dead_letter yalnız manuel retry ile kuyruğa döner', () => {
    expect(canTransitionNotification('failed', 'queued')).toBe(true);
    expect(canTransitionNotification('dead_letter', 'queued')).toBe(true);
    expect(canTransitionNotification('failed', 'sent')).toBe(false);
    expect(canTransitionNotification('dead_letter', 'sent')).toBe(false);
  });
});

describe('parseSandboxFailPlan', () => {
  it('kanal:mod çiftlerini ayrıştırır', () => {
    expect(parseSandboxFailPlan('email:once,sms:always')).toEqual({
      email: 'once',
      sms: 'always',
    });
    expect(parseSandboxFailPlan(undefined)).toEqual({});
    expect(parseSandboxFailPlan('bad-input')).toEqual({});
  });
});

describe('sandbox sağlayıcılar — hata enjeksiyonu ve determinizm', () => {
  it('normal modda deterministik providerMessageId döner', async () => {
    const provider = new SandboxSmsProvider();
    const result = await provider.send({
      channel: 'sms',
      to: '905321234567',
      body: 'Merhaba',
      idempotencyKey: 'notif-abc',
    });
    expect(result.providerMessageId).toBe(deriveProviderMessageId('notif-abc', 'sandbox-sms'));
  });

  it('once modu ilk çağrıda retryable hata, ikinci çağrıda başarılı döner', async () => {
    const provider = new SandboxEmailProvider('once');
    const input = {
      channel: 'email' as const,
      to: 'owner@example.com',
      body: 'Test',
      idempotencyKey: 'notif-email-1',
    };
    await expect(provider.send(input)).rejects.toMatchObject({
      failureClass: 'retryable',
    });
    const result = await provider.send(input);
    expect(result.providerMessageId).toContain('sandbox-email');
  });

  it('always modu her çağrıda retryable hata üretir', async () => {
    const provider = new SandboxSmsProvider('always');
    for (let i = 0; i < 2; i += 1) {
      await expect(
        provider.send({ channel: 'sms', to: '905320000000', body: 'x', idempotencyKey: `n${i}` }),
      ).rejects.toBeInstanceOf(ProviderError);
    }
  });

  it('geçersiz alıcı permanent hata döner', async () => {
    const provider = new SandboxSmsProvider();
    await expect(
      provider.send({ channel: 'sms', to: '12', body: 'x', idempotencyKey: 'n-short' }),
    ).rejects.toMatchObject({ failureClass: 'permanent' });
  });

  it('kayıt kanala göre çözümlenir ve env fail planı uygulanır', () => {
    process.env.VETCORE_SANDBOX_FAIL = 'sms:always';
    const registry = new NotificationProviderRegistry();
    const provider = registry.resolve('sms');
    void expect(
      provider.send({ channel: 'sms', to: '905320000000', body: 'x', idempotencyKey: 'reg-1' }),
    ).rejects.toMatchObject({ failureClass: 'retryable' });
    expect(registry.resolve('email').name).toBe('sandbox-email');
    delete process.env.VETCORE_SANDBOX_FAIL;
  });

  it('MAX_PROVIDER_ATTEMPTS deneme bütçesini tanımlar', () => {
    expect(MAX_PROVIDER_ATTEMPTS).toBeGreaterThanOrEqual(2);
  });
});
