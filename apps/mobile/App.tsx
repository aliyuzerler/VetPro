import { useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav, type BottomNavTab } from './src/components/BottomNav';
import { StatusChip } from './src/components/StatusChip';
import { EmptyState } from './src/components/StateViews';
import { TodayAgendaScreen } from './src/screens/TodayAgendaScreen';
import { AppointmentDetailScreen } from './src/screens/AppointmentDetailScreen';
import {
  createMobileApi,
  type MobileApiSession,
  type MobileAppointment,
} from './src/lib/api';
import { COLORS, RADIUS, SPACING, TYPO } from './src/theme/tokens';

/**
 * VetCore mobil — Faz 05 güncellemesi.
 * design/SCREEN_MAP.md > Mobile: "Today dashboard and appointment agenda" +
 * "Appointment detail and check-in/status". Bugünün ajandası ve randevu detayı
 * gerçek API sözleşmesiyle (Bearer + X-Branch-Id) çalışır (ADR-004); oturum
 * kaynağı Faz 13'te SecureStore ile bağlanır — oturum yoksa ekranlar dürüst
 * "giriş gerekli" durumu gösterir, sahte veri/sahte iş akışı bulunmaz.
 */

type Screen = { kind: 'agenda' } | { kind: 'detail'; appointment: MobileAppointment };

/** Oturum kaynağı — Faz 13'te SecureStore login akışıyla doldurulur. */
const SESSION: MobileApiSession | null = null;

function PlaceholderScreen({
  title,
  description,
  phaseHint,
}: {
  title: string;
  description: string;
  phaseHint: string;
}) {
  return (
    <View style={styles.screenInner}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.emptyWrap}>
        <EmptyState title={title} description={description} phaseHint={phaseHint} />
      </View>
    </View>
  );
}

function MoreScreen() {
  return (
    <View style={styles.screenInner}>
      <Text style={styles.sectionTitle}>Daha Fazla</Text>
      <View style={styles.moreCard}>
        <Text style={styles.moreItem}>Hesap ve profil — Faz 13&apos;te</Text>
        <Text style={styles.moreItem}>Şube seçimi — Faz 13&apos;te</Text>
        <Text style={styles.moreItem}>Senkron merkezi — Faz 13&apos;te</Text>
        <Text style={styles.moreItem}>Destek ve gizlilik — Faz 15&apos;te</Text>
      </View>
      <Text style={styles.version}>VetCore mobil · Faz 05 · Randevu ajandası ve detay</Text>
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState<BottomNavTab>('bugun');
  const [screen, setScreen] = useState<Screen>({ kind: 'agenda' });
  const [reloadSignal, setReloadSignal] = useState(0);
  const insets = useSafeAreaInsets();

  // Oturum Faz 13'te bağlanana dek api çağrıları "giriş gerekli" durumu döndürür.
  const api = useMemo(
    () => createMobileApi(() => SESSION),
    // reloadSignal: eylem sonrası ajanda tazelemesi (state ile tetiklenir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reloadSignal],
  );

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {/* Üst güvenli alan + kabuk başlığı */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, SPACING.md) }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.wordmark}>VetCore</Text>
            <Text style={styles.headerSubtitle}>Veteriner Klinik Yönetimi</Text>
          </View>
          <StatusChip tone="info" label="Merkez Şube" />
        </View>
        <Text style={styles.headerNote}>
          Bugünün ajandası ve randevu detayı gerçek API sözleşmesiyle hazır — mobil kimlik
          Faz 13&apos;te bağlanır.
        </Text>
      </View>

      {/* İçerik — kaydırılabilir, alt navigasyonla çakışmaz */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'bugun' && screen.kind === 'agenda' && (
          <TodayAgendaScreen
            key={reloadSignal}
            api={api}
            hasSession={SESSION !== null}
            onOpenAppointment={(appointment) => setScreen({ kind: 'detail', appointment })}
          />
        )}
        {tab === 'bugun' && screen.kind === 'detail' && (
          <AppointmentDetailScreen
            api={api}
            appointment={screen.appointment}
            onBack={() => setScreen({ kind: 'agenda' })}
            onChanged={() => {
              setScreen({ kind: 'agenda' });
              setReloadSignal((signal) => signal + 1);
            }}
          />
        )}
        {tab === 'hastalar' && (
          <PlaceholderScreen
            title="Hasta arama"
            description="Hasta listesi, mikroçip ve hasta koduyla arama bu ekranda yer alacak."
            phaseHint="Faz 13'te aktifleşecek"
          />
        )}
        {tab === 'randevular' && (
          <PlaceholderScreen
            title="Randevu ajandası"
            description="Günlük ajanda 'Bugün' sekmesinde yer alır; bu sekme ileri tarihli ajanda için Faz 13'te genişletilecek."
            phaseHint="Faz 13'te aktifleşecek"
          />
        )}
        {tab === 'gorevler' && (
          <PlaceholderScreen
            title="Görevler"
            description="Klinik iç görev listesi ve hatırlatmalar burada yer alacak."
            phaseHint="İleri fazlarda"
          />
        )}
        {tab === 'daha-fazla' && <MoreScreen />}
      </ScrollView>

      <BottomNav active={tab} onChange={setTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.neutral50,
  },
  header: {
    backgroundColor: COLORS.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.neutral200,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    fontSize: TYPO.h2,
    fontWeight: '700',
    color: COLORS.brand900,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: TYPO.tiny,
    color: COLORS.brand700,
    marginTop: 2,
  },
  headerNote: {
    fontSize: TYPO.tiny,
    color: COLORS.neutral600,
    lineHeight: 16,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  screenInner: {
    gap: SPACING.lg,
  },
  sectionTitle: {
    fontSize: TYPO.h2,
    fontWeight: '700',
    color: COLORS.neutral950,
  },
  emptyWrap: {
    gap: SPACING.sm,
  },
  moreCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.neutral200,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  moreItem: {
    fontSize: TYPO.body,
    color: COLORS.neutral950,
    minHeight: 22,
  },
  version: {
    fontSize: TYPO.tiny,
    color: COLORS.neutral600,
    textAlign: 'center',
  },
});
