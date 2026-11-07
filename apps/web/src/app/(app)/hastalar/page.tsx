'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/design-system/state-views';
import { PatientSearchList } from '@/components/patients/patient-search-list';
import { api } from '@/lib/api-client';
import type { PatientSummary, SpeciesOption } from '@/lib/api-types';

/**
 * Faz 04 — Hasta listesi. Şube kapsamı API'de uygulanır: kullanıcının erişimi
 * olmayan şubelerin hasta kayıtları listelenmez (kabul kriteri).
 */
export default function PatientsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('all');

  const patientsQuery = useQuery({
    queryKey: ['patients', query, speciesFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (query) params.set('search', query);
      if (speciesFilter !== 'all') params.set('speciesId', speciesFilter);
      const qs = params.toString();
      return api<PatientSummary[]>(`/patients${qs ? `?${qs}` : ''}`);
    },
    placeholderData: keepPreviousData,
  });

  const speciesQuery = useQuery({
    queryKey: ['species'],
    queryFn: () => api<SpeciesOption[]>('/species'),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Heart className="size-6 text-brand-700" aria-hidden />
          Hasta Listesi
        </h1>
        <p className="text-sm text-muted-foreground">
          Hasta adı, kod, mikroçip veya sahip bilgisiyle arayın. Alerji ve kronik hastalık uyarıları
          listede görünür.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hasta Kayıtları</CardTitle>
          <CardDescription>
            Yalnızca erişim yetkiniz olan şubelerin kayıtları listelenir; şube değiştirmek için üst
            çubuktaki şube seçicisini kullanın.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {patientsQuery.isLoading ? (
            <Skeleton className="h-64" />
          ) : patientsQuery.isError ? (
            <ErrorState
              title="Hastalar yüklenemedi"
              description={
                patientsQuery.error instanceof Error
                  ? patientsQuery.error.message
                  : 'Bilinmeyen hata'
              }
              onRetry={() => void patientsQuery.refetch()}
            />
          ) : (
            <PatientSearchList
              patients={patientsQuery.data ?? []}
              query={query}
              onQueryChange={setQuery}
              species={speciesQuery.data ?? []}
              speciesFilter={speciesFilter}
              onSpeciesFilterChange={setSpeciesFilter}
              onOpen={(id) => router.push(`/hastalar/${id}`)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
