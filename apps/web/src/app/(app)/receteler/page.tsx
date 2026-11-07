'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import { Textarea } from '@/components/ui/textarea';
import { PrescriptionStatusBadge } from '@/components/prescriptions/prescription-status-badge';
import { ErrorState } from '@/components/design-system/state-views';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import type { PatientSummary, PrescriptionDto, PrescriptionStatus } from '@/lib/api-types';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tümü' },
  { value: 'draft', label: 'Taslak' },
  { value: 'signed', label: 'İmzalı' },
  { value: 'voided', label: 'İptal' },
] as const;

export default function PrescriptionsPage() {
  const { hasPermission, activeBranchId } = useAuth();
  const canManage = hasPermission('prescription.manage');
  const canSign = hasPermission('prescription.sign');
  const router = useRouter();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [patientId, setPatientId] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const prescriptionsQuery = useQuery({
    queryKey: ['prescriptions', statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const qs = params.toString();
      return api<{ items: PrescriptionDto[] }>(`/prescriptions${qs ? `?${qs}` : ''}`, {
        branchId: activeBranchId,
      });
    },
    placeholderData: keepPreviousData,
  });

  const patientsQuery = useQuery({
    queryKey: ['patients', 'secim'],
    queryFn: () => api<PatientSummary[]>('/patients'),
    enabled: dialogOpen,
  });

  const createPrescription = useMutation({
    mutationFn: (values: { patientId: string; notes: string }) =>
      api<PrescriptionDto>('/prescriptions', {
        method: 'POST',
        body: { patientId: values.patientId, notes: values.notes || undefined },
        branchId: activeBranchId,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      setDialogOpen(false);
      setPatientId('');
      setNotes('');
      router.push(`/receteler/${created.id}`);
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const prescriptions = useMemo(
    () => prescriptionsQuery.data?.items ?? [],
    [prescriptionsQuery.data],
  );

  if (!canManage) {
    return (
      <div className="space-y-6" data-testid="receteler-page">
        <h1 className="text-xl font-semibold">Reçeteler</h1>
        <ErrorState
          title="Yetkiniz yok"
          description="Reçete listesini görüntülemek için reçete yönetimi izni gerekir."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="receteler-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reçeteler</h1>
          <p className="text-sm text-muted-foreground">
            Reçete taslakları, imza akışı ve dağıtım kayıtları. İmza yalnızca yetkili veterinerdedir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36" data-testid="recete-durum-filtre">
              <SelectValue placeholder="Durum" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManage ? (
            <Button data-testid="recete-yeni" onClick={() => setDialogOpen(true)}>
              <FilePlus2 className="size-4" aria-hidden />
              Yeni Reçete
            </Button>
          ) : null}
        </div>
      </div>

      {prescriptionsQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : prescriptionsQuery.isError ? (
        <ErrorState
          title="Reçeteler yüklenemedi"
          description="Kısa süre sonra yeniden deneyin; sorun sürerse API sağlık durumunu kontrol edin."
        />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No</TableHead>
                  <TableHead>Hasta</TableHead>
                  <TableHead>Veteriner</TableHead>
                  <TableHead>Satır</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Tarih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-testid="recete-tablo">
                {prescriptions.map((prescription) => (
                  <TableRow
                    key={prescription.id}
                    data-testid="recete-satir"
                    className="cursor-pointer"
                    onClick={() => router.push(`/receteler/${prescription.id}`)}
                  >
                    <TableCell className="font-medium">{prescription.code ?? '—'}</TableCell>
                    <TableCell>{prescription.patient.name}</TableCell>
                    <TableCell>
                      {prescription.veterinarian.firstName} {prescription.veterinarian.lastName}
                    </TableCell>
                    <TableCell>{prescription.lines.length}</TableCell>
                    <TableCell>
                      <PrescriptionStatusBadge status={prescription.status as PrescriptionStatus} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(prescription.createdAt).toLocaleDateString('tr-TR')}
                    </TableCell>
                  </TableRow>
                ))}
                {prescriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      {statusFilter === 'all'
                        ? 'Reçete kaydı yok. Yeni Reçete ile taslak oluşturun.'
                        : 'Bu durumda reçete yok.'}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="recete-yeni-diyalog">
          <DialogHeader>
            <DialogTitle>Yeni Reçete</DialogTitle>
            <DialogDescription>
              Taslak oluşturun; satırlar detay ekranında eklenir ve imza veterinerde kalır.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="recete-hasta">Hasta</Label>
              <Select
                value={patientId}
                onValueChange={setPatientId}
                disabled={patientsQuery.isLoading}
              >
                <SelectTrigger data-testid="recete-hasta-secim">
                  <SelectValue placeholder="Hasta seçin" />
                </SelectTrigger>
                <SelectContent>
                  {(patientsQuery.data ?? []).map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.name} ({patient.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="recete-notlar">Notlar</Label>
              <Textarea
                id="recete-notlar"
                data-testid="recete-notlar"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Klinik özet, uyarılar…"
                rows={3}
              />
            </div>
            {formError ? (
              <div role="alert" className="rounded-md border border-destructive/30 bg-[var(--status-danger-bg)] px-3 py-2 text-sm">
                {formError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Vazgeç
            </Button>
            <Button
              data-testid="recete-kaydet"
              disabled={!patientId || createPrescription.isPending}
              onClick={() => {
                setFormError(null);
                createPrescription.mutate({ patientId, notes });
              }}
            >
              {createPrescription.isPending ? 'Kaydediliyor…' : 'Taslağı Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!canSign ? (
        <p className="text-xs text-muted-foreground">
          Not: Reçete imzalama ve doz onayı yalnızca reçete imza yetkisi olan veteriner tarafından yapılabilir.
        </p>
      ) : null}
    </div>
  );
}
