'use client';

import { useState, type FormEvent } from 'react';
import { Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { WeightObservation } from '@/lib/api-types';

/** Kilo geçmişi — doz hesabı ve eğilim için tüm gözlemler saklanır. */
export function WeightHistory({
  observations,
  canManage,
  onAdd,
  busy,
}: {
  observations: WeightObservation[];
  canManage: boolean;
  onAdd: (input: { weightKg: number; note?: string }) => void;
  busy?: boolean;
}) {
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number.parseFloat(weight.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return;
    onAdd({ weightKg: value, note: note.trim() || undefined });
    setWeight('');
    setNote('');
  }

  const latest = observations[0];

  return (
    <div className="flex flex-col gap-3" data-testid="weight-history">
      {latest ? (
        <div className="flex items-baseline gap-2">
          <Scale className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-2xl font-semibold" data-testid="latest-weight">
            {Number(latest.weightKg)} kg
          </span>
          <span className="text-xs text-muted-foreground">
            son ölçüm {new Date(latest.measuredAt).toLocaleDateString('tr-TR')}
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Kilo kaydı yok.</p>
      )}

      {observations.length > 1 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {observations.slice(1).map((observation) => (
            <li
              key={observation.id}
              className="flex items-center justify-between rounded-md border px-3 py-1.5"
            >
              <span className="font-medium">{Number(observation.weightKg)} kg</span>
              <span className="text-xs text-muted-foreground">
                {new Date(observation.measuredAt).toLocaleDateString('tr-TR')}
                {observation.note ? ` · ${observation.note}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {canManage ? (
        <form
          onSubmit={submit}
          className="flex flex-col gap-2 sm:flex-row"
          data-testid="weight-add-form"
        >
          <Input
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            placeholder="Kilo (kg)"
            aria-label="Kilo kilogram"
            inputMode="decimal"
            className="w-32"
            required
          />
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Not (opsiyonel)"
            aria-label="Kilo notu"
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={busy || !weight.trim()}>
            Kaydet
          </Button>
        </form>
      ) : null}
    </div>
  );
}
