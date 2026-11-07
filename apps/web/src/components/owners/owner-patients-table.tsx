'use client';

import Link from 'next/link';
import { Heart, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PatientAlertBadges } from '@/components/patients/patient-search-list';
import type { OwnerPatient } from '@/lib/api-types';

/** Sahip detayındaki hasta tablosu — çoklu hasta ilişkilendirmesi görünümü. */
export function OwnerPatientsTable({
  ownerId,
  patients,
  canManage,
  onAdd,
}: {
  ownerId: string;
  patients: OwnerPatient[];
  canManage: boolean;
  onAdd?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="owner-patients">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Hastalar ({patients.length})</h3>
        {canManage && onAdd ? (
          <Button type="button" size="sm" onClick={onAdd} data-testid="add-patient-button">
            <Plus className="size-4" aria-hidden />
            Yeni hasta
          </Button>
        ) : null}
      </div>

      {patients.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-muted-foreground">
          <Heart className="size-6" aria-hidden />
          <p className="text-sm">Bu sahibin aktif hastası yok.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kod</TableHead>
                <TableHead>Hasta</TableHead>
                <TableHead>Tür / Irk</TableHead>
                <TableHead>Uyarılar</TableHead>
                <TableHead className="text-right">Detay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((patient) => (
                <TableRow key={patient.id} data-testid={`owner-patient-${patient.code}`}>
                  <TableCell className="font-mono text-xs">{patient.code}</TableCell>
                  <TableCell className="font-medium">{patient.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {patient.species.name}
                      {patient.breed ? ` · ${patient.breed.name}` : ''}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <PatientAlertBadges alerts={patient.alerts} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/hastalar/${patient.id}`}>Aç</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="sr-only">Sahip kimliği: {ownerId}</p>
    </div>
  );
}
