'use client';

import { useState } from 'react';
import { ClipboardPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EncounterAddendum } from '@/lib/api-types';

function formatAdded(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Addendum paneli — yalnız imzalı kayıtlarda görünür; her ekleme denetim
 * defterine ADDENDUM_CREATED olarak yazılır (kabul kriteri 5). Orijinal kayıt
 * değişmez; düzeltme buradan referanslı olarak eklenir.
 */
export function AddendumPanel({
  addendums,
  canAdd,
  onAdd,
  saving,
}: {
  addendums: EncounterAddendum[];
  /** Yalnızca clinical.sign izni ve imzalı durum → true */
  canAdd: boolean;
  onAdd?: (body: string) => void;
  saving?: boolean;
}) {
  const [body, setBody] = useState('');

  const submit = (): void => {
    if (body.trim().length < 3) return;
    onAdd?.(body.trim());
    setBody('');
  };

  return (
    <div className="space-y-4" data-testid="addendum-panel">
      {canAdd ? (
        <div className="space-y-2">
          <Label htmlFor="addendum-body">Addendum (kayıt düzeltmesi)</Label>
          <Textarea
            id="addendum-body"
            data-testid="addendum-body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="İmza sonrası öğrenilen bilgiyi ve düzeltmeyi buraya yazın. Orijinal kayıt değişmez."
          />
          <Button
            type="button"
            data-testid="addendum-save"
            disabled={saving || body.trim().length < 3}
            onClick={submit}
          >
            <ClipboardPen aria-hidden="true" />
            {saving ? 'Ekleniyor…' : 'Addendum Ekle'}
          </Button>
        </div>
      ) : null}

      {addendums.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="addendum-empty">
          Addendum yok.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="addendum-list">
          {addendums.map((a) => (
            <li
              key={a.id}
              className="rounded-md border border-border bg-card px-3 py-2"
            >
              <p className="text-sm">{a.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.author.firstName} {a.author.lastName}
                {a.author.title ? ` — ${a.author.title}` : ''} · {formatAdded(a.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
