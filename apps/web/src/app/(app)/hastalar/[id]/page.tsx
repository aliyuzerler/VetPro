'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, CircleSlash, Hash, Microchip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/design-system/state-views';
import { PatientAlerts } from '@/components/patients/patient-alerts';
import { WeightHistory } from '@/components/patients/weight-history';
import { PatientFiles } from '@/components/patients/patient-files';
import { TimelineFeed } from '@/components/patients/timeline-feed';
import { ArchivePatientDialog } from '@/components/patients/patient-dialogs';
import { useToast } from '@/hooks/use-toast';
import { api, apiDownload, apiUpload } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type {
  FileAssetMeta,
  PatientAlert,
  PatientDetail,
  PatientSummary,
  TimelineEvent,
} from '@/lib/api-types';

const GENDER_LABELS: Record<string, string> = {
  female: 'Dişi',
  male: 'Erkek',
  unknown: 'Bilinmiyor',
};

function formatAge(birthDate: string | null): string {
  if (!birthDate) return 'Yaş bilinmiyor';
  const birth = new Date(birthDate);
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return 'Yaş bilinmiyor';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return years > 0 ? `${years} yaş ${rest} ay` : `${rest} aylık`;
}

/** Faz 04 — hasta detayı: uyarılar, kilo, dosyalar ve zaman çizelgesi iskeleti. */
export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = hasPermission('patient.manage');

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const patientQuery = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => api<PatientDetail>(`/patients/${patientId}`),
  });

  const filesQuery = useQuery({
    queryKey: ['patient-files', patientId],
    queryFn: () => api<FileAssetMeta[]>(`/file-assets?patientId=${patientId}`),
  });

  const timelineQuery = useQuery({
    queryKey: ['patient-timeline', patientId],
    queryFn: () => api<TimelineEvent[]>(`/patients/${patientId}/timeline`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
    void queryClient.invalidateQueries({ queryKey: ['patient-timeline', patientId] });
    void queryClient.invalidateQueries({ queryKey: ['patients'] });
  };

  const addAlertMutation = useMutation({
    mutationFn: (input: {
      kind: PatientAlert['kind'];
      label: string;
      severity: 'low' | 'medium' | 'high';
    }) => api<PatientAlert>(`/patients/${patientId}/alerts`, { method: 'POST', body: input }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Uyarı eklendi' });
    },
    onError: (error: Error) => {
      toast({ title: 'Uyarı eklenemedi', description: error.message, variant: 'destructive' });
    },
  });

  const resolveAlertMutation = useMutation({
    mutationFn: ({ alertId, active }: { alertId: string; active: boolean }) =>
      api<PatientAlert>(`/patients/${patientId}/alerts/${alertId}`, {
        method: 'PATCH',
        body: { active },
      }),
    onSuccess: () => {
      invalidate();
    },
    onError: (error: Error) => {
      toast({ title: 'Uyarı güncellenemedi', description: error.message, variant: 'destructive' });
    },
  });

  const addWeightMutation = useMutation({
    mutationFn: (input: { weightKg: number; note?: string }) =>
      api(`/patients/${patientId}/weights`, { method: 'POST', body: input }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Kilo kaydı eklendi' });
    },
    onError: (error: Error) => {
      toast({ title: 'Kilo kaydı eklenemedi', description: error.message, variant: 'destructive' });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (reason: string) =>
      api<PatientSummary>(`/patients/${patientId}/archive`, { method: 'PATCH', body: { reason } }),
    onSuccess: () => {
      invalidate();
      setArchiveOpen(false);
      toast({ title: 'Hasta arşivlendi', description: 'Sebep denetim defterine yazıldı.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Arşivlenemedi', description: error.message, variant: 'destructive' });
    },
  });

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('patientId', patientId);
      formData.append('file', file);
      await apiUpload<FileAssetMeta>('/file-assets/upload', formData);
      void queryClient.invalidateQueries({ queryKey: ['patient-files', patientId] });
      void queryClient.invalidateQueries({ queryKey: ['patient-timeline', patientId] });
      toast({ title: 'Dosya yüklendi', description: file.name });
    } catch (error) {
      toast({
        title: 'Yükleme başarısız',
        description: error instanceof Error ? error.message : 'Bilinmeyen hata',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(file: FileAssetMeta) {
    setDownloadingId(file.id);
    try {
      await apiDownload(`/file-assets/${file.id}/download`, file.fileName);
    } catch (error) {
      toast({
        title: 'İndirme başarısız',
        description: error instanceof Error ? error.message : 'Bilinmeyen hata',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  }

  if (patientQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (patientQuery.isError || !patientQuery.data) {
    return (
      <ErrorState
        title="Hasta yüklenemedi"
        description={
          patientQuery.error instanceof Error
            ? patientQuery.error.message
            : 'Kayıt bulunamadı veya bu şube için yetkiniz yok.'
        }
        onRetry={() => void patientQuery.refetch()}
      />
    );
  }

  const patient = patientQuery.data;
  const archived = Boolean(patient.archivedAt);
  const activeAlerts = patient.alerts.filter((alert) => alert.active);

  return (
    <div className="flex flex-col gap-6" data-testid="patient-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit"
            onClick={() => router.push('/hastalar')}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Hastalar
          </Button>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {patient.name}
            <Badge variant="secondary">{patient.code}</Badge>
            {archived ? <Badge variant="outline">Arşiv</Badge> : null}
            {activeAlerts.some((alert) => alert.severity === 'high') ? (
              <Badge variant="destructive">Kritik uyarı</Badge>
            ) : null}
          </h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              {patient.species.name}
              {patient.breed ? ` · ${patient.breed.name}` : ''}
            </span>
            <span>· {GENDER_LABELS[patient.gender] ?? patient.gender}</span>
            <span>· {formatAge(patient.birthDate)}</span>
            <span>· {patient.neutered ? 'Kısırlaştırılmış' : 'Kısırlaştırılmamış'}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden />
              Şube: {patient.branch.name}
            </span>
            {patient.microchip ? (
              <span className="flex items-center gap-1">
                <Microchip className="size-3.5" aria-hidden />
                Çip: {patient.microchip}
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Hash className="size-3.5" aria-hidden />
              Sahip: {patient.owner.firstName} {patient.owner.lastName}
            </span>
          </p>
        </div>
        {canManage && !archived ? (
          <Button type="button" variant="outline" onClick={() => setArchiveOpen(true)}>
            <CircleSlash className="size-4" aria-hidden />
            Arşivle
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alerji ve Kronik Uyarılar</CardTitle>
          <CardDescription>
            Aktif uyarılar listede ve burada görünür; çözülenler geçmişe düşer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatientAlerts
            alerts={patient.alerts}
            canManage={canManage && !archived}
            onResolve={(alertId) => resolveAlertMutation.mutate({ alertId, active: false })}
            onReopen={(alertId) => resolveAlertMutation.mutate({ alertId, active: true })}
            onAdd={(input) => addAlertMutation.mutate(input)}
            busy={addAlertMutation.isPending || resolveAlertMutation.isPending}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kilo Geçmişi</CardTitle>
            <CardDescription>Doz hesabı için tüm ölçümler saklanır.</CardDescription>
          </CardHeader>
          <CardContent>
            <WeightHistory
              observations={patient.weights}
              canManage={canManage && !archived}
              onAdd={(input) => addWeightMutation.mutate(input)}
              busy={addWeightMutation.isPending}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dosyalar</CardTitle>
            <CardDescription>
              Private storage: indirme yetki kontrollüdür, dışa URL sızmaz.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PatientFiles
              files={filesQuery.data ?? []}
              canManage={canManage && !archived}
              onUpload={(file) => void handleUpload(file)}
              onDownload={(file) => void handleDownload(file)}
              uploading={uploading}
              downloadingId={downloadingId}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Zaman Çizelgesi</CardTitle>
          <CardDescription>
            Kilo, uyarı, dosya ve kayıt olayları. Muayene akışı (SOAP) Faz 06&apos;da bu iskelete
            eklenecek.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timelineQuery.isLoading ? (
            <Skeleton className="h-40" />
          ) : timelineQuery.isError ? (
            <p className="text-sm text-muted-foreground">Zaman çizelgesi yüklenemedi.</p>
          ) : (
            <TimelineFeed events={timelineQuery.data ?? []} />
          )}
        </CardContent>
      </Card>

      <Separator />

      <ArchivePatientDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        patientName={`${patient.name} (${patient.code})`}
        onConfirm={(reason) => archiveMutation.mutate(reason)}
        busy={archiveMutation.isPending}
      />
    </div>
  );
}
