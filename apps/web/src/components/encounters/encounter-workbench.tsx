'use client';

import { useMemo, useState } from 'react';
import { FileText, PenLine, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { PatientAlerts } from '@/components/patients/patient-alerts';
import { EncounterStatusBadge } from './encounter-status-badge';
import {
  SoapEditor,
  SOAP_EMPTY,
  type SoapValues,
} from './soap-editor';
import { VitalPanel, DiagnosisPanel, type VitalInput } from './vital-panel';
import { ServiceRecordPanel, type ServiceLineInput } from './service-record-panel';
import { AddendumPanel } from './addendum-panel';
import type {
  EncounterDetail,
  EncounterVital,
  ServiceDto,
  VitalKind,
} from '@/lib/api-types';
import { VITAL_KIND_CATALOG } from '@/lib/api-types';

/**
 * Muayene workbench'i — uyarı şeridi, SOAP, vital bulgular, tanı, hizmet kaydı
 * ve addendum tek ekranda. İmza yalnızca clinical.sign izniyle görünür; imzalı
 * kayıtta tüm yazma alanları kilitlenir, addendum paneli açılır.
 */
export function EncounterWorkbench({
  encounter,
  services,
  patientHistory,
  canManage,
  canSign,
  saving,
  signing,
  onSaveSoap,
  onAddVital,
  onAddDiagnosis,
  onRemoveDiagnosis,
  onAddServiceRecord,
  onRemoveServiceRecord,
  onFinalizeServiceRecord,
  onAddAddendum,
  onSign,
  onClose,
}: {
  encounter: EncounterDetail;
  services: ServiceDto[];
  /** Hasta genelindeki tüm vital geçmişi (geçmiş ölçümler sekmesi) */
  patientHistory: EncounterVital[];
  canManage: boolean;
  canSign: boolean;
  saving?: boolean;
  signing?: boolean;
  onSaveSoap?: (values: SoapValues) => void;
  onAddVital?: (input: VitalInput) => void;
  onAddDiagnosis?: (input: { name: string; code: string; kind: string; note: string }) => void;
  onRemoveDiagnosis?: (id: string) => void;
  onAddServiceRecord?: (lines: ServiceLineInput[]) => void;
  onRemoveServiceRecord?: (recordId: string) => void;
  onFinalizeServiceRecord?: (recordId: string) => void;
  onAddAddendum?: (body: string) => void;
  onSign?: () => void;
  onClose?: () => void;
}) {
  const editable = canManage && (encounter.status === 'draft' || encounter.status === 'in_progress');
  const addendumOpen = canSign && (encounter.status === 'signed' || encounter.status === 'closed');

  const soapValues = useMemo<SoapValues>(
    () => ({
      chiefComplaint: encounter.chiefComplaint ?? '',
      subjective: encounter.subjective ?? '',
      objective: encounter.objective ?? '',
      assessment: encounter.assessment ?? '',
      plan: encounter.plan ?? '',
      notes: encounter.notes ?? '',
    }),
    [encounter.chiefComplaint, encounter.subjective, encounter.objective, encounter.assessment, encounter.plan, encounter.notes],
  );

  const patientLabel = `${encounter.patient.name} (${encounter.patient.code})`;
  const speciesLabel = [encounter.patient.species?.name, encounter.patient.breed?.name]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-4" data-testid="encounter-workbench">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{patientLabel}</h2>
              <p className="text-sm text-muted-foreground">
                {speciesLabel || '—'} · Sahip: {encounter.owner.firstName} {encounter.owner.lastName}{' '}
                · Hekim: {encounter.veterinarian.firstName} {encounter.veterinarian.lastName}
                {encounter.branch.name ? ` · ${encounter.branch.name}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <EncounterStatusBadge status={encounter.status} />
              {editable && canSign ? (
                <Button
                  type="button"
                  size="sm"
                  data-testid="encounter-sign"
                  disabled={signing}
                  onClick={onSign}
                >
                  <PenLine aria-hidden="true" />
                  {signing ? 'İmzalanıyor…' : 'İmzala'}
                </Button>
              ) : null}
              {canSign && encounter.status === 'signed' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="encounter-close"
                  onClick={onClose}
                >
                  Kapat
                </Button>
              ) : null}
            </div>
          </div>

          {encounter.patient.alerts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="workbench-alerts">
              <TriangleAlert aria-hidden="true" className="size-4 text-status-warning" />
              {encounter.patient.alerts.map((alert) => (
                <span
                  key={alert.label}
                  className="rounded-full border border-border bg-[var(--status-warning-bg)] px-2.5 py-0.5 text-xs font-medium text-status-warning"
                >
                  {alert.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <TriangleAlert aria-hidden="true" className="size-4" />
              Aktif uyarı yok.
            </p>
          )}

          {encounter.signedAt ? (
            <p className="text-xs text-muted-foreground" data-testid="encounter-signed-meta">
              <FileText aria-hidden="true" className="mr-1 inline size-3" />
              {encounter.signedBy
                ? `${encounter.signedBy.firstName} ${encounter.signedBy.lastName} tarafından`
                : ''}{' '}
              imzalandı · sürüm {encounter.version}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="soap">
        <TabsList
          aria-label="Muayene bölümleri"
          className="h-auto min-h-9 w-full max-w-full flex-wrap justify-start"
        >
          <TabsTrigger value="soap">SOAP</TabsTrigger>
          <TabsTrigger value="vitals">Vital Bulgular</TabsTrigger>
          <TabsTrigger value="diagnosis">Tanı</TabsTrigger>
          <TabsTrigger value="services">Hizmetler</TabsTrigger>
          <TabsTrigger value="addendum">Addendum</TabsTrigger>
        </TabsList>

        <TabsContent value="soap">
          <Card>
            <CardContent className="pt-4">
              <SoapEditor
                key={`${encounter.id}-${encounter.version}`}
                values={soapValues}
                editable={editable}
                saving={saving}
                onSave={onSaveSoap}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vitals">
          <Card>
            <CardContent className="pt-4">
              <VitalPanel
                vitals={encounter.vitals}
                patientHistory={patientHistory}
                editable={editable}
                saving={saving}
                onAdd={onAddVital}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnosis">
          <Card>
            <CardContent className="pt-4">
              <DiagnosisPanel
                diagnoses={encounter.diagnoses}
                editable={editable}
                saving={saving}
                onAdd={onAddDiagnosis}
                onRemove={onRemoveDiagnosis}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services">
          <Card>
            <CardContent className="pt-4">
              <ServiceRecordPanel
                records={encounter.serviceRecords}
                services={services}
                editable={editable}
                saving={saving}
                onAddRecord={onAddServiceRecord}
                onRemoveRecord={onRemoveServiceRecord}
                onFinalize={onFinalizeServiceRecord}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="addendum">
          <Card>
            <CardContent className="pt-4">
              <AddendumPanel
                addendums={encounter.addendums}
                canAdd={addendumOpen}
                saving={saving}
                onAdd={onAddAddendum}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Workbench iskeleti — hasta seçilene kadar geç durum. */
export function WorkbenchSkeleton(): React.ReactElement {
  return (
    <div className="space-y-4" data-testid="workbench-skeleton" aria-busy="true">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-10 w-96" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Addendum yazma koşulu — addendum paneli imzalı kayıtta açık; test için yardımcı. */
export function addendumVisibleFor(
  status: EncounterDetail['status'],
): boolean {
  return status === 'signed' || status === 'closed';
}

/** Vital kind doğrulama yardımcısı — API katalog anahtarları dışına çıkmayı engeller. */
export function isKnownVitalKind(kind: string): kind is VitalKind {
  return VITAL_KIND_CATALOG.some((v) => v.kind === kind);
}

// PatientAlerts uyarı kartı tipini dışa açar (workbench içinde kullanılan bileşen)
export { PatientAlerts };
