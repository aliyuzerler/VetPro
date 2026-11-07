import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DashboardPage from '../src/app/(app)/page';
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
      <DashboardPage />
    </QueryClientProvider>,
  );
}

describe('Kontrol paneli (Genel Bakış)', () => {
  it('başlık, KPI kartları ve faz planı görüntülenir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        json: async () => validHealth,
      })),
    );

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Genel Bakış' })).toBeInTheDocument();
    // CURRENT_PHASE_ID faz ilerledikçe güncellenir (Faz 07: stok yönetimi)
    expect(screen.getByText('Faz 07 — Ürün, tedarikçi, parti ve stok yönetimi')).toBeInTheDocument();

    // KPI kartları — sentetik demo değerleri
    expect(screen.getByText('Bugünkü Randevular')).toBeInTheDocument();
    expect(screen.getByText('Günlük Ciro')).toBeInTheDocument();
    expect(screen.getByText('₺18.450')).toBeInTheDocument();

    // Durum hikâyeleri — kabul kriteri: loading/empty/error/unauthorized görülmeli
    expect(screen.getByText('Durum hikâyeleri')).toBeInTheDocument();
    expect(screen.getByText('Bugün için bekleyen görev yok')).toBeInTheDocument();
    expect(screen.getByText('Bu bölümü görme yetkiniz yok')).toBeInTheDocument();

    // Faz planı 15 satır; Faz 07 sürdürülüyor
    expect(screen.getByText('Faz planı')).toBeInTheDocument();
    expect(screen.getByText('Güvenlik, performans, dağıtım ve sürüm')).toBeInTheDocument();

    // Türkçe karakterli sentetik veri tabloya yazılmış
    const table = screen.getByRole('table');
    expect(within(table).getByText('Tekir')).toBeInTheDocument();
    expect(within(table).getByText('Ayşe Yılmaz')).toBeInTheDocument();

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
