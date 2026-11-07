'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/design-system/state-views';
import { EncounterStatusBadge } from '@/components/encounters/encounter-status-badge';
import {
  EncounterWorkbench,
  WorkbenchSkeleton,
} from '@/components/encounters/encounter-workbench';
import type { SoapValues } from '@/components/encounters/soap-editor';
import type { VitalInput } from '@/components/encounters/vital-panel';
import type { ServiceLineInput } from '@/components/encounters/service-record-panel';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import type {
  ConsumptionInput,
  EncounterDetail,
  EncounterListItem,
  EncounterVital,
  ServiceDto,
} from '@/lib/api-types';

/**
 * Faz 06 — muayene işlemleri: hasta arama, muayene listesi, yeni muayene ve
 * workbench (SOAP/vital/tanı/hizmet/addendum). İmza kilidi API'de uygulanır;
 * arayüz de imzalı kayıtta yazma alanlarını kapatır.
 */

type PatientOption = {
  id: string;
  name: string;
  code: string;
  ownerId: string;
  branchId: string;
  owner: { id: string; firstName: string; lastName: string };
  alerts: { label: string }[];
};

export default function EncounterPage() {
  const { session, activeBranchId, hasPermission } = useAuth();
  const canManage = hasPermission('encounter.manage');
  const canSign = hasPermission('clinical.sign');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newComplaint, setNewComplaint] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const patientsQuery = useQuery({
    queryKey: ['patients', 'muayene-arama', search, activeBranchId],
    queryFn: () =>
      api<PatientOption[]>(
        `/patients?${new URLSearchParams({ ...(search ? { search } : {}), take: '8' }).toString()}`,
        { branchId: activeBranchId },
      ),
    enabled: true,
    placeholderData: keepPreviousData,
  });

  const servicesQuery = useQuery({
    queryKey: ['services', 'aktif'],
    queryFn: () => api<{ items: ServiceDto[] }>('/services?active=true'),
    enabled: true,
  });

  const encountersQuery = useQuery({
    queryKey: ['encounters', 'liste', selectedPatient?.id, activeBranchId],
    queryFn: () =>
      api<{ items: EncounterListItem[] }>(
        `/encounters?${new URLSearchParams(selectedPatient ? { patientId: selectedPatient.id } : {}).toString()}`,
        { branchId: activeBranchId },
      ),
    placeholderData: keepPreviousData,
  });

  const detailQuery = useQuery({
    queryKey: ['encounters', 'detay', selectedEncounterId],
    queryFn: () =>
      api<EncounterDetail>(`/encounters/${selectedEncounterId}`, { branchId: activeBranchId }),
    enabled: Boolean(selectedEncounterId),
  });

  const historyQuery = useQuery({
    queryKey: ['encounters', 'vital-gecmis', selectedPatient?.id],
    queryFn: () =>
      api<{ items: EncounterVital[] }>(
        `/encounters/patient/${selectedPatient?.id}/vitals`,
        { branchId: activeBranchId },
      ),
    enabled: Boolean(selectedPatient),
  });

  const invalidateEncounter = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['encounters'] });
  };

  const createEncounter = useMutation({
    mutationFn: () =>
      api<EncounterDetail>('/encounters', {
        method: 'POST',
        body: {
          patientId: selectedPatient?.id,
          veterinarianId: session?.staff.id,
          chiefComplaint: newComplaint || null,
        },
        branchId: activeBranchId,
      }),
    onSuccess: (created) => {
      setCreateOpen(false);
      setNewComplaint('');
      setSelectedEncounterId(created.id);
      setActionError(null);
      invalidateEncounter();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const patchEncounter = useMutation({
    mutationFn: (payload: { id: string; body: Record<string, unknown> }) =>
      api<EncounterDetail>(`/encounters/${payload.id}`, {
        method: 'PATCH',
        body: payload.body,
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateEncounter();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const signEncounter = useMutation({
    mutationFn: (id: string) =>
      api<EncounterDetail>(`/encounters/${id}/sign`, { method: 'POST', branchId: activeBranchId }),
    onSuccess: () => {
      setActionError(null);
      invalidateEncounter();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const closeEncounter = useMutation({
    mutationFn: (id: string) =>
      api<EncounterDetail>(`/encounters/${id}/close`, { method: 'POST', branchId: activeBranchId }),
    onSuccess: () => {
      setActionError(null);
      invalidateEncounter();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const vitalMutation = useMutation({
    mutationFn: (payload: { id: string; vital: VitalInput }) =>
      api<EncounterDetail>(`/encounters/${payload.id}/vitals`, {
        method: 'POST',
        body: payload.vital,
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateEncounter();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const diagnosisMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      body?: { name: string; code: string; kind: string; note: string };
      removeId?: string;
    }) =>
      payload.removeId
        ? api<unknown>(`/encounters/${payload.id}/diagnoses/${payload.removeId}`, {
            method: 'DELETE',
            branchId: activeBranchId,
          })
        : api<unknown>(`/encounters/${payload.id}/diagnoses`, {
            method: 'POST',
            body: payload.body,
            branchId: activeBranchId,
          }),
    onSuccess: () => {
      setActionError(null);
      invalidateEncounter();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const serviceRecordMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      lines?: ServiceLineInput[];
      removeId?: string;
      finalizeId?: string;
      finalize?: { consumptions: ConsumptionInput[]; idempotencyKey: string };
      reverseId?: string;
      reason?: string;
    }) => {
      if (payload.removeId) {
        return api<unknown>(`/encounters/${payload.id}/service-records/${payload.removeId}`, {
          method: 'DELETE',
          branchId: activeBranchId,
        });
      }
      if (payload.finalizeId) {
        // Faz 08: atomik finalize — tüketim onayı + idempotency anahtarı (mobil retry).
        return api<unknown>(
          `/encounters/${payload.id}/service-records/${payload.finalizeId}/finalize`,
          {
            method: 'POST',
            body: {
              consumptions: payload.finalize?.consumptions ?? [],
              idempotencyKey: payload.finalize?.idempotencyKey,
            },
            branchId: activeBranchId,
          },
        );
      }
      if (payload.reverseId) {
        return api<unknown>(
          `/encounters/${payload.id}/service-records/${payload.reverseId}/reverse`,
          {
            method: 'POST',
            body: { reason: payload.reason ?? '' },
            branchId: activeBranchId,
          },
        );
      }
      return api<unknown>(`/encounters/${payload.id}/service-records`, {
        method: 'POST',
        body: { lines: payload.lines ?? [] },
        branchId: activeBranchId,
      });
    },
    onSuccess: () => {
      setActionError(null);
      invalidateEncounter();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const addendumMutation = useMutation({
    mutationFn: (payload: { id: string; body: string }) =>
      api<unknown>(`/encounters/${payload.id}/addendums`, {
        method: 'POST',
        body: { body: payload.body },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateEncounter();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const busy =
    createEncounter.isPending ||
    patchEncounter.isPending ||
    signEncounter.isPending ||
    vitalMutation.isPending ||
    diagnosisMutation.isPending ||
    serviceRecordMutation.isPending ||
    addendumMutation.isPending;

  const patientOptions = patientsQuery.data ?? [];
  const encounterList = useMemo(
    () => encountersQuery.data?.items ?? [],
    [encountersQuery.data],
  );
  const services = servicesQuery.data?.items ?? [];
  const detail = detailQuery.data;
  const history = historyQuery.data?.items ?? [];

  function handleSaveSoap(values: SoapValues): void {
    if (!detail) return;
    patchEncounter.mutate({
      id: detail.id,
      body: {
        chiefComplaint: values.chiefComplaint,
        subjective: values.subjective,
        objective: values.objective,
        assessment: values.assessment,
        plan: values.plan,
        notes: values.notes,
        // Taslaktan devam aşamasına otomatik geçiş (API yalnız bu geçişi kabul eder)
        ...(detail.status === 'draft' ? { status: 'in_progress' } : {}),
      },
    });
  }

  return (
    <div
      className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]"
      data-testid="muayene-page"
    >
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hasta veya sahip ara…"
                aria-label="Hasta ara"
                className="pl-9"
                data-testid="muayene-patient-search"
              />
            </div>
            {patientsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : patientOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sonuç yok.</p>
            ) : (
              <ul className="space-y-1.5" data-testid="muayene-patient-list">
                {patientOptions.map((patient) => (
                  <li key={patient.id}>
                    <button
                      type="button"
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        selectedPatient?.id === patient.id
                          ? 'border-brand-300 bg-brand-50'
                          : 'border-border bg-card hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        setSelectedPatient(patient);
                        setSelectedEncounterId(null);
                      }}
                    >
                      <span className="font-medium">{patient.name}</span>
                      <span className="ml-1 text-muted-foreground">({patient.code})</span>
                      <span className="block text-xs text-muted-foreground">
                        {patient.owner.firstName} {patient.owner.lastName}
                      </span>
                      {patient.alerts.length > 0 ? (
                        <span className="mt-1 block text-xs font-medium text-status-warning">
                          {patient.alerts[0]?.label}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {selectedPatient ? (
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Muayene kayıtları</h2>
                {canManage ? (
                  <Button
                    type="button"
                    size="sm"
                    data-testid="muayene-yeni"
                    disabled={busy}
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus aria-hidden="true" />
                    Yeni Muayene
                  </Button>
                ) : null}
              </div>
              {encounterList.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="muayene-liste-bos">
                  Bu hasta için muayene kaydı yok.
                </p>
              ) : (
                <ul className="space-y-1.5" data-testid="muayene-liste">
                  {encounterList.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                          selectedEncounterId === item.id
                            ? 'border-brand-300 bg-brand-50'
                            : 'border-border bg-card hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedEncounterId(item.id)}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {item.chiefComplaint || 'Başvuru şikâyeti girilmedi'}
                          </span>
                          <EncounterStatusBadge status={item.status} />
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {new Date(item.startedAt).toLocaleDateString('tr-TR')} ·{' '}
                          {item.veterinarian.firstName} {item.veterinarian.lastName}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            Muayene listesi için önce hasta seçin.
          </p>
        )}
      </div>

      <div>
        {actionError ? (
          <div
            role="alert"
            className="mb-4 rounded-md border border-[var(--status-danger-border,var(--border))] bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-status-danger"
          >
            {actionError}
          </div>
        ) : null}

        {!selectedPatient ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Soldaki aramadan bir hasta seçin veya yeni muayene başlatın.
            </CardContent>
          </Card>
        ) : detailQuery.isLoading && selectedEncounterId ? (
          <WorkbenchSkeleton />
        ) : detail && selectedEncounterId === detail.id ? (
          <EncounterWorkbench
            encounter={detail}
            services={services}
            patientHistory={history}
            canManage={canManage}
            canSign={canSign}
            saving={busy}
            signing={signEncounter.isPending}
            onSaveSoap={handleSaveSoap}
            onAddVital={(vital) => vitalMutation.mutate({ id: detail.id, vital })}
            onAddDiagnosis={(input) =>
              diagnosisMutation.mutate({ id: detail.id, body: input })
            }
            onRemoveDiagnosis={(diagnosisId) =>
              diagnosisMutation.mutate({ id: detail.id, removeId: diagnosisId })
            }
            onAddServiceRecord={(lines) =>
              serviceRecordMutation.mutate({ id: detail.id, lines })
            }
            onRemoveServiceRecord={(recordId) =>
              serviceRecordMutation.mutate({ id: detail.id, removeId: recordId })
            }
            onFinalizeServiceRecord={(recordId, consumptions, idempotencyKey) =>
              serviceRecordMutation.mutate({
                id: detail.id,
                finalizeId: recordId,
                finalize: { consumptions, idempotencyKey },
              })
            }
            onReverseServiceRecord={(recordId, reason) =>
              serviceRecordMutation.mutate({ id: detail.id, reverseId: recordId, reason })
            }
            onAddAddendum={(body) => addendumMutation.mutate({ id: detail.id, body })}
            onSign={() => signEncounter.mutate(detail.id)}
            onClose={() => closeEncounter.mutate(detail.id)}
          />
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Workbench için bir muayene kaydı seçin veya &quot;Yeni Muayene&quot; ile başlatın.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="muayene-yeni-dialog">
          <DialogHeader>
            <DialogTitle>Yeni Muayene</DialogTitle>
            <DialogDescription>
              {selectedPatient?.name} için taslak muayene kaydı oluşturulur; SOAP alanlarını
              workbench&apos;te doldurup imzalarsınız.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={newComplaint}
            onChange={(e) => setNewComplaint(e.target.value)}
            placeholder="Başvuru şikâyeti (opsiyonel, sonra da doldurulabilir)"
            data-testid="muayene-yeni-sikayet"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              data-testid="muayene-yeni-kaydet"
              disabled={busy}
              onClick={() => createEncounter.mutate()}
            >
              {busy ? 'Oluşturuluyor…' : 'Taslak Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
