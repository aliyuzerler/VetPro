'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DoseHelperResultDto } from '@/lib/api-types';

/**
 * Doz yardımcısı kartı — kabul kriteri 2.
 * Yalnızca aritmetik ÖNERİ üretir: ağırlık × mg/kg; formül ve birimler her
 * zaman görünürdür. Öneri "Onayla" ile ancak veteriner (prescription.sign)
 * onayıyla satıra kesinleşir — hiçbir doz otomatik uygulanmaz.
 */
export function DoseHelperCard({
  onPreview,
  onApprove,
  canApprove,
  busy,
  testIdPrefix = 'dose-helper',
}: {
  onPreview: (input: { weightKg: number; mgPerKg: number; frequencyPerDay?: number; durationDays?: number }) => Promise<DoseHelperResultDto>;
  onApprove: () => Promise<void>;
  canApprove: boolean;
  busy?: boolean;
  testIdPrefix?: string;
}) {
  const [weightKg, setWeightKg] = useState('');
  const [mgPerKg, setMgPerKg] = useState('');
  const [frequencyPerDay, setFrequencyPerDay] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [result, setResult] = useState<DoseHelperResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const preview = async () => {
    setError(null);
    const w = Number(weightKg);
    const m = Number(mgPerKg);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(m) || m <= 0) {
      setError('Ağırlık ve mg/kg pozitif sayı olmalıdır.');
      return;
    }
    try {
      const computed = await onPreview({
        weightKg: w,
        mgPerKg: m,
        ...(frequencyPerDay ? { frequencyPerDay: Number(frequencyPerDay) } : {}),
        ...(durationDays ? { durationDays: Number(durationDays) } : {}),
      });
      setResult(computed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Doz önerisi hesaplanamadı');
    }
  };

  const approve = async () => {
    setApproving(true);
    setError(null);
    try {
      await onApprove();
      setResult(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Onay verilemedi');
    } finally {
      setApproving(false);
    }
  };

  return (
    <div
      data-testid={testIdPrefix}
      className="rounded-lg border bg-muted/40 p-4 text-sm space-y-3"
    >
      <p className="font-medium">Doz Yardımcısı (öneri)</p>
      <p className="text-xs text-muted-foreground">
        Formül: <span className="font-mono">ağırlık (kg) × mg/kg</span>. Bu yardımcı
        yalnızca aritmetik öneri üretir; kesinleşmesi için veteriner onayı gerekir.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor={`${testIdPrefix}-weight`}>Ağırlık (kg)</Label>
          <Input
            id={`${testIdPrefix}-weight`}
            data-testid={`${testIdPrefix}-weight`}
            type="number"
            min="0.01"
            step="0.1"
            value={weightKg}
            onChange={(event) => setWeightKg(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${testIdPrefix}-mgkg`}>Doz (mg/kg)</Label>
          <Input
            id={`${testIdPrefix}-mgkg`}
            data-testid={`${testIdPrefix}-mgkg`}
            type="number"
            min="0.001"
            step="0.5"
            value={mgPerKg}
            onChange={(event) => setMgPerKg(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${testIdPrefix}-freq`}>Günlük sıklık</Label>
          <Input
            id={`${testIdPrefix}-freq`}
            data-testid={`${testIdPrefix}-freq`}
            type="number"
            min="1"
            step="1"
            value={frequencyPerDay}
            onChange={(event) => setFrequencyPerDay(event.target.value)}
            placeholder="ör. 2"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${testIdPrefix}-days`}>Süre (gün)</Label>
          <Input
            id={`${testIdPrefix}-days`}
            data-testid={`${testIdPrefix}-days`}
            type="number"
            min="1"
            step="1"
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
            placeholder="ör. 5"
          />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        data-testid={`${testIdPrefix}-hesapla`}
        onClick={() => void preview()}
        disabled={busy}
      >
        Öneriyi Hesapla
      </Button>
      {error ? (
        <div role="alert" data-testid={`${testIdPrefix}-hata`} className="rounded-md border border-destructive/30 bg-[var(--status-danger-bg)] px-3 py-2 text-xs">
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="rounded-md border bg-background p-3 space-y-2" data-testid={`${testIdPrefix}-sonuc`}>
          <p className="font-mono text-xs" data-testid={`${testIdPrefix}-formul`}>
            {result.formula} = {result.singleDose} {result.doseUnit}
          </p>
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Tek doz</dt>
              <dd className="font-medium" data-testid={`${testIdPrefix}-teksiniz`}>
                {result.singleDose} {result.doseUnit}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Günlük</dt>
              <dd className="font-medium">{result.dailyDose ?? '—'} {result.doseUnit}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Kurs toplamı</dt>
              <dd className="font-medium">{result.courseTotal ?? '—'} {result.doseUnit}</dd>
            </div>
          </dl>
          {canApprove ? (
            <Button
              type="button"
              data-testid={`${testIdPrefix}-onayla`}
              onClick={() => void approve()}
              disabled={approving}
            >
              {approving ? 'Onaylanıyor…' : 'Dozayı Onayla (veteriner)'}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Onay yalnızca reçete imza yetkisi olan veteriner tarafından verilebilir.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
