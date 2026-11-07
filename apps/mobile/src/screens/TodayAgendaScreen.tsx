import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING, STATUS, TOUCH_TARGET_MIN, TYPO } from '../theme/tokens';
import { StatusChip, type StatusTone } from '../components/StatusChip';
import { EmptyState } from '../components/StateViews';
import { MobileApiError, timeShort, type MobileApi, type MobileAppointment } from '../lib/api';

/**
 * Faz 05 — bugünün ajandası (SCREEN_MAP > Mobile > Today dashboard and appointment
 * agenda). Veri gerçek API'den gelir; oturum yoksa giriş gerekli durumu gösterilir
 * (mobil kimlik Faz 13'te). Satıra dokununca randevu detayı açılır; durum eylemleri
 * yalnızca API makinesinin izinlediği sıralarda sunulur.
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

export function TodayAgendaScreen({
  api,
  hasSession,
  onOpenAppointment,
}: {
  api: MobileApi;
  hasSession: boolean;
  onOpenAppointment: (appointment: MobileAppointment) => void;
}) {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    appointments: MobileAppointment[];
  }>({ loading: false, error: null, appointments: [] });
  const [loaded, setLoaded] = useState(false);

  function load(): void {
    if (!hasSession) return;
    setState({ loading: true, error: null, appointments: [] });
    api
      .todayAppointments()
      .then((appointments) => {
        setState({ loading: false, error: null, appointments });
        setLoaded(true);
      })
      .catch((error: unknown) => {
        setState({
          loading: false,
          error:
            error instanceof MobileApiError ? error.message : 'Ajanda yüklenemedi — bağlantı hatası',
          appointments: [],
        });
        setLoaded(true);
      });
  }

  // İlk açılışta yükle (oturum Faz 13'te bağlanınca hasSession değişimi de tetikler)
  useEffect(() => {
    if (hasSession) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession]);

  if (!hasSession) {
    return (
      <View style={styles.wrap}>
        <EmptyState
          title="Ajanda için giriş gerekli"
          description="Bugünün ajandası oturum açıldığında gerçek randevu verisiyle yüklenir. Mobil kimlik akışı Faz 13'te bağlanacak."
          phaseHint="Mobil giriş — Faz 13"
        />
      </View>
    );
  }

  const counts = {
    total: state.appointments.length,
    waiting: state.appointments.filter((a) => a.status === 'arrived' || a.status === 'waiting').length,
    completed: state.appointments.filter((a) => a.status === 'completed').length,
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.kpiRow} accessibilityRole="text" accessibilityLabel="Gün özeti">
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{counts.total}</Text>
          <Text style={styles.kpiLabel}>Bugünkü randevu</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{counts.waiting}</Text>
          <Text style={styles.kpiLabel}>Aktif kuyruk</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{counts.completed}</Text>
          <Text style={styles.kpiLabel}>Tamamlanan</Text>
        </View>
      </View>

      {state.loading && (
        <View style={styles.loadingRow} accessibilityLiveRegion="polite">
          <ActivityIndicator color={COLORS.brand600} />
          <Text style={styles.loadingText}>Ajanda yükleniyor…</Text>
        </View>
      )}

      {state.error !== null && (
        <View style={styles.errorCard} accessibilityRole="alert">
          <Text style={styles.errorTitle}>Ajanda yüklenemedi</Text>
          <Text style={styles.errorMessage}>{state.error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Yeniden dene"
            onPress={load}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Yeniden dene</Text>
          </Pressable>
        </View>
      )}

      {loaded && state.error === null && state.appointments.length === 0 && (
        <EmptyState
          title="Bugün için randevu yok"
          description="Randevular web takviminden oluşturulur; ajanda otomatik yansır."
        />
      )}

      {state.appointments.length > 0 && (
        <ScrollView nestedScrollEnabled>
          {state.appointments.map((appointment) => (
            <Pressable
              key={appointment.id}
              accessibilityRole="button"
              accessibilityLabel={`${timeShort(appointment.scheduledStart)}, ${appointment.patient.name}, ${appointment.type.name}, durum: ${STATUS_LABELS[appointment.status]}`}
              onPress={() => onOpenAppointment(appointment)}
              style={({ pressed }) => [
                styles.agendaRow,
                pressed && styles.agendaRowPressed,
              ]}
              testID={`agenda-item-${appointment.id}`}
            >
              <Text style={styles.agendaTime}>{timeShort(appointment.scheduledStart)}</Text>
              <View style={styles.agendaInfo}>
                <Text style={styles.agendaPatient}>
                  {appointment.patient.name} ({appointment.patient.code})
                </Text>
                <Text style={styles.agendaProcedure}>
                  {appointment.type.name}
                  {appointment.room ? ` · ${appointment.room.name}` : ''}
                  {` · ${appointment.staff.firstName} ${appointment.staff.lastName}`}
                </Text>
                {appointment.patient.alerts.length > 0 && (
                  <Text style={styles.agendaAlert} accessibilityLabel="Hasta uyarısı">
                    Uyarı: {appointment.patient.alerts.map((a) => a.label).join(', ')}
                  </Text>
                )}
              </View>
              <StatusChip
                tone={STATUS_TONES[appointment.status]}
                label={STATUS_LABELS[appointment.status]}
              />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: SPACING.md,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  kpi: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.neutral200,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: TYPO.h2,
    fontWeight: '700',
    color: COLORS.brand700,
    fontVariant: ['tabular-nums'],
  },
  kpiLabel: {
    fontSize: TYPO.tiny,
    color: COLORS.neutral600,
    marginTop: 2,
    textAlign: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: TOUCH_TARGET_MIN,
  },
  loadingText: {
    fontSize: TYPO.body,
    color: COLORS.neutral600,
  },
  errorCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.neutral200,
    padding: SPACING.md,
    gap: 4,
  },
  errorTitle: {
    fontSize: TYPO.body,
    fontWeight: '700',
    color: COLORS.neutral950,
  },
  errorMessage: {
    fontSize: TYPO.small,
    color: COLORS.neutral600,
  },
  retryButton: {
    marginTop: SPACING.xs,
    minHeight: TOUCH_TARGET_MIN,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.brand50,
  },
  retryText: {
    fontSize: TYPO.small,
    fontWeight: '700',
    color: COLORS.brand700,
  },
  agendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.neutral200,
    padding: SPACING.md,
    gap: SPACING.md,
    minHeight: TOUCH_TARGET_MIN,
  },
  agendaRowPressed: {
    backgroundColor: COLORS.brand50,
  },
  agendaTime: {
    fontSize: TYPO.body,
    fontWeight: '700',
    color: COLORS.brand700,
    fontVariant: ['tabular-nums'],
    width: 44,
  },
  agendaInfo: {
    flex: 1,
    gap: 2,
  },
  agendaPatient: {
    fontSize: TYPO.body,
    fontWeight: '600',
    color: COLORS.neutral950,
  },
  agendaProcedure: {
    fontSize: TYPO.tiny,
    color: COLORS.neutral600,
  },
  agendaAlert: {
    fontSize: TYPO.tiny,
    color: STATUS.warning,
    fontWeight: '600',
  },
});
