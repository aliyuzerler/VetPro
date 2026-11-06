import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Home from '../src/app/page';
import { HealthResponseSchema } from '@vetcore/contracts';

const validHealth = {
  status: 'ok',
  service: 'vetcore-api',
  version: '0.1.0',
  environment: 'test',
  uptimeSeconds: 12,
  timestamp: new Date().toISOString(),
  checks: [{ name: 'api', status: 'ok' }],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>,
  );
}

describe('Faz 01 durum sayfası', () => {
  it('VetCore başlığı ve faz planı görüntülenir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        json: async () => validHealth,
      })),
    );

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'VetCore' })).toBeInTheDocument();
    expect(screen.getByText('Faz planı')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('Çalışıyor').length).toBeGreaterThan(0);
    });

    // Faz 15 satırının listelendiğini doğrula
    expect(screen.getByText('Güvenlik, performans, dağıtım ve sürüm')).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('API erişilemediğinde hata durumu gösterilir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Erişilemiyor')).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it('health sözleşmesi geçersiz yanıtı reddeder', () => {
    const result = HealthResponseSchema.safeParse({ foo: 'bar' });
    expect(result.success).toBe(false);
  });
});
