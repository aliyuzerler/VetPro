'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SpeciesOption } from '@/lib/api-types';

export type PatientFormValues = {
  name: string;
  speciesId: string;
  breedId: string;
  gender: 'female' | 'male' | 'unknown';
  birthDate: string;
  microchip: string;
  neutered: boolean;
  color: string;
  initialWeightKg: string;
  alertLabel: string;
  alertKind: 'allergy' | 'chronic' | 'warning';
};

export const EMPTY_PATIENT_FORM: PatientFormValues = {
  name: '',
  speciesId: '',
  breedId: '',
  gender: 'unknown',
  birthDate: '',
  microchip: '',
  neutered: false,
  color: '',
  initialWeightKg: '',
  alertLabel: '',
  alertKind: 'allergy',
};

/**
 * Hasta ekleme formu — tür kataloğu prop'tan gelir (kapsayıcı /species çeker).
 * Mikroçip mükerrer kontrolü API'de 409 ile reddedilir; kullanıcıya ayrıca
 * /patients/duplicates uyarısı kapsayıcıda gösterilebilir (otomatik merge yok).
 */
export function PatientFormDialog({
  open,
  onOpenChange,
  ownerName,
  branchName,
  species,
  values,
  onValuesChange,
  onSubmit,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerName: string;
  branchName: string;
  species: SpeciesOption[];
  values: PatientFormValues;
  onValuesChange: (values: PatientFormValues) => void;
  onSubmit: (values: PatientFormValues) => void;
  busy?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const selectedSpecies = species.find((option) => option.id === values.speciesId);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!values.name.trim() || !values.speciesId) return;
    onSubmit(values);
  }

  function setField<K extends keyof PatientFormValues>(field: K, value: PatientFormValues[K]) {
    onValuesChange({ ...values, [field]: value });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Yeni hasta</DialogTitle>
          <DialogDescription>
            {ownerName} adlı sahibe yeni hasta eklenir. Kayıt şubesi: {branchName}. Hasta kodu
            otomatik üretilir.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="patient-form">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="patient-name">Hasta adı</Label>
              <Input
                id="patient-name"
                value={values.name}
                onChange={(event) => setField('name', event.target.value)}
                aria-invalid={touched && !values.name.trim()}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="patient-gender">Cinsiyet</Label>
              <Select
                value={values.gender}
                onValueChange={(value) => setField('gender', value as PatientFormValues['gender'])}
              >
                <SelectTrigger id="patient-gender">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Dişi</SelectItem>
                  <SelectItem value="male">Erkek</SelectItem>
                  <SelectItem value="unknown">Bilinmiyor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="patient-species">Tür</Label>
              <Select
                value={values.speciesId}
                onValueChange={(value) => {
                  onValuesChange({ ...values, speciesId: value, breedId: '' });
                }}
              >
                <SelectTrigger id="patient-species" data-testid="patient-species">
                  <SelectValue placeholder="Tür seçin" />
                </SelectTrigger>
                <SelectContent>
                  {species.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {touched && !values.speciesId ? (
                <p className="text-xs text-status-danger">Tür zorunludur</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="patient-breed">Irk (opsiyonel)</Label>
              <Select
                value={values.breedId || 'none'}
                onValueChange={(value) => setField('breedId', value === 'none' ? '' : value)}
                disabled={!selectedSpecies}
              >
                <SelectTrigger id="patient-breed" data-testid="patient-breed">
                  <SelectValue placeholder={selectedSpecies ? 'Irk seçin' : 'Önce tür seçin'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Belirtilmedi</SelectItem>
                  {(selectedSpecies?.breeds ?? []).map((breed) => (
                    <SelectItem key={breed.id} value={breed.id}>
                      {breed.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="patient-birth">Doğum tarihi (opsiyonel)</Label>
              <Input
                id="patient-birth"
                type="date"
                value={values.birthDate}
                onChange={(event) => setField('birthDate', event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="patient-microchip">Mikroçip (opsiyonel)</Label>
              <Input
                id="patient-microchip"
                value={values.microchip}
                onChange={(event) => setField('microchip', event.target.value)}
                placeholder="985xxxxxxxxxxxxx"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="patient-weight">İlk kilo — kg (opsiyonel)</Label>
              <Input
                id="patient-weight"
                value={values.initialWeightKg}
                onChange={(event) => setField('initialWeightKg', event.target.value)}
                inputMode="decimal"
                placeholder="4.2"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="patient-color">Renk (opsiyonel)</Label>
              <Input
                id="patient-color"
                value={values.color}
                onChange={(event) => setField('color', event.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm" htmlFor="patient-neutered">
            <Checkbox
              id="patient-neutered"
              checked={values.neutered}
              onCheckedChange={(checked) => setField('neutered', checked === true)}
            />
            Kısırlaştırılmış
          </label>

          <fieldset className="flex flex-col gap-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Başlangıç uyarısı (opsiyonel)</legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={values.alertKind}
                onValueChange={(value) =>
                  setField('alertKind', value as PatientFormValues['alertKind'])
                }
              >
                <SelectTrigger aria-label="Uyarı türü" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allergy">Alerji</SelectItem>
                  <SelectItem value="chronic">Kronik</SelectItem>
                  <SelectItem value="warning">Uyarı</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={values.alertLabel}
                onChange={(event) => setField('alertLabel', event.target.value)}
                placeholder="Örn. Penisilin alerjisi"
                aria-label="Uyarı etiketi"
              />
            </div>
          </fieldset>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Vazgeç
            </Button>
            <Button type="submit" disabled={busy} data-testid="patient-form-submit">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Hastayı kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
