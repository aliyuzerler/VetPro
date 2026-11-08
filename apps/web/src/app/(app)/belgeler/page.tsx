'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DocumentTypeBadge } from '@/components/documents/document-type-badge';
import { ErrorState } from '@/components/design-system/state-views';
import { useAuth } from '@/lib/auth-context';
import { api, apiBlobUrl, ApiError } from '@/lib/api-client';
import type {
  DocumentKind,
  OwnerSummary,
  PatientSummary,
  PrintDocumentDto,
  PrintDocumentListResponse,
} from '@/lib/api-types';
import { DOCUMENT_KIND_CATALOG } from '@/lib/api-types';

interface EncounterOption {
  id: string;
  code?: string;
  patient?: { name?: string } | null;
  startedAt?: string;
}

interface PrescriptionOption {
  id: string;
  code?: string | null;
  status?: string;
  patient?: { name?: string } | null;
}

interface LabOrderOption {
  id: string;
  status?: string;
  test?: { name?: string } | null;
  patient?: { name?: string } | null;
}

interface HospitalStayOption {
  id: string;
  status?: string;
  patient?: { name?: string } | null;
  kennel?: { code?: string } | null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function BelgelerPage() {
  const { hasPermission, activeBranchId } = useAuth();
  const canManage = hasPermission('document.manage');
  const queryClient = useQueryClient();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [kind, setKind] = useState<DocumentKind>('exam_summary');
  const [refId, setRefId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['documents', 'list', activeBranchId],
    queryFn: () => api<PrintDocumentListResponse>('/documents?take=100'),
    enabled: canManage,
  });

  const kindMeta = useMemo(
    () => DOCUMENT_KIND_CATALOG.find((entry) => entry.value === kind) ?? null,
    [kind],
  );

  const ownersQuery = useQuery({
    queryKey: ['documents', 'owner-options', activeBranchId],
    queryFn: () => api<OwnerSummary[]>('/owners?take=100'),
    enabled: canManage && generateOpen && kind === 'consent',
  });

  const patientsQuery = useQuery({
    queryKey: ['documents', 'patient-options', activeBranchId],
    queryFn: () => api<PatientSummary[]>('/patients'),
    enabled: canManage && generateOpen && kind === 'vaccine_card',
  });

  const encountersQuery = useQuery({
    queryKey: ['documents', 'encounter-options', activeBranchId],
    queryFn: () => api<{ items: EncounterOption[] }>('/encounters'),
    enabled: canManage && generateOpen && kind === 'exam_summary',
  });

  const prescriptionsQuery = useQuery({
    queryKey: ['documents', 'prescription-options', activeBranchId],
    queryFn: () => api<{ items: PrescriptionOption[] }>('/prescriptions?take=50'),
    enabled: canManage && generateOpen && kind === 'prescription',
  });

  const labOrdersQuery = useQuery({
    queryKey: ['documents', 'lab-order-options', activeBranchId],
    queryFn: () => api<{ items: LabOrderOption[] }>('/lab/orders?take=50'),
    enabled: canManage && generateOpen && kind === 'lab_report',
  });

  const staysQuery = useQuery({
    queryKey: ['documents', 'stay-options', activeBranchId],
    queryFn: () => api<{ items: HospitalStayOption[] }>('/hospital/stays?take=50'),
    enabled: canManage && generateOpen && kind === 'discharge',
  });

  const refOptions = useMemo<{ id: string; label: string }[]>(() => {
    switch (kind) {
      case 'exam_summary':
        return (
          encountersQuery.data?.items.map((encounter, index) => ({
            id: encounter.id,
            label: `Muayene #${index + 1} — ${encounter.patient?.name ?? ''} (${formatDateTime(encounter.startedAt ?? '')})`,
          })) ?? []
        );
      case 'vaccine_card':
        return patientsQuery.data?.map((p) => ({ id: p.id, label: `${p.name} (${p.code})` })) ?? [];
      case 'prescription':
        return (
          prescriptionsQuery.data?.items.map((rx) => ({
            id: rx.id,
            label: `${rx.code ?? 'Taslak'} — ${rx.patient?.name ?? ''} (${rx.status === 'signed' ? 'İmzalı' : 'Taslak'})`,
          })) ?? []
        );
      case 'consent':
        return ownersQuery.data?.map((o) => ({ id: o.id, label: `${o.firstName} ${o.lastName}` })) ?? [];
      case 'lab_report':
        return (
          labOrdersQuery.data?.items.map((order) => ({
            id: order.id,
            label: `${order.test?.name ?? 'Test'} — ${order.patient?.name ?? ''} (${order.status})`,
          })) ?? []
        );
      case 'discharge':
        return (
          staysQuery.data?.items
            .filter((stay) => stay.status === 'discharged')
            .map((stay) => ({
              id: stay.id,
              label: `${stay.patient?.name ?? ''} — Kafes ${stay.kennel?.code ?? '—'} (taburcu)`,
            })) ?? []
        );
      default:
        return [];
    }
  }, [kind, encountersQuery.data, patientsQuery.data, prescriptionsQuery.data, ownersQuery.data, labOrdersQuery.data, staysQuery.data]);

  const generateMutation = useMutation({
    mutationFn: () =>
      api<PrintDocumentDto>('/documents/print', { method: 'POST', body: { kind, refId } }),
    onSuccess: (document) => {
      setGenerateOpen(false);
      setRefId('');
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void openPreview(document.downloadUrl);
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? `${error.message}${error.code ? ` (${error.code})` : ''}`
          : 'Belge üretilemedi',
      );
    },
  });

  const openPreview = async (url: string): Promise<void> => {
    setPreviewError(null);
    try {
      const blobUrl = await apiBlobUrl(url.replace('/api/v1', ''));
      setPreviewUrl(blobUrl);
    } catch (error) {
      setPreviewUrl(null);
      setPreviewError(
        error instanceof ApiError ? error.message : 'Belge görüntülenemedi',
      );
    }
  };

  if (!canManage) {
    return (
      <ErrorState
        title="Erişim yok"
        description="Belgeleri üretmek için document.manage izni gerekir."
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="belgeler-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Belgeler</h1>
          <p className="text-sm text-muted-foreground">
            Klinik markalı PDF çıktılar — üretim anındaki veriyle donar; dış bağlantı
            verilmez, indirme yetkili API ucuyladır.
          </p>
        </div>
        <Button data-testid="belge-yeni" onClick={() => setGenerateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Yeni Belge
        </Button>
      </div>

      {listQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : listQuery.isError ? (
        <ErrorState title="Belgeler yüklenemedi" description="Sayfayı yenileyip tekrar deneyin." />
      ) : (listQuery.data?.items.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Henüz belge üretilmedi. “Yeni Belge” ile muayene özeti, aşı kartı, reçete,
              onam, lab raporu veya taburculuk özeti üretebilirsiniz.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border" data-testid="belge-tablo">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Belge No</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Hasta</TableHead>
                <TableHead>Üreten</TableHead>
                <TableHead>Boyut</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.data?.items.map((document) => (
                <TableRow key={document.id} data-testid="belge-satir">
                  <TableCell className="font-medium">{document.documentNo}</TableCell>
                  <TableCell>
                    <DocumentTypeBadge kind={document.kind} />
                  </TableCell>
                  <TableCell>
                    {document.patient ? (
                      <>
                        {document.patient.name}
                        <span className="block text-xs text-muted-foreground">
                          {document.patient.code}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{document.createdBy ?? '—'}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatSize(document.fileSize)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(document.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="belge-ac"
                      onClick={() => void openPreview(document.downloadUrl)}
                    >
                      <ExternalLink className="mr-1 h-4 w-4" /> Görüntüle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Üretim diyaloğu */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-lg" data-testid="belge-yeni-diyalog">
          <DialogHeader>
            <DialogTitle>Yeni Belge Üret</DialogTitle>
            <DialogDescription>
              Belge, kaynak kaydın üretim anındaki verisinden donmuş anlık görüntüyle
              üretilir; kaynak sonradan değişse de belge değişmez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="kind-select">Belge Türü</Label>
              <Select
                value={kind}
                onValueChange={(value) => {
                  setKind(value as DocumentKind);
                  setRefId('');
                }}
              >
                <SelectTrigger id="kind-select" className="w-full" data-testid="belge-tur-secim">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_KIND_CATALOG.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref-select">
                Kaynak Kayıt
                {kindMeta ? ` — ${kindMeta.label}` : ''}
              </Label>
              <Select value={refId || undefined} onValueChange={setRefId}>
                <SelectTrigger id="ref-select" className="w-full" data-testid="belge-kaynak-secim">
                  <SelectValue placeholder="Kaynak seçin" />
                </SelectTrigger>
                <SelectContent>
                  {refOptions.length === 0 ? (
                    <SelectItem value="yok" disabled>
                      Uygun kaynak kayıt yok
                    </SelectItem>
                  ) : (
                    refOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            {formError ? (
              <p data-testid="belge-form-hata" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              Vazgeç
            </Button>
            <Button
              data-testid="belge-uret"
              disabled={!refId || generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              Üret ve Aç
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF önizleme diyaloğu */}
      <Dialog open={previewUrl !== null || previewError !== null} onOpenChange={(open) => {
        if (!open) {
          setPreviewUrl(null);
          setPreviewError(null);
        }
      }}>
        <DialogContent className="max-w-3xl" data-testid="belge-onizleme-diyalog">
          <DialogHeader>
            <DialogTitle>PDF Önizleme</DialogTitle>
            <DialogDescription>
              Belge private storage&apos;dan yetkili API ucuyla akar; bağlantı paylaşılamaz.
            </DialogDescription>
          </DialogHeader>
          {previewError ? (
            <p className="text-sm text-destructive">{previewError}</p>
          ) : previewUrl ? (
            <iframe
              src={previewUrl}
              title="PDF Önizleme"
              className="h-[65vh] w-full rounded-md border"
              data-testid="belge-pdf-cerceve"
            />
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (previewUrl) window.open(previewUrl, '_blank');
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> Yeni Sekmede Aç
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPreviewUrl(null);
                setPreviewError(null);
              }}
            >
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
