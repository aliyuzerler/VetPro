'use client';

import { useState } from 'react';
import { Save, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type SoapValues = {
  chiefComplaint: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  notes: string;
};

export const SOAP_EMPTY: SoapValues = {
  chiefComplaint: '',
  subjective: '',
  objective: '',
  assessment: '',
  plan: '',
  notes: '',
};

const SOAP_FIELDS: { key: keyof SoapValues; label: string; hint: string; rows: number }[] = [
  { key: 'subjective', label: 'S — Subjektif (Anamnez)', hint: 'Sahibin beyanı, şikâyet öyküsü', rows: 3 },
  { key: 'objective', label: 'O — Objektif (Bulgu)', hint: 'Klinik muayene bulguları', rows: 3 },
  { key: 'assessment', label: 'A — Değerlendirme', hint: 'Tanı ve differansiyel değerlendirme', rows: 3 },
  { key: 'plan', label: 'P — Plan', hint: 'Tedavi ve takip planı', rows: 3 },
];

/**
 * SOAP editörü — kaydedilen alanlar yeniden açıldığında doldurulur (kabul
 * kriteri 1). İmzalı kayıtta salt-okunur gösterim (kabul kriteri 4): alanlar
 * disabled ve kilit rozeti görünür.
 *
 * Not: `values` prop'u kayıttan gelir; encounter değiştiğinde üst bileşen
 * `key` ile yeni örnek bağlar (setState-in-effect yerine React önerisi).
 */
export function SoapEditor({
  values,
  editable,
  saving,
  onSave,
}: {
  values: SoapValues;
  editable: boolean;
  saving?: boolean;
  onSave?: (values: SoapValues) => void;
}) {
  const [draft, setDraft] = useState<SoapValues>(values);

  return (
    <div className="space-y-4" data-testid="soap-editor">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="encounter-chief-complaint">Başvuru Şikâyeti</Label>
          <Input
            id="encounter-chief-complaint"
            data-testid="soap-chief-complaint"
            value={draft.chiefComplaint}
            disabled={!editable}
            onChange={(e) => setDraft({ ...draft, chiefComplaint: e.target.value })}
            placeholder="Kısaca başlıca şikâyet"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="encounter-notes">Notlar</Label>
          <Input
            id="encounter-notes"
            data-testid="soap-notes"
            value={draft.notes}
            disabled={!editable}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Ek not (aşı kartı, özel durum)"
          />
        </div>
      </div>

      {SOAP_FIELDS.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={`encounter-soap-${field.key}`}>{field.label}</Label>
          <Textarea
            id={`encounter-soap-${field.key}`}
            data-testid={`soap-${field.key}`}
            rows={field.rows}
            value={draft[field.key]}
            disabled={!editable}
            onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
            placeholder={field.hint}
          />
        </div>
      ))}

      {editable ? (
        <Button
          type="button"
          data-testid="soap-save"
          disabled={saving}
          onClick={() => onSave?.(draft)}
        >
          <Save aria-hidden="true" />
          {saving ? 'Kaydediliyor…' : 'SOAP Kaydet'}
        </Button>
      ) : (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="soap-locked-note"
        >
          <Lock aria-hidden="true" className="size-4" />
          İmzalı kayıt — alanlar kilitli. Düzeltmeler addendum ile yapılır.
        </p>
      )}
    </div>
  );
}
