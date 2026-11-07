'use client';

import { AlertTriangle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OwnerDuplicateCandidate } from '@/lib/api-types';

const REASON_LABELS: Record<string, string> = {
  phone: 'Aynı telefon',
  email: 'Aynı e-posta',
  name: 'Aynı ad soyad',
};

/**
 * Mükerrer kayıt uyarısı (kabul kriteri): olası çift kayıtlar kullanıcıya
 * gösterilir; otomatik birleştirme YAPILMAZ — kullanıcı açıkça karar verir.
 */
export function DuplicateWarning({
  candidates,
  onProceed,
  onCancel,
  busy,
}: {
  candidates: OwnerDuplicateCandidate[];
  onProceed: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-status-warning bg-[var(--status-warning-bg)] p-4 text-sm"
      data-testid="duplicate-warning"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-status-warning" aria-hidden />
        <div>
          <p className="font-medium">Olası mükerrer kayıt bulundu</p>
          {/* Not: uyarı zemini tonlu olduğu için açıklama metni muted-foreground yerine
              tam ön plan rengiyle yazılır — axe kontrast eşiği (4.5:1) buna göre doğrulanır. */}
          <p className="text-foreground">
            Aşağıdaki kayıtlar yeni girilen bilgilerle eşleşiyor. Lütfen kontrol edin — otomatik
            birleştirme yapılmaz.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {candidates.map((candidate) => (
          <li
            key={candidate.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
            data-testid={`duplicate-candidate-${candidate.id}`}
          >
            <div className="flex flex-col">
              <span className="font-medium">
                {candidate.firstName} {candidate.lastName}
              </span>
              {candidate.primaryContact ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="size-3" aria-hidden />
                  {candidate.primaryContact.value}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1">
              {candidate.reasons.map((reason) => (
                <span
                  key={reason}
                  className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-status-warning"
                >
                  {REASON_LABELS[reason] ?? reason}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Vazgeç
        </Button>
        <Button type="button" onClick={onProceed} disabled={busy} data-testid="duplicate-proceed">
          Yine de kaydet
        </Button>
      </div>
    </div>
  );
}
