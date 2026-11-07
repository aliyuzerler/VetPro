'use client';

import { AlertTriangle, Heart, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import type { PatientSummary, SpeciesOption } from '@/lib/api-types';

const GENDER_LABELS: Record<string, string> = {
  female: 'Dişi',
  male: 'Erkek',
  unknown: 'Bilinmiyor',
};

/** Hasta uyarı rozeti — alerji/kronik (kabul kriteri: listede görünür). */
export function PatientAlertBadges({ alerts }: { alerts: PatientSummary['alerts'] }) {
  const active = alerts.filter((alert) => alert.active);
  if (active.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1" data-testid="patient-alert-badges">
      {active.map((alert) => (
        <span
          key={alert.id}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            alert.severity === 'high'
              ? 'bg-[var(--status-danger-bg)] text-status-danger'
              : 'bg-[var(--status-warning-bg)] text-status-warning'
          }`}
          title={`${alert.kind} · ${alert.severity}`}
        >
          <AlertTriangle className="size-3" aria-hidden />
          {alert.label}
        </span>
      ))}
    </div>
  );
}

export function PatientSpeciesBadge({ patient }: { patient: PatientSummary }) {
  return (
    <Badge variant="secondary">
      {patient.species.name}
      {patient.breed ? ` · ${patient.breed.name}` : ''}
    </Badge>
  );
}

/**
 * Hasta listesi — arama (ad/kod/çip/sahip), tür filtresi ve uyarı rozetleri.
 * Saf sunum bileşeni; şube kapsamı API'de uygulanır (yetkisiz şube kayıtları gelmez).
 */
export function PatientSearchList({
  patients,
  query,
  onQueryChange,
  species,
  speciesFilter,
  onSpeciesFilterChange,
  onOpen,
}: {
  patients: PatientSummary[];
  query: string;
  onQueryChange: (value: string) => void;
  species: SpeciesOption[];
  speciesFilter: string;
  onSpeciesFilterChange: (value: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="patient-list">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Hasta adı, kod, mikroçip veya sahip ara…"
            className="pl-8"
            aria-label="Hasta ara"
            data-testid="patient-search"
          />
        </div>
        <Select value={speciesFilter} onValueChange={onSpeciesFilterChange}>
          <SelectTrigger className="w-40" aria-label="Tür filtresi" data-testid="species-filter">
            <SelectValue placeholder="Tüm türler" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm türler</SelectItem>
            {species.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {patients.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-muted-foreground">
          <Heart className="size-8" aria-hidden />
          <p className="text-sm font-medium text-foreground">Hasta bulunamadı</p>
          <p className="text-xs">
            Aramayı değiştirin veya sahip detayından yeni hasta ekleyin. Yalnızca erişim yetkiniz
            olan şubelerin hastaları listelenir.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kod</TableHead>
                <TableHead>Hasta</TableHead>
                <TableHead>Tür / Irk</TableHead>
                <TableHead>Sahip</TableHead>
                <TableHead>Uyarılar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((patient) => (
                <TableRow
                  key={patient.id}
                  className="cursor-pointer"
                  onClick={() => onOpen(patient.id)}
                  data-testid={`patient-row-${patient.code}`}
                >
                  <TableCell className="font-mono text-xs">{patient.code}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{patient.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {GENDER_LABELS[patient.gender] ?? patient.gender}
                        {patient.birthDate
                          ? ` · ${new Date(patient.birthDate).toLocaleDateString('tr-TR')}`
                          : ''}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <PatientSpeciesBadge patient={patient} />
                  </TableCell>
                  <TableCell>
                    {patient.owner.firstName} {patient.owner.lastName}
                  </TableCell>
                  <TableCell>
                    <PatientAlertBadges alerts={patient.alerts} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
