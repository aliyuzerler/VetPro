'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck2,
  Clock3,
  Database,
  PackageX,
  RefreshCw,
  Server,
  Wallet,
} from 'lucide-react';
import { CURRENT_PHASE_ID, PHASES } from '@vetcore/domain';
import { HealthResponseSchema, type HealthResponse } from '@vetcore/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { KpiCard } from '@/components/design-system/kpi-card';
import { StatusChip, type StatusTone } from '@/components/design-system/status-chip';
import { EmptyState, ErrorState, UnauthorizedState } from '@/components/design-system/state-views';
import { useToast } from '@/hooks/use-toast';
import type { ZodType } from 'zod';

type LoadResult = { data: HealthResponse; httpStatus: number };

async function fetchHealth(url: string, schema: ZodType<HealthResponse>): Promise<LoadResult> {
  const res = await fetch(url, { cache: 'no-store' });
  const body: unknown = await res.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error('API yanıtı sözleşme ile doğrulanamadı');
  }
  return { data: parsed.data, httpStatus: res.status };
}

/* ---------- Sentetik demo verisi (klinik terminolojisi: Hasta = hayvan) ---------- */

interface AgendaRow {
  time: string;
  patient: string;
  species: string;
  owner: string;
  procedure: string;
  status: string;
  tone: StatusTone;
}

const AGENDA_ROWS: readonly AgendaRow[] = [
  {
    time: '09:30',
    patient: 'Tekir',
    species: 'Kedi',
    owner: 'Ayşe Yılmaz',
    procedure: 'Kombinizasyon aşısı',
    status: 'Beklemede',
    tone: 'warning',
  },
  {
    time: '10:15',
    patient: 'Pamuk',
    species: 'Kedi',
    owner: 'Mehmet Kaya',
    procedure: 'Genel muayene',
    status: 'Sürüyor',
    tone: 'info',
  },
  {
    time: '11:00',
    patient: 'Boncuk',
    species: 'Köpek',
    owner: 'Zeynep Arslan',
    procedure: 'Doğum kontrolü',
    status: 'Beklemede',
    tone: 'warning',
  },
  {
    time: '14:00',
    patient: 'Duman',
    species: 'Köpek',
    owner: 'Ali Çelik',
    procedure: 'Diş temizliği',
    status: 'Planlandı',
    tone: 'neutral',
  },
  {
    time: '16:30',
    patient: 'Minnoş',
    species: 'Tavşan',
    owner: 'Elif Şahin',
    procedure: 'Tırnak kesimi',
    status: 'Tamamlandı',
    tone: 'success',
  },
];

function LiveStatusCard() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => fetchHealth('/api/v1/health', HealthResponseSchema),
    refetchInterval: 30_000,
  });
  const readinessQuery = useQuery({
    queryKey: ['readiness'],
    queryFn: () => fetchHealth('/api/v1/health/readiness', HealthResponseSchema),
    refetchInterval: 30_000,
    retry: false,
  });

  const dbCheck = readinessQuery.data?.data.checks.find((c) => c.name === 'database');

  return (
    <Card className="min-w-0 shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Platform bileşenleri</CardTitle>
        <CardDescription>
          API sözleşmesi (zod) ile doğrulanmış canlı durum — 30 saniyede bir yenilenir.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm">
            <Server className="size-4 text-brand-600" aria-hidden="true" /> Web (Next.js)
          </span>
          <StatusChip tone="success" label="Çalışıyor" />
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm">
            <Server className="size-4 text-brand-600" aria-hidden="true" /> API (NestJS)
          </span>
          {healthQuery.isError ? (
            <StatusChip tone="danger" label="Erişilemiyor" />
          ) : (
            <StatusChip
              tone={healthQuery.data?.data.status === 'ok' ? 'success' : 'warning'}
              label={healthQuery.data?.data.status === 'ok' ? 'Çalışıyor' : 'Kısıtlı'}
            />
          )}
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm">
            <Database className="size-4 text-brand-600" aria-hidden="true" /> PostgreSQL
          </span>
          {readinessQuery.isError ? (
            <StatusChip tone="danger" label="Yanıt yok" />
          ) : dbCheck?.status === 'ok' ? (
            <StatusChip tone="success" label="Bağlı" />
          ) : (
            <StatusChip tone="warning" label="Bekleniyor" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusStories() {
  const { toast } = useToast();

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Durum hikâyeleri</CardTitle>
        <CardDescription>
          Her ekran yükleme, boş, hata ve yetkisiz durumlarını sunmak zorundadır (rules/ui-ux.md).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3 sm:grid-cols-2">
        {/* Yükleme */}
        <div className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Yükleme
          </span>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-full" />
        </div>

        {/* Boş */}
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Boş
          </span>
          <EmptyState
            title="Bugün için bekleyen görev yok"
            description="Yeni bir görev oluşturarak günün programını planlayabilirsiniz."
            action={
              <Button size="sm" variant="outline" className="min-h-9" disabled>
                Görev oluştur — Faz 05&apos;te
              </Button>
            }
          />
        </div>

        {/* Hata */}
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Hata
          </span>
          <ErrorState
            title="Veri alınamadı"
            description="Bağlantı sorunu yaşandı. Tekrar denemek için butonu kullanın."
            onRetry={() =>
              toast({
                title: 'Tekrar denendi (demo)',
                description: 'Faz 02 demo bileşeni — gerçek istek yapmaz.',
              })
            }
          />
        </div>

        {/* Yetkisiz */}
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Yetkisiz
          </span>
          <UnauthorizedState />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const queryClient = useQueryClient();

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Sayfa başlığı — 28–32px, DESIGN_SYSTEM.md > Typography */}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-bold tracking-tight">Genel Bakış</h1>
          <Badge variant="outline" className="border-brand-600/40 text-brand-700">
            Faz {String(CURRENT_PHASE_ID).padStart(2, '0')} — Tasarım sistemi ve uygulama kabukları
          </Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Kontrol paneli örnek önizlemesi: tüm değerler sentetik demo verisidir. Gerçek randevu,
          muayene ve finans modülleri sonraki fazlarda bu kabuğun içine yerleşir.
        </p>
      </header>

      {/* KPI kartları */}
      <section aria-label="Günün özeti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Bugünkü Randevular"
          value="12"
          hint="3 randevu beklemede"
          icon={CalendarCheck2}
          trend={{ direction: 'up', text: '%8 dünküye göre' }}
        />
        <KpiCard label="Bekleyen Hastalar" value="4" hint="Muayene öncesi" icon={Clock3} />
        <KpiCard
          label="Günlük Ciro"
          value="₺18.450"
          hint="Kasa: Merkez Şube"
          icon={Wallet}
          trend={{ direction: 'down', text: '%3 dünküye göre' }}
        />
        <KpiCard label="Kritik Stok" value="7" hint="Kalem minimum eşik altında" icon={PackageX} />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Bugünün programı — yoğun tablo, sağa hizalı saat sütunu.
            min-w-0: grid öğesinin tablo min-content genişliğine açılıp sayfada
            yatay taşma yaratmasını engeller (mobilde kart içinde yatay kaydırma). */}
        <Card className="min-w-0 shadow-card xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Bugünün programı</CardTitle>
            <CardDescription>
              Sentetik randevular — gerçek takvim Faz 05&apos;te bağlanacak.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20 text-right">Saat</TableHead>
                  <TableHead>Hasta</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead className="hidden sm:table-cell">Hasta Sahibi</TableHead>
                  <TableHead>İşlem</TableHead>
                  <TableHead className="text-right">Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {AGENDA_ROWS.map((row) => (
                  <TableRow key={`${row.time}-${row.patient}`}>
                    <TableCell className="tnum text-right font-medium">{row.time}</TableCell>
                    <TableCell className="font-medium">{row.patient}</TableCell>
                    <TableCell className="text-muted-foreground">{row.species}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {row.owner}
                    </TableCell>
                    <TableCell>{row.procedure}</TableCell>
                    <TableCell className="text-right">
                      <StatusChip tone={row.tone} label={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Canlı bileşen durumu — API + DB sözleşme doğrulamalı */}
        <LiveStatusCard />
      </div>

      {/* Durum hikâyeleri — kabul kriteri: loading/empty/error/unauthorized görülmeli */}
      <StatusStories />

      {/* Faz planı */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Faz planı</CardTitle>
          <CardDescription>
            Sıradaki aşama başlamadan önce ilgili fazın test promptu ve Playwright doğrulaması
            geçilmelidir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col">
            {PHASES.map((phase, index) => (
              <li key={phase.id}>
                {index > 0 && <Separator className="my-1" />}
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-sm">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      Faz {String(phase.id).padStart(2, '0')}
                    </span>
                    {phase.title}
                  </span>
                  {phase.id < CURRENT_PHASE_ID ? (
                    <StatusChip tone="success" label="Tamamlandı" />
                  ) : phase.id === CURRENT_PHASE_ID ? (
                    <Badge className="bg-brand-100 text-brand-900">Sürdürülüyor</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Planlandı
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Alt bilgi + yenile */}
      <footer className="flex flex-wrap items-center justify-between gap-4 pb-2 text-xs text-muted-foreground">
        <span>
          Demo/sentetik veri ile çalışır; gerçek klinik verisi kullanılmaz. Türkçe karakterler: İ ı
          Ş ş Ğ ğ Ü ü Ö ö Ç ç.
        </span>
        <Button
          variant="outline"
          size="sm"
          className="min-h-9 gap-2"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ['health'] });
            void queryClient.invalidateQueries({ queryKey: ['readiness'] });
          }}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" /> Yenile
        </Button>
      </footer>
    </div>
  );
}
