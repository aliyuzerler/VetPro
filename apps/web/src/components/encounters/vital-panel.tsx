'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { VITAL_KIND_CATALOG, type EncounterDiagnosis, type EncounterVital, type VitalKind } from '@/lib/api-types';

const VITAL_OPTIONS = VITAL_KIND_CATALOG;

function formatMeasured(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type VitalInput = {
  kind: VitalKind;
  value: string;
  unit: string;
  measuredAt: string;
  note: string;
};

/**
 * Vital bulgu paneli — aynı bulgunun tüm geçmiş ölçümleri korunur (kabul
 * kriteri 2): tablo her ölçümü ayrı satır gösterir, kayıt üzerine yazılmaz.
 * kind seçimi varsayılan birim önerir; birim elle değiştirilebilir.
 */
export function VitalPanel({
  vitals,
  editable,
  patientHistory,
  onAdd,
  saving,
}: {
  vitals: EncounterVital[];
  editable: boolean;
  /** Hasta genelindeki geçmiş ölçümler (kind filtreli) — karşılaştırma için. */
  patientHistory: EncounterVital[];
  onAdd?: (input: VitalInput) => void;
  saving?: boolean;
}) {
  const [kind, setKind] = useState<string>('temp');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('°C');
  const [measuredAt, setMeasuredAt] = useState(() => {
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [note, setNote] = useState('');
  const [historyKind, setHistoryKind] = useState<string>('temp');

  const handleKindChange = (next: string): void => {
    setKind(next);
    const meta = VITAL_OPTIONS.find((v) => v.kind === next);
    if (meta?.unit) setUnit(meta.unit);
  };

  const submit = (): void => {
    if (!value || !kind || onAdd == null) return;
    onAdd({
      kind: kind as VitalKind,
      value,
      unit,
      measuredAt: new Date(measuredAt).toISOString(),
      note,
    });
    setValue('');
    setNote('');
  };

  const filteredHistory = useMemo(
    () => patientHistory.filter((v) => v.kind === historyKind),
    [patientHistory, historyKind],
  );

  return (
    <div className="space-y-4" data-testid="vital-panel">
      {editable ? (
        <div className="grid items-end gap-3 md:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="vital-kind">Bulgu</Label>
            <Select value={kind} onValueChange={handleKindChange}>
              <SelectTrigger id="vital-kind" data-testid="vital-kind">
                <SelectValue placeholder="Bulgu seçin" />
              </SelectTrigger>
              <SelectContent>
                {VITAL_OPTIONS.map((v) => (
                  <SelectItem key={v.kind} value={v.kind}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vital-value">Değer</Label>
            <Input
              id="vital-value"
              data-testid="vital-value"
              type="number"
              step="0.001"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vital-unit">Birim</Label>
            <Input
              id="vital-unit"
              data-testid="vital-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vital-measured">Ölçüm Zamanı</Label>
            <Input
              id="vital-measured"
              data-testid="vital-measured"
              type="datetime-local"
              value={measuredAt}
              onChange={(e) => setMeasuredAt(e.target.value)}
            />
          </div>
          <Button type="button" data-testid="vital-add" disabled={saving || !value} onClick={submit}>
            <Plus aria-hidden="true" />
            {saving ? 'Ekleniyor…' : 'Ekle'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="vital-locked-note">
          İmzalı kayıt — vital bulgu eklenemez.
        </p>
      )}

      <div className="space-y-1.5">
        <h4 className="text-sm font-medium">Bu muayenenin ölçümleri</h4>
        {vitals.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="vital-empty">
            Henüz vital bulgu kaydedilmedi.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bulgu</TableHead>
                <TableHead>Değer</TableHead>
                <TableHead>Ölçüm Zamanı</TableHead>
                <TableHead>Not</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vitals.map((v) => {
                const meta = VITAL_OPTIONS.find((o) => o.kind === v.kind);
                return (
                  <TableRow key={v.id}>
                    <TableCell>{meta?.label ?? v.kind}</TableCell>
                    <TableCell className="font-medium">
                      {Number(v.value)} {v.unit}
                    </TableCell>
                    <TableCell>{formatMeasured(v.measuredAt)}</TableCell>
                    <TableCell>{v.note ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Geçmiş ölçümler (hasta)</h4>
          <div className="w-44">
            <Select value={historyKind} onValueChange={setHistoryKind}>
              <SelectTrigger aria-label="Geçmiş bulgu türü" data-testid="vital-history-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VITAL_OPTIONS.map((v) => (
                  <SelectItem key={v.kind} value={v.kind}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {filteredHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="vital-history-empty">
            Bu bulgu için geçmiş ölçüm yok.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Değer</TableHead>
                <TableHead>Ölçüm Zamanı</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-testid="vital-history-rows">
              {filteredHistory.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">
                    {Number(v.value)} {v.unit}
                  </TableCell>
                  <TableCell>{formatMeasured(v.measuredAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

/** Tanı paneli — imzalı kayıtta eklenemez (kayıt kilitlidir). */
export function DiagnosisPanel({
  diagnoses,
  editable,
  onAdd,
  onRemove,
  saving,
}: {
  diagnoses: EncounterDiagnosis[];
  editable: boolean;
  onAdd?: (input: { name: string; code: string; kind: string; note: string }) => void;
  onRemove?: (id: string) => void;
  saving?: boolean;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState('primary');
  const [note, setNote] = useState('');

  const submit = (): void => {
    if (!name || onAdd == null) return;
    onAdd({ name, code, kind, note });
    setName('');
    setCode('');
    setNote('');
  };

  return (
    <div className="space-y-4" data-testid="diagnosis-panel">
      {editable ? (
        <div className="grid items-end gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="diagnosis-name">Tanı</Label>
            <Input
              id="diagnosis-name"
              data-testid="diagnosis-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tanı adı"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="diagnosis-code">Kod (opsiyonel)</Label>
            <Input
              id="diagnosis-code"
              data-testid="diagnosis-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Sistem kodu"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="diagnosis-kind">Tür</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id="diagnosis-kind" data-testid="diagnosis-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Birincil</SelectItem>
                <SelectItem value="secondary">İkincil</SelectItem>
                <SelectItem value="differential">Diferansiyel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" data-testid="diagnosis-add" disabled={saving || !name} onClick={submit}>
            <Plus aria-hidden="true" />
            Ekle
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="diagnosis-locked-note">
          İmzalı kayıt — tanı eklenemez.
        </p>
      )}

      {diagnoses.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="diagnosis-empty">
          Tanı kaydı yok.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="diagnosis-list">
          {diagnoses.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {d.name}
                  {d.code ? <span className="ml-2 text-muted-foreground">({d.code})</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.kind === 'primary' ? 'Birincil' : d.kind === 'secondary' ? 'İkincil' : 'Diferansiyel'}
                  {d.note ? ` — ${d.note}` : ''}
                </p>
              </div>
              {editable && onRemove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${d.name} tanısını kaldır`}
                  data-testid="diagnosis-remove"
                  onClick={() => onRemove(d.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
