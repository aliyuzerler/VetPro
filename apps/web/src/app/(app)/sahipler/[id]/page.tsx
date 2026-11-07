'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, GitMerge, Mail, MapPin, Phone, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/design-system/state-views';
import { OwnerPatientsTable } from '@/components/owners/owner-patients-table';
import { ArchiveOwnerDialog, MergeOwnerDialog } from '@/components/owners/owner-dialogs';
import {
  EMPTY_PATIENT_FORM,
  PatientFormDialog,
  type PatientFormValues,
} from '@/components/patients/patient-form-dialog';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type { OwnerDetail, OwnerSummary, PatientSummary, SpeciesOption } from '@/lib/api-types';

const CONSENT_LABELS: Record<string, string> = {
  kvkk: 'KVKK',
  sms: 'SMS',
  email: 'E-posta',
  whatsapp: 'WhatsApp',
  marketing: 'Pazarlama',
};

/** Faz 04 — sahip detayı: iletişim, rızalar, hastalar, arşiv/merge işlemleri. */
export default function OwnerDetailPage() {
  const params = useParams<{ id: string }>();
  const ownerId = params.id;
  const router = useRouter();
  const { hasPermission, session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = hasPermission('owner.manage');

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [patientForm, setPatientForm] = useState<PatientFormValues>(EMPTY_PATIENT_FORM);

  const ownerQuery = useQuery({
    queryKey: ['owner', ownerId],
    queryFn: () => api<OwnerDetail>(`/owners/${ownerId}`),
  });

  const speciesQuery = useQuery({
    queryKey: ['species'],
    queryFn: () => api<SpeciesOption[]>('/species'),
    enabled: patientOpen,
  });

  const mergeCandidatesQuery = useQuery({
    queryKey: ['owners', 'merge-candidates'],
    queryFn: () => api<OwnerSummary[]>('/owners?take=100'),
    enabled: mergeOpen,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['owner', ownerId] });
    void queryClient.invalidateQueries({ queryKey: ['owners'] });
  };

  const archiveMutation = useMutation({
    mutationFn: (reason: string) =>
      api<OwnerDetail>(`/owners/${ownerId}/archive`, { method: 'PATCH', body: { reason } }),
    onSuccess: () => {
      invalidate();
      setArchiveOpen(false);
      toast({ title: 'Sahip arşivlendi', description: 'Sebep denetim defterine yazıldı.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Arşivlenemedi', description: error.message, variant: 'destructive' });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => api<OwnerDetail>(`/owners/${ownerId}/unarchive`, { method: 'PATCH' }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Sahip arşivden çıkarıldı' });
    },
    onError: (error: Error) => {
      toast({ title: 'İşlem başarısız', description: error.message, variant: 'destructive' });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: (input: { intoOwnerId: string; reason: string }) =>
      api<OwnerDetail>(`/owners/${ownerId}/merge`, { method: 'POST', body: input }),
    onSuccess: (merged) => {
      invalidate();
      setMergeOpen(false);
      toast({
        title: 'Sahipler birleştirildi',
        description: `Hastalar hedef sahibe taşındı ve ${merged.firstName} ${merged.lastName} arşivlendi.`,
      });
      router.push(`/sahipler/${merged.mergedIntoOwnerId}`);
    },
    onError: (error: Error) => {
      toast({ title: 'Birleştirilemedi', description: error.message, variant: 'destructive' });
    },
  });

  const createPatientMutation = useMutation({
    mutationFn: (values: PatientFormValues) =>
      api<PatientSummary>(`/owners/${ownerId}/patients`, {
        method: 'POST',
        body: {
          name: values.name.trim(),
          speciesId: values.speciesId,
          breedId: values.breedId || null,
          gender: values.gender,
          birthDate: values.birthDate || null,
          microchip: values.microchip.trim() || null,
          neutered: values.neutered,
          color: values.color.trim() || null,
          ...(values.initialWeightKg.trim()
            ? { initialWeightKg: Number.parseFloat(values.initialWeightKg.replace(',', '.')) }
            : {}),
          ...(values.alertLabel.trim()
            ? { alerts: [{ kind: values.alertKind, label: values.alertLabel.trim() }] }
            : {}),
        },
      }),
    onSuccess: (patient) => {
      invalidate();
      setPatientOpen(false);
      setPatientForm(EMPTY_PATIENT_FORM);
      toast({ title: 'Hasta kaydedildi', description: `Hasta kodu: ${patient.code}` });
    },
    onError: (error: Error) => {
      toast({ title: 'Hasta kaydedilemedi', description: error.message, variant: 'destructive' });
    },
  });

  const mergeCandidates = useMemo(
    () =>
      (mergeCandidatesQuery.data ?? []).filter(
        (candidate) => candidate.id !== ownerId && !candidate.archivedAt,
      ),
    [mergeCandidatesQuery.data, ownerId],
  );

  if (ownerQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (ownerQuery.isError || !ownerQuery.data) {
    return (
      <ErrorState
        title="Sahip yüklenemedi"
        description={
          ownerQuery.error instanceof Error ? ownerQuery.error.message : 'Kayıt bulunamadı'
        }
        onRetry={() => void ownerQuery.refetch()}
      />
    );
  }

  const owner = ownerQuery.data;
  const fullName = `${owner.firstName} ${owner.lastName}`;
  const archived = Boolean(owner.archivedAt);
  const branchName = session?.activeBranch?.name ?? 'Aktif şube';

  return (
    <div className="flex flex-col gap-6" data-testid="owner-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit"
            onClick={() => router.push('/sahipler')}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Sahipler
          </Button>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {fullName}
            {owner.mergedIntoOwnerId ? (
              <Badge variant="outline">Birleştirildi</Badge>
            ) : archived ? (
              <Badge variant="outline">Arşiv</Badge>
            ) : (
              <Badge variant="secondary">Aktif</Badge>
            )}
          </h1>
          {archived && owner.archivedReason ? (
            <p className="text-sm text-muted-foreground">Arşiv sebebi: {owner.archivedReason}</p>
          ) : null}
        </div>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {owner.mergedIntoOwnerId ? null : archived ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => unarchiveMutation.mutate()}
                disabled={unarchiveMutation.isPending}
              >
                <RotateCcw className="size-4" aria-hidden />
                Arşivden çıkar
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setMergeOpen(true)}>
                  <GitMerge className="size-4" aria-hidden />
                  Birleştir
                </Button>
                <Button type="button" variant="outline" onClick={() => setArchiveOpen(true)}>
                  <Archive className="size-4" aria-hidden />
                  Arşivle
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">İletişim</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm" data-testid="owner-contacts">
            {owner.contacts.length === 0 ? (
              <p className="text-muted-foreground">Kayıtlı iletişim yok.</p>
            ) : (
              owner.contacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-2">
                  {contact.kind === 'phone' ? (
                    <Phone className="size-4 text-muted-foreground" aria-hidden />
                  ) : (
                    <Mail className="size-4 text-muted-foreground" aria-hidden />
                  )}
                  <span>{contact.value}</span>
                  {contact.label ? (
                    <Badge variant="outline" className="text-xs">
                      {contact.label}
                    </Badge>
                  ) : null}
                </div>
              ))
            )}
            {owner.address ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-4" aria-hidden />
                <span>{owner.address}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rızalar</CardTitle>
            <CardDescription>KVKK ve iletişim tercihleri</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5" data-testid="owner-consents">
            {owner.consents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Rıza kaydı yok.</p>
            ) : (
              owner.consents.map((consent) => (
                <Badge key={consent.id} variant={consent.granted ? 'secondary' : 'outline'}>
                  {CONSENT_LABELS[consent.kind] ?? consent.kind}:{' '}
                  {consent.granted ? 'Açık' : 'Kapalı'}
                </Badge>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kayıt Bilgisi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span>Kayıt: {new Date(owner.createdAt).toLocaleDateString('tr-TR')}</span>
            <span>Güncelleme: {new Date(owner.updatedAt).toLocaleDateString('tr-TR')}</span>
            {owner.notes ? <span className="text-foreground">Not: {owner.notes}</span> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hastalar</CardTitle>
          <CardDescription>
            Bir sahip altında birden fazla hasta kaydı tutulabilir; yeni hasta kayıt şubesine
            bağlanır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OwnerPatientsTable
            ownerId={owner.id}
            patients={owner.patients}
            canManage={canManage && !archived}
            onAdd={() => setPatientOpen(true)}
          />
        </CardContent>
      </Card>

      <ArchiveOwnerDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        ownerName={fullName}
        onConfirm={(reason) => archiveMutation.mutate(reason)}
        busy={archiveMutation.isPending}
      />

      <MergeOwnerDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        sourceName={fullName}
        candidates={mergeCandidates}
        onConfirm={(intoOwnerId, reason) => mergeMutation.mutate({ intoOwnerId, reason })}
        busy={mergeMutation.isPending}
      />

      <PatientFormDialog
        open={patientOpen}
        onOpenChange={setPatientOpen}
        ownerName={fullName}
        branchName={branchName}
        species={speciesQuery.data ?? []}
        values={patientForm}
        onValuesChange={setPatientForm}
        onSubmit={(values) => createPatientMutation.mutate(values)}
        busy={createPatientMutation.isPending}
      />
    </div>
  );
}
