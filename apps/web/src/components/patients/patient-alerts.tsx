'use client';

import { useState, type FormEvent } from 'react';
import { AlertTriangle, CircleCheck, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PatientAlert } from '@/lib/api-types';

const KIND_LABELS: Record<string, string> = {
  allergy: 'Alerji',
  chronic: 'Kronik',
  warning: 'Uyarı',
};

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-[var(--status-danger-bg)] text-status-danger',
  medium: 'bg-[var(--status-warning-bg)] text-status-warning',
  low: 'bg-[var(--status-info-bg)] text-status-info',
};

/**
 * Hasta uyarıları — alerji/kronik hastalık kartı (kabul kriteri: detayda görünür).
 * Çözme/yeniden açma açık eylemdir; otomatik kapanma yoktur.
 */
export function PatientAlerts({
  alerts,
  canManage,
  onResolve,
  onReopen,
  onAdd,
  busy,
}: {
  alerts: PatientAlert[];
  canManage: boolean;
  onResolve: (alertId: string) => void;
  onReopen: (alertId: string) => void;
  onAdd: (input: {
    kind: PatientAlert['kind'];
    label: string;
    severity: 'low' | 'medium' | 'high';
  }) => void;
  busy?: boolean;
}) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<PatientAlert['kind']>('allergy');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (label.trim().length < 3) return;
    onAdd({ kind, label: label.trim(), severity });
    setLabel('');
  }

  return (
    <div className="flex flex-col gap-3" data-testid="patient-alerts">
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aktif uyarı yok.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${
                alert.active ? SEVERITY_STYLES[alert.severity] : 'bg-muted text-muted-foreground'
              }`}
              data-testid={`patient-alert-${alert.id}`}
            >
              <div className="flex items-center gap-2 text-sm">
                {alert.active ? (
                  <AlertTriangle className="size-4" aria-hidden />
                ) : (
                  <CircleCheck className="size-4" aria-hidden />
                )}
                <span className="font-medium">{alert.label}</span>
                {/* Kontrast: tonlu zeminde saydamlık uygulanmaz (axe color-contrast). */}
                <span className="text-xs">
                  {KIND_LABELS[alert.kind] ?? alert.kind} · {alert.severity}
                </span>
              </div>
              {canManage ? (
                alert.active ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onResolve(alert.id)}
                    disabled={busy}
                    data-testid={`alert-resolve-${alert.id}`}
                  >
                    Çözüldü
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onReopen(alert.id)}
                    disabled={busy}
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    Yeniden aç
                  </Button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form
          onSubmit={submit}
          className="flex flex-col gap-2 sm:flex-row"
          data-testid="alert-add-form"
        >
          <Select value={kind} onValueChange={(value) => setKind(value as PatientAlert['kind'])}>
            <SelectTrigger className="w-32" aria-label="Uyarı türü">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allergy">Alerji</SelectItem>
              <SelectItem value="chronic">Kronik</SelectItem>
              <SelectItem value="warning">Uyarı</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={severity}
            onValueChange={(value) => setSeverity(value as 'low' | 'medium' | 'high')}
          >
            <SelectTrigger className="w-32" aria-label="Önem derecesi">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Düşük</SelectItem>
              <SelectItem value="medium">Orta</SelectItem>
              <SelectItem value="high">Yüksek</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Uyarı etiketi (örn. Aşı reaksiyonu)"
            aria-label="Uyarı etiketi"
            className="flex-1"
            minLength={3}
          />
          <Button type="submit" size="sm" disabled={busy || label.trim().length < 3}>
            <Plus className="size-4" aria-hidden />
            Ekle
          </Button>
        </form>
      ) : null}
    </div>
  );
}
