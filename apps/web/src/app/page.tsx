'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  Server,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { HealthResponseSchema, type HealthResponse } from '@vetcore/contracts';
import { CURRENT_PHASE_ID, PHASES } from '@vetcore/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
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

function statusBadge(status: HealthResponse['status'] | undefined, label: string) {
  if (!status || status === 'down') {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="size-3" aria-hidden="true" /> {label}
      </Badge>
    );
  }
  if (status === 'degraded') {
    return (
      <Badge className="gap-1 border border-amber-600/30 bg-amber-100 text-amber-800">
        <AlertTriangle className="size-3" aria-hidden="true" /> Kısıtlı
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-emerald-100 text-emerald-800">
      <CheckCircle2 className="size-3" aria-hidden="true" /> {label}
    </Badge>
  );
}

function StatusCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-6 w-24" />
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const queryClient = useQueryClient();

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
  const apiUp = healthQuery.isSuccess;
  const isLoading = healthQuery.isPending;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-[#173b39]">VetCore</h1>
          <Badge variant="outline" className="border-[#28847c]/40 text-[#216a64]">
            Faz {String(CURRENT_PHASE_ID).padStart(2, '0')} — Monorepo ve altyapı
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Veteriner Klinik Yönetim Platformu — web, API, worker ve mobil iskeletinin kurulu olduğu
          temel altyapı aşaması. Bu sayfa uygulama kabuğu değildir; Faz 02&apos;de tasarım sistemi ile
          birlikte inşa edilecektir.
        </p>
      </header>

      <section aria-label="Bileşen durumları" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <>
            <StatusCardSkeleton />
            <StatusCardSkeleton />
            <StatusCardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="size-4 text-[#28847c]" aria-hidden="true" /> Web
                </CardTitle>
                <CardDescription>Next.js 16 geliştirme sunucusu</CardDescription>
              </CardHeader>
              <CardContent>{statusBadge('ok', 'Çalışıyor')}</CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="size-4 text-[#28847c]" aria-hidden="true" /> API
                </CardTitle>
                <CardDescription>NestJS — /api/v1/health</CardDescription>
              </CardHeader>
              <CardContent>
                {healthQuery.isError ? (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="size-3" aria-hidden="true" /> Erişilemiyor
                  </Badge>
                ) : (
                  statusBadge(healthQuery.data?.data.status, 'Çalışıyor')
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="size-4 text-[#28847c]" aria-hidden="true" /> PostgreSQL
                </CardTitle>
                <CardDescription>Prisma — readiness kontrolü</CardDescription>
              </CardHeader>
              <CardContent>
                {readinessQuery.isError && apiUp ? (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="size-3" aria-hidden="true" /> Yanıt yok
                  </Badge>
                ) : (
                  statusBadge(dbCheck?.status, dbCheck?.status === 'ok' ? 'Bağlı' : 'Bekleniyor')
                )}
              </CardContent>
            </Card>
          </>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="size-4 text-[#28847c]" aria-hidden="true" /> Kurulu
            çalışma alanları
          </CardTitle>
          <CardDescription>
            Faz 01 kapsamında ayakta kaldırılan monorepo paketleri
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">apps/web</Badge>
          <Badge variant="secondary">apps/api</Badge>
          <Badge variant="secondary">apps/worker</Badge>
          <Badge variant="secondary">apps/mobile</Badge>
          <Badge variant="secondary">packages/contracts</Badge>
          <Badge variant="secondary">packages/domain</Badge>
          <Badge variant="secondary">packages/ui-tokens</Badge>
          <Badge variant="secondary">packages/config</Badge>
          <Badge variant="secondary">prisma + seed</Badge>
          <Badge variant="secondary">docker-compose altyapısı</Badge>
          <Badge variant="secondary">CI pipeline</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faz planı</CardTitle>
          <CardDescription>
            Sıradaki aşama başlamadan önce ilgili fazın test promptu geçilmelidir.
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
                    <Badge className="bg-emerald-100 text-emerald-800">Tamamlandı</Badge>
                  ) : phase.id === CURRENT_PHASE_ID ? (
                    <Badge className="bg-[#ddf3ef] text-[#173b39]">Sürdürülüyor</Badge>
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

      <footer className="mt-auto flex items-center justify-between gap-4 pb-4 text-xs text-muted-foreground">
        <span>
          Demo/sentetik veri ile çalışır; gerçek klinik verisi kullanılmaz.{" "}
          {healthQuery.data?.data.version
            ? `API sürümü: ${healthQuery.data.data.version}.`
            : null}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ['health'] });
            void queryClient.invalidateQueries({ queryKey: ['readiness'] });
          }}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" /> Yenile
        </Button>
      </footer>
    </main>
  );
}
