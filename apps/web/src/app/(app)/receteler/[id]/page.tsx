'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Printer, Trash2 } from 'lucide-react';
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
import { DoseHelperCard } from '@/components/prescriptions/dose-helper-card';
import { PrescriptionStatusBadge } from '@/components/prescriptions/prescription-status-badge';
import { ErrorState } from '@/components/design-system/state-views';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import {
  PRESCRIPTION_FORM_CATALOG,
  PRESCRIPTION_ROUTE_CATALOG,
  type AdministrationEventDto,
  type DoseHelperResultDto,
  type DispenseEventDto,
  type LotViewDto,
  type PatientSummary,
  type PrescriptionDetailDto,
  type ProductDto,
} from '@/lib/api-types';

interface WarehouseRaw {
  id: string;
  name: string;
  branchId: string;
}

interface LineFormValues {
  productId: string;
  drugName: string;
  form: string;
  doseAmount: string;
  doseUnit: string;
  route: string;
  frequency: string;
  durationDays: string;
  quantity: string;
  quantityUnit: string;
  instructions: string;
  doseCalcWeightKg: string;
  doseCalcMgPerKg: string;
}

const EMPTY_LINE: LineFormValues = {
  productId: 'none',
  drugName: '',
  form: 'tablet',
  doseAmount: '',
  doseUnit: 'mg',
  route: 'oral',
  frequency: '',
  durationDays: '',
  quantity: '',
  quantityUnit: 'adet',
  instructions: '',
  doseCalcWeightKg: '',
  doseCalcMgPerKg: '',
};

export default function PrescriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const prescriptionId = params.id;
  const { hasPermission, activeBranchId } = useAuth();
  const canManage = hasPermission('prescription.manage');
  const canSign = hasPermission('prescription.sign');
  const canDispense = hasPermission('prescription.dispense');
  const queryClient = useQueryClient();

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [lineForm, setLineForm] = useState<LineFormValues>(EMPTY_LINE);
  const [dispenseLineId, setDispenseLineId] = useState<string | null>(null);
  const [dispenseWarehouseId, setDispenseWarehouseId] = useState('');
  const [dispenseLotId, setDispenseLotId] = useState('');
  const [dispenseQty, setDispenseQty] = useState('');
  const [administerLineId, setAdministerLineId] = useState<string | null>(null);
  const [administerDose, setAdministerDose] = useState('');
  const [administerUnit, setAdministerUnit] = useState('mg');
  const [administerSite, setAdministerSite] = useState('');
  const [administerNote, setAdministerNote] = useState('');

  const detailQuery = useQuery({
    queryKey: ['prescriptions', prescriptionId],
    queryFn: () =>
      api<PrescriptionDetailDto>(`/prescriptions/${prescriptionId}`, { branchId: activeBranchId }),
    enabled: Boolean(prescriptionId) && canManage,
  });

  const productsQuery = useQuery({
    queryKey: ['products', 'recete-secim'],
    queryFn: () => api<{ items: ProductDto[] }>('/products'),
    enabled: lineDialogOpen,
  });

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'recete-dagitim'],
    queryFn: () => api<WarehouseRaw[] | { items: WarehouseRaw[] }>('/warehouses', { branchId: activeBranchId }),
    enabled: Boolean(dispenseLineId),
  });

  const patientsQuery = useQuery({
    queryKey: ['patients', 'recete-detay'],
    queryFn: () => api<PatientSummary[]>('/patients'),
    enabled: Boolean(detailQuery.data),
  });

  const dispenseLine = detailQuery.data?.lines.find((line) => line.id === dispenseLineId);
  const lotsQuery = useQuery({
    queryKey: ['lots', 'recete-dagitim', dispenseLine?.productId, dispenseWarehouseId],
    queryFn: () =>
      api<{ items: LotViewDto[] }>(
        `/products/${dispenseLine?.productId}/lots?warehouseId=${dispenseWarehouseId}&includeBlocked=true`,
      ),
    enabled: Boolean(dispenseLine?.productId) && Boolean(dispenseWarehouseId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
    void queryClient.invalidateQueries({ queryKey: ['lots'] });
    void queryClient.invalidateQueries({ queryKey: ['balances'] });
  };

  const sign = useMutation({
    mutationFn: () =>
      api<PrescriptionDetailDto>(`/prescriptions/${prescriptionId}/sign`, {
        method: 'POST',
        body: {},
        branchId: activeBranchId,
      }),
    onSuccess: (signed) => {
      setActionInfo(`Reçete imzalandı — No ${signed.code}`);
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => {
      setActionInfo(null);
      setActionError(error.message);
    },
  });

  const voidPrescription = useMutation({
    mutationFn: () =>
      api<PrescriptionDetailDto>(`/prescriptions/${prescriptionId}/void`, {
        method: 'POST',
        body: { reason: 'Yanlış yazım — taslak iptali' },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionInfo('Reçete taslağı iptal edildi.');
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => {
      setActionInfo(null);
      setActionError(error.message);
    },
  });

  const addLine = useMutation({
    mutationFn: (values: LineFormValues) =>
      api<PrescriptionDetailDto>(`/prescriptions/${prescriptionId}/lines`, {
        method: 'POST',
        body: {
          productId: values.productId === 'none' ? undefined : values.productId,
          drugName: values.drugName,
          form: values.form,
          doseAmount: values.doseAmount ? Number(values.doseAmount) : undefined,
          doseUnit: values.doseUnit || undefined,
          route: values.route,
          frequency: values.frequency,
          durationDays: values.durationDays ? Number(values.durationDays) : undefined,
          quantity: Number(values.quantity),
          quantityUnit: values.quantityUnit,
          instructions: values.instructions || undefined,
          doseCalcWeightKg: values.doseCalcWeightKg ? Number(values.doseCalcWeightKg) : undefined,
          doseCalcMgPerKg: values.doseCalcMgPerKg ? Number(values.doseCalcMgPerKg) : undefined,
        },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setLineDialogOpen(false);
      setLineForm(EMPTY_LINE);
      setActionInfo('Satır eklendi.');
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => {
      setActionError(error.message);
    },
  });

  const removeLine = useMutation({
    mutationFn: (lineId: string) =>
      api(`/prescriptions/${prescriptionId}/lines/${lineId}`, {
        method: 'DELETE',
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionInfo('Satır kaldırıldı.');
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => {
      setActionInfo(null);
      setActionError(error.message);
    },
  });

  const approveDose = useMutation({
    mutationFn: (lineId: string) =>
      api(`/prescriptions/${prescriptionId}/lines/${lineId}/approve-dose`, {
        method: 'POST',
        body: {},
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionInfo('Doz önerisi veteriner tarafından onaylandı.');
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => {
      setActionInfo(null);
      setActionError(error.message);
    },
  });

  const dispense = useMutation({
    mutationFn: () =>
      api<DispenseEventDto>(`/prescriptions/${prescriptionId}/dispense`, {
        method: 'POST',
        body: {
          lineId: dispenseLineId,
          warehouseId: dispenseWarehouseId,
          qty: Number(dispenseQty),
          lotId: dispenseLotId === 'fefo' ? undefined : dispenseLotId || undefined,
        },
        branchId: activeBranchId,
      }),
    onSuccess: (event) => {
      setDispenseLineId(null);
      setDispenseQty('');
      setDispenseLotId('');
      setActionInfo(`Dağıtım kaydedildi — parti ${event.lotCode ?? 'FEFO'}, stok defterine yazıldı.`);
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => {
      setActionInfo(null);
      setActionError(error.message);
    },
  });

  const administer = useMutation({
    mutationFn: () =>
      api<AdministrationEventDto>('/prescriptions/administrations', {
        method: 'POST',
        body: {
          lineId: administerLineId,
          doseGiven: Number(administerDose),
          doseUnit: administerUnit || undefined,
          site: administerSite || undefined,
          note: administerNote || undefined,
        },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setAdministerLineId(null);
      setAdministerDose('');
      setAdministerSite('');
      setAdministerNote('');
      setActionInfo('Uygulama kaydı tutuldu.');
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => {
      setActionInfo(null);
      setActionError(error.message);
    },
  });

  if (!canManage) {
    return (
      <div className="space-y-6" data-testid="recete-detay">
        <ErrorState title="Yetkiniz yok" description="Reçete detayı için reçete yönetimi izni gerekir." />
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4" data-testid="recete-detay">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="space-y-6" data-testid="recete-detay">
        <ErrorState
          title="Reçete yüklenemedi"
          description="Kayıt bulunamadı ya da erişim kapsamı dışında."
        />
      </div>
    );
  }

  const prescription = detailQuery.data;
  const isDraft = prescription.status === 'draft';
  const isSigned = prescription.status === 'signed';
  const unapprovedCount = prescription.lines.filter(
    (line) => line.doseCalcSuggested != null && !line.doseApproved,
  ).length;
  const patient = patientsQuery.data?.find((candidate) => candidate.id === prescription.patient.id);
  const warehouses = Array.isArray(warehousesQuery.data)
    ? warehousesQuery.data
    : (warehousesQuery.data?.items ?? []);

  return (
    <div className="space-y-6" data-testid="recete-detay">
      {/* Yazdırılabilir reçete — ekranda gizli, print medyasında görünür */}
      <div className="hidden print:block" data-testid="recete-yazdir-alan">
        <h2 className="text-lg font-bold">Veteriner Reçetesi {prescription.code ?? ''}</h2>
        <p>
          Hasta: {prescription.patient.name} ({prescription.patient.code})
          {patient?.owner ? ` — Sahip: ${patient.owner.firstName} ${patient.owner.lastName}` : ''}
        </p>
        <p>
          Veteriner: {prescription.veterinarian.firstName} {prescription.veterinarian.lastName}
          {prescription.signedAt ? ` — İmza: ${new Date(prescription.signedAt).toLocaleString('tr-TR')}` : ''}
        </p>
        <ol className="mt-2 list-decimal pl-5 text-sm">
          {prescription.lines.map((line) => (
            <li key={line.id}>
              {line.drugName} — {line.form}, {line.route}; doz:{' '}
              {line.doseAmount ?? line.doseCalcSuggested ?? '—'} {line.doseUnit ?? line.doseCalcUnit ?? ''}{' '}
              {line.frequency ? `(${line.frequency})` : ''}; miktar: {line.quantity} {line.quantityUnit}
              {line.instructions ? ` — ${line.instructions}` : ''}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">
              Reçete {prescription.code ?? '(taslak — imzada numaralanır)'}
            </h1>
            <PrescriptionStatusBadge status={prescription.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Hasta: {prescription.patient.name} ({prescription.patient.code}) · Veteriner:{' '}
            {prescription.veterinarian.firstName} {prescription.veterinarian.lastName}
            {prescription.signedAt
              ? ` · İmza: ${new Date(prescription.signedAt).toLocaleString('tr-TR')}`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" data-testid="recete-yazdir" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            Yazdır
          </Button>
          {isDraft && canSign ? (
            <Button
              data-testid="recete-imzala"
              onClick={() => {
                setActionError(null);
                sign.mutate();
              }}
              disabled={sign.isPending}
            >
              <CheckCircle2 className="size-4" aria-hidden />
              {sign.isPending ? 'İmzalanıyor…' : 'İmzala'}
            </Button>
          ) : null}
          {isDraft ? (
            <Button
              variant="outline"
              data-testid="recete-iptal"
              onClick={() => voidPrescription.mutate()}
              disabled={voidPrescription.isPending}
            >
              Taslağı İptal Et
            </Button>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <div role="alert" data-testid="recete-hata" className="rounded-md border border-destructive/30 bg-[var(--status-danger-bg)] px-3 py-2 text-sm print:hidden">
          {actionError}
        </div>
      ) : null}
      {actionInfo ? (
        <div role="status" data-testid="recete-bilgi" className="rounded-md border bg-[var(--status-success-bg)] px-3 py-2 text-sm print:hidden">
          {actionInfo}
        </div>
      ) : null}
      {isDraft && unapprovedCount > 0 ? (
        <div className="rounded-md border bg-[var(--status-warning-bg)] px-3 py-2 text-sm print:hidden" data-testid="recete-doz-uyari">
          {unapprovedCount} satırda doz önerisi veteriner onayı bekliyor — imza için onay gerekir.
        </div>
      ) : null}

      <Card className="print:hidden">
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">İlaç Satırları (prescribed)</h2>
            {isDraft ? (
              <Button
                variant="outline"
                data-testid="satir-ekle"
                onClick={() => {
                  setLineForm(EMPTY_LINE);
                  setLineDialogOpen(true);
                }}
              >
                Satır Ekle
              </Button>
            ) : null}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>İlaç</TableHead>
                <TableHead>Form / Yol</TableHead>
                <TableHead>Doz</TableHead>
                <TableHead>Sıklık / Süre</TableHead>
                <TableHead>Miktar</TableHead>
                <TableHead>Doz onayı</TableHead>
                <TableHead>İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-testid="recete-satirlari">
              {prescription.lines.map((line) => (
                <TableRow key={line.id} data-testid="recete-satir-satir">
                  <TableCell>
                    <p className="font-medium">{line.drugName}</p>
                    {line.product ? (
                      <p className="text-xs text-muted-foreground">{line.product.code}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">katalog dışı</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {PRESCRIPTION_FORM_CATALOG.find((f) => f.value === line.form)?.label ?? line.form} /{' '}
                    {PRESCRIPTION_ROUTE_CATALOG.find((r) => r.value === line.route)?.label ?? line.route}
                  </TableCell>
                  <TableCell className="text-sm">
                    {line.doseAmount != null
                      ? `${line.doseAmount} ${line.doseUnit ?? ''}`
                      : line.doseCalcSuggested != null
                        ? `${line.doseCalcSuggested} ${line.doseCalcUnit ?? ''} (öneri)`
                        : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {line.frequency}
                    {line.durationDays ? ` · ${line.durationDays} gün` : ''}
                  </TableCell>
                  <TableCell className="text-sm">
                    {line.quantity} {line.quantityUnit}
                  </TableCell>
                  <TableCell className="text-sm" data-testid={`doz-durum-${line.id}`}>
                    {line.doseCalcFormula ? (
                      <div className="space-y-1">
                        <p className="font-mono text-xs">{line.doseCalcFormula}</p>
                        {line.doseApproved ? (
                          <span className="text-xs text-status-success">Onaylı ✓</span>
                        ) : canSign ? (
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`doz-onayla-${line.id}`}
                            onClick={() => approveDose.mutate(line.id)}
                            disabled={approveDose.isPending}
                          >
                            Dozayı Onayla
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">veteriner onayı bekliyor</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">doz yardımcısı kullanılmadı</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {isSigned && line.productId && canDispense ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`dagit-${line.id}`}
                          onClick={() => {
                            setDispenseLineId(line.id);
                            setDispenseWarehouseId(warehouses[0]?.id ?? '');
                          }}
                        >
                          Dağıt
                        </Button>
                      ) : null}
                      {isSigned ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`uygula-${line.id}`}
                          onClick={() => {
                            setAdministerLineId(line.id);
                            setAdministerUnit(line.doseUnit ?? 'mg');
                          }}
                        >
                          Uygula
                        </Button>
                      ) : null}
                      {isDraft ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`satir-kaldir-${line.id}`}
                          onClick={() => removeLine.mutate(line.id)}
                          disabled={removeLine.isPending}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {prescription.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    Satır yok — Satır Ekle ile ilaç yazın.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 print:hidden">
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-base font-semibold">Dağıtımlar (dispensed)</h2>
            <ul className="mt-2 space-y-1 text-sm" data-testid="dagitim-liste">
              {prescription.dispenses.map((event) => (
                <li key={event.id} className="flex justify-between gap-2">
                  <span>
                    {event.product?.name ?? '—'} · parti {event.lotCode ?? 'FEFO'} · {event.qty}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.dispensedAt).toLocaleString('tr-TR')}
                  </span>
                </li>
              ))}
              {prescription.dispenses.length === 0 ? (
                <li className="text-muted-foreground">Dağıtım kaydı yok.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-base font-semibold">Uygulamalar (administered)</h2>
            <ul className="mt-2 space-y-1 text-sm" data-testid="uygulama-liste">
              {prescription.administrations.map((event) => (
                <li key={event.id} className="flex justify-between gap-2">
                  <span>
                    {event.drugName} · {event.doseGiven ?? '—'} {event.doseUnit ?? ''}
                    {event.site ? ` · ${event.site}` : ''}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.administeredAt).toLocaleString('tr-TR')}
                  </span>
                </li>
              ))}
              {prescription.administrations.length === 0 ? (
                <li className="text-muted-foreground">Uygulama kaydı yok.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Satır ekleme diyaloğu + doz yardımcısı */}
      <Dialog open={lineDialogOpen} onOpenChange={setLineDialogOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto" data-testid="satir-diyalog">
          <DialogHeader>
            <DialogTitle>İlaç Satırı Ekle</DialogTitle>
            <DialogDescription>
              Ürün seçimi opsiyoneldir: katalog dışı ilaç serbest adla yazılabilir (stok dağıtımı yapılamaz).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Ürün (katalog)</Label>
              <Select
                value={lineForm.productId}
                onValueChange={(value) => {
                  const product = (productsQuery.data?.items ?? []).find((p) => p.id === value);
                  setLineForm((current) => ({
                    ...current,
                    productId: value,
                    drugName: product?.name ?? current.drugName,
                  }));
                }}
              >
                <SelectTrigger data-testid="satir-urun-secim">
                  <SelectValue placeholder="Ürün seçin veya katalog dışı" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Katalog dışı (serbest ilaç)</SelectItem>
                  {(productsQuery.data?.items ?? []).map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} ({product.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="satir-ilac">İlaç adı</Label>
              <Input
                id="satir-ilac"
                data-testid="satir-ilac"
                value={lineForm.drugName}
                onChange={(event) => setLineForm((c) => ({ ...c, drugName: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Form</Label>
              <Select
                value={lineForm.form}
                onValueChange={(value) => setLineForm((c) => ({ ...c, form: value }))}
              >
                <SelectTrigger data-testid="satir-form">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESCRIPTION_FORM_CATALOG.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Uygulama yolu</Label>
              <Select
                value={lineForm.route}
                onValueChange={(value) => setLineForm((c) => ({ ...c, route: value }))}
              >
                <SelectTrigger data-testid="satir-yol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESCRIPTION_ROUTE_CATALOG.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="satir-siklik">Sıklık</Label>
              <Input
                id="satir-siklik"
                data-testid="satir-siklik"
                placeholder="günde 2 kez"
                value={lineForm.frequency}
                onChange={(event) => setLineForm((c) => ({ ...c, frequency: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="satir-sure">Süre (gün)</Label>
              <Input
                id="satir-sure"
                type="number"
                min="1"
                value={lineForm.durationDays}
                onChange={(event) => setLineForm((c) => ({ ...c, durationDays: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="satir-miktar">Miktar</Label>
              <Input
                id="satir-miktar"
                type="number"
                min="0.001"
                step="0.5"
                data-testid="satir-miktar"
                value={lineForm.quantity}
                onChange={(event) => setLineForm((c) => ({ ...c, quantity: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="satir-birim">Miktar birimi</Label>
              <Input
                id="satir-birim"
                value={lineForm.quantityUnit}
                onChange={(event) => setLineForm((c) => ({ ...c, quantityUnit: event.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="satir-talimat">Talimat</Label>
              <Textarea
                id="satir-talimat"
                rows={2}
                value={lineForm.instructions}
                onChange={(event) => setLineForm((c) => ({ ...c, instructions: event.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <DoseHelperCard
                canApprove={false}
                testIdPrefix="satir-doz"
                onPreview={async (input) =>
                  api<DoseHelperResultDto>('/prescriptions/dose-helper', {
                    method: 'POST',
                    body: input,
                    branchId: activeBranchId,
                  })
                }
                onApprove={async () => undefined}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="satir-kg">Ağırlık (kg) — satıra işlemek için</Label>
                  <Input
                    id="satir-kg"
                    type="number"
                    min="0.01"
                    step="0.1"
                    data-testid="satir-kg"
                    value={lineForm.doseCalcWeightKg}
                    onChange={(event) =>
                      setLineForm((c) => ({ ...c, doseCalcWeightKg: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="satir-mgkg">mg/kg — satıra işlemek için</Label>
                  <Input
                    id="satir-mgkg"
                    type="number"
                    min="0.001"
                    step="0.5"
                    data-testid="satir-mgkg"
                    value={lineForm.doseCalcMgPerKg}
                    onChange={(event) =>
                      setLineForm((c) => ({ ...c, doseCalcMgPerKg: event.target.value }))
                    }
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Bu değerlerle hesaplanan öneri satıra yazılır ve veteriner onayı olmadan imza kesinleşmez.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineDialogOpen(false)}>
              Vazgeç
            </Button>
            <Button
              data-testid="satir-kaydet"
              disabled={
                !lineForm.drugName ||
                !lineForm.frequency ||
                !lineForm.quantity ||
                addLine.isPending
              }
              onClick={() => addLine.mutate(lineForm)}
            >
              {addLine.isPending ? 'Kaydediliyor…' : 'Satırı Ekle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dağıtım diyaloğu */}
      <Dialog open={Boolean(dispenseLineId)} onOpenChange={(open) => !open && setDispenseLineId(null)}>
        <DialogContent data-testid="dagitim-diyalog">
          <DialogHeader>
            <DialogTitle>Depodan Dağıt</DialogTitle>
            <DialogDescription>
              Parti seçilmezse FEFO önerisi uygulanır; süresi geçmiş ve karantinalı partiler seçilemez.
              Dağıtım stok defterine tüketim hareketi yazar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Depo</Label>
              <Select
                value={dispenseWarehouseId}
                onValueChange={(value) => {
                  setDispenseWarehouseId(value);
                  setDispenseLotId('');
                }}
              >
                <SelectTrigger data-testid="dagitim-depo">
                  <SelectValue placeholder="Depo seçin" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Parti</Label>
              <Select value={dispenseLotId || 'fefo'} onValueChange={setDispenseLotId}>
                <SelectTrigger data-testid="dagitim-parti">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fefo">FEFO otomatik tahsis</SelectItem>
                  {(lotsQuery.data?.items ?? []).map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.lotCode} · SKT{' '}
                      {lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString('tr-TR') : '—'} ·{' '}
                      {lot.qtyOnHand}
                      {lot.blockReason ? ' (bloklu)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dagitim-miktar">Miktar</Label>
              <Input
                id="dagitim-miktar"
                type="number"
                min="0.001"
                step="0.5"
                data-testid="dagitim-miktar"
                value={dispenseQty}
                onChange={(event) => setDispenseQty(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispenseLineId(null)}>
              Vazgeç
            </Button>
            <Button
              data-testid="dagitim-kaydet"
              disabled={!dispenseWarehouseId || !dispenseQty || dispense.isPending}
              onClick={() => dispense.mutate()}
            >
              {dispense.isPending ? 'Dağıtılıyor…' : 'Dağıt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Uygulama diyaloğu */}
      <Dialog
        open={Boolean(administerLineId)}
        onOpenChange={(open) => !open && setAdministerLineId(null)}
      >
        <DialogContent data-testid="uygulama-diyalog">
          <DialogHeader>
            <DialogTitle>İlaç Uygulama Kaydı</DialogTitle>
            <DialogDescription>
              Hastaya fiilen uygulanan dozu kaydeder; dağıtım kaydından ayrıdır.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="uygulama-doz">Uygulanan doz</Label>
              <Input
                id="uygulama-doz"
                type="number"
                min="0.001"
                step="0.1"
                data-testid="uygulama-doz"
                value={administerDose}
                onChange={(event) => setAdministerDose(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="uygulama-birim">Birim</Label>
              <Input
                id="uygulama-birim"
                data-testid="uygulama-birim"
                value={administerUnit}
                onChange={(event) => setAdministerUnit(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="uygulama-bolge">Uygulama bölgesi</Label>
              <Input
                id="uygulama-bolge"
                placeholder="boyun deri altı"
                data-testid="uygulama-bolge"
                value={administerSite}
                onChange={(event) => setAdministerSite(event.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="uygulama-not">Not</Label>
              <Textarea
                id="uygulama-not"
                rows={2}
                data-testid="uygulama-not"
                value={administerNote}
                onChange={(event) => setAdministerNote(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdministerLineId(null)}>
              Vazgeç
            </Button>
            <Button
              data-testid="uygulama-kaydet"
              disabled={!administerDose || administer.isPending}
              onClick={() => administer.mutate()}
            >
              {administer.isPending ? 'Kaydediliyor…' : 'Uygulamayı Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
