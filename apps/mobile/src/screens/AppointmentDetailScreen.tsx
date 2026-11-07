import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING, STATUS, TOUCH_TARGET_MIN, TYPO } from '../theme/tokens';
import { StatusChip, type StatusTone } from '../components/StatusChip';
import {
  MobileApiError,
  timeShort,
  type MobileApi,
  type MobileAppointment,
} from '../lib/api';

/**
 * Faz 05 — randevu detayı ve check-in/durum eylemleri (SCREEN_MAP > Mobile >
 * Appointment detail and check-in/status). Geçiş düğmeleri yalnızca API durum
 * makinesinin izin verdiği sıralar için sunulur; geçersiz sıra API'den 409 alır.
 */

const STATUS_TONES: Record<MobileAppointment['status'], StatusTone> = {
  scheduled: 'neutral',
  arrived: 'warning',
  waiting: 'info',
  in_consultation: 'info',
  completed: 'success',
  no_show: 'danger',
  cancelled: 'neutral',
};

const STATUS_LABELS: Record<MobileAppointment['status'], string> = {
  scheduled: 'Planlandı',
  arrived: 'Geldi',
  waiting: 'Beklemede',
  in_consultation: 'Muayenede',
  completed: 'Tamamlandı',
  no_show: 'Gelmedi',
  cancelled: 'İptal',
};

/** İzinli sonraki durumlar — API makinesiyle aynı (appointments.domain). */
const NEXT: Partial<Record<MobileAppointment['status'], { status: 'waiting' | 'in_consultation' | 'completed' | 'no_show'; label: string }[]>> = {
  scheduled: [{ status: 'no_show', label: 'Gelmedi' }],
  arrived: [
    { status: 'waiting', label: 'Beklemeye Al' },
    { status: 'in_consultation', label: 'Muayeneye Al' },
    { status: 'no_show', label: 'Gelmedi' },
  ],
  waiting: [
    { status: 'in_consultation', label: 'Muayeneye Al' },
    { status: 'no_show', label: 'Gelmedi' },
  ],
  in_consultation: [{ status: 'completed', label: 'Tamamla' }],
};

export function AppointmentDetailScreen({
  api,
  appointment,
  onBack,
  onChanged,
}: {
  api: MobileApi;
  appointment: MobileAppointment;
  onBack: () => void;
  /** Eylem başarılıysa çağrılır — ajanda tazeleme sinyali */
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (actionError) {
      setError(
        actionError instanceof MobileApiError
          ? actionError.message
          : 'İşlem başarısız oldu',
      );
    } finally {
      setBusy(false);
    }
  }

  const rows: { label: string; value: string }[] = [
    { label: 'Hasta', value: `${appointment.patient.name} (${appointment.patient.code})` },
    {
      label: 'Sahip',
      value: `${appointment.owner.firstName} ${appointment.owner.lastName}`,
    },
    { label: 'Tür', value: appointment.type.name },
    { label: 'Saat', value: `${timeShort(appointment.scheduledStart)}–${timeShort(appointment.scheduledEnd)}` },
    {
      label: 'Hekim',
      value: `${appointment.staff.firstName} ${appointment.staff.lastName}`,
    },
    { label: 'Oda', value: appointment.room?.name ?? 'Atanmadı' },
    { label: 'Şube', value: appointment.branch.name },
  ];

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ajandaya dön"
        onPress={onBack}
        style={styles.backButton}
      >
        <Text style={styles.backText}>← Ajanda</Text>
      </Pressable>

      <View style={styles.card}>
        {rows.map((row) => (
          <View key={row.label} style={styles.row} accessibilityRole="text">
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue}>{row.value}</Text>
          </View>
        ))}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Durum</Text>
          <StatusChip tone={STATUS_TONES[appointment.status]} label={STATUS_LABELS[appointment.status]} />
        </View>
      </View>

      {appointment.patient.alerts.length > 0 && (
        <View style={styles.alertCard} accessibilityRole="alert">
          <Text style={styles.alertTitle}>Hasta uyarıları</Text>
          {appointment.patient.alerts.map((alert) => (
            <Text key={alert.label} style={styles.alertItem}>
              • {alert.label}
            </Text>
          ))}
        </View>
      )}

      {appointment.notes && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Not</Text>
          <Text style={styles.noteText}>{appointment.notes}</Text>
        </View>
      )}

      {error !== null && (
        <View style={styles.errorCard} accessibilityRole="alert">
          <Text style={styles.errorMessage}>{error}</Text>
        </View>
      )}

      {(NEXT[appointment.status] ?? []).length > 0 && (
        <View style={styles.actionWrap}>
          {(NEXT[appointment.status] ?? []).map((action) => (
            <Pressable
              key={action.status}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              disabled={busy}
              onPress={() => void runAction(() => api.changeStatus(appointment.id, action.status))}
              style={({ pressed }) => [
                styles.actionButton,
                pressed && styles.actionPressed,
                busy && styles.actionDisabled,
              ]}
            >
              {busy && <ActivityIndicator color={COLORS.brand700} />}
              <Text style={styles.actionText}>{action.label}</Text>
            </Pressable>
          ))}
          {appointment.status === 'scheduled' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Check-in yap"
              disabled={busy}
              onPress={() => void runAction(() => api.checkIn(appointment.id))}
              style={({ pressed }) => [
                styles.actionPrimary,
                pressed && styles.actionPressed,
                busy && styles.actionDisabled,
              ]}
            >
              <Text style={styles.actionPrimaryText}>Check-in Yap</Text>
            </Pressable>
          )}
        </View>
      )}

      {(appointment.status === 'completed' || appointment.status === 'cancelled') && (
        <Text style={styles.terminalNote}>
          {STATUS_LABELS[appointment.status]} randevu — durum değişikliği yapılamaz.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: SPACING.md,
  },
  backButton: {
    minHeight: TOUCH_TARGET_MIN,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
  },
  backText: {
    fontSize: TYPO.body,
    fontWeight: '700',
    color: COLORS.brand700,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.neutral200,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
    gap: SPACING.md,
  },
  rowLabel: {
    fontSize: TYPO.small,
    color: COLORS.neutral600,
    width: 64,
  },
  rowValue: {
    fontSize: TYPO.body,
    fontWeight: '600',
    color: COLORS.neutral950,
    flex: 1,
    textAlign: 'right',
  },
  sectionLabel: {
    fontSize: TYPO.small,
    fontWeight: '700',
    color: COLORS.neutral600,
    textTransform: 'uppercase',
  },
  noteText: {
    fontSize: TYPO.body,
    color: COLORS.neutral950,
    marginTop: 4,
  },
  alertCard: {
    backgroundColor: STATUS.warningBg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 4,
  },
  alertTitle: {
    fontSize: TYPO.small,
    fontWeight: '700',
    color: STATUS.warning,
  },
  alertItem: {
    fontSize: TYPO.small,
    color: STATUS.warning,
  },
  errorCard: {
    backgroundColor: STATUS.dangerBg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  errorMessage: {
    fontSize: TYPO.small,
    color: STATUS.danger,
    fontWeight: '600',
  },
  actionWrap: {
    gap: SPACING.sm,
  },
  actionPrimary: {
    backgroundColor: COLORS.brand600,
    borderRadius: RADIUS.md,
    minHeight: TOUCH_TARGET_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  actionPrimaryText: {
    color: COLORS.white,
    fontSize: TYPO.body,
    fontWeight: '700',
  },
  actionButton: {
    backgroundColor: COLORS.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.neutral200,
    borderRadius: RADIUS.md,
    minHeight: TOUCH_TARGET_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  actionPressed: {
    opacity: 0.85,
  },
  actionDisabled: {
    opacity: 0.6,
  },
  actionText: {
    fontSize: TYPO.body,
    fontWeight: '600',
    color: COLORS.neutral950,
  },
  terminalNote: {
    fontSize: TYPO.small,
    color: COLORS.neutral600,
    textAlign: 'center',
  },
});
