import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav, type BottomNavTab } from './src/components/BottomNav';
import { StatusChip } from './src/components/StatusChip';
import { EmptyState, PendingAction } from './src/components/StateViews';
import { COLORS, RADIUS, SPACING, TYPO } from './src/theme/tokens';

/**
 * VetCore mobil kabuk — Faz 02.
 * design/DESIGN_SYSTEM.md > Mobile adaptation: alt navigasyon (Bugün, Hastalar,
 * Randevular, Görevler, Daha Fazla), ≥44 pt dokunma hedefleri, safe-area dolgusu.
 * Kimlik/şube seçimi Faz 03'te; gerçek hasta ve randevu akışları Faz 04/05'te;
 * çevrimdışı senkron Faz 13'te. Sahte iş akışı bulunmaz — tüm içerik sentetik demodur.
 */

interface AgendaItem {
  time: string;
  patient: string;
  species: string;
  procedure: string;
  status: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

const AGENDA: readonly AgendaItem[] = [
  {
    time: '09:30',
    patient: 'Tekir',
    species: 'Kedi',
    procedure: 'Kombinizasyon aşısı',
    status: 'Beklemede',
    tone: 'warning',
  },
  {
    time: '10:15',
    patient: 'Pamuk',
    species: 'Kedi',
    procedure: 'Genel muayene',
    status: 'Sürüyor',
    tone: 'info',
  },
  {
    time: '14:00',
    patient: 'Duman',
    species: 'Köpek',
    procedure: 'Diş temizliği',
    status: 'Planlandı',
    tone: 'neutral',
  },
];

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function TodayScreen() {
  return (
    <View style={styles.screenInner}>
      <Text style={styles.sectionTitle}>Bugünün programı</Text>
      <View style={styles.kpiRow}>
        <MiniKpi label="Bugünkü randevu" value="12" />
        <MiniKpi label="Bekleyen hasta" value="4" />
        <MiniKpi label="Vadesi gelen aşı" value="2" />
      </View>

      {AGENDA.map((item) => (
        <View
          key={`${item.time}-${item.patient}`}
          style={styles.agendaRow}
          accessibilityRole="text"
          accessibilityLabel={`${item.time}, ${item.patient}, ${item.procedure}, durum: ${item.status}`}
        >
          <Text style={styles.agendaTime}>{item.time}</Text>
          <View style={styles.agendaInfo}>
            <Text style={styles.agendaPatient}>
              {item.patient} · {item.species}
            </Text>
            <Text style={styles.agendaProcedure}>{item.procedure}</Text>
          </View>
          <StatusChip tone={item.tone} label={item.status} />
        </View>
      ))}

      <View style={styles.emptyWrap}>
        <EmptyState
          title="Bugün için bekleyen görev yok"
          description="Günün görevleri burada listelenecek. Yeni görev oluşturarak programı planlayabilirsiniz."
          phaseHint="Görev akışı Faz 05'te aktifleşecek"
        />
        <PendingAction label="Görev oluştur" phaseHint="Faz 05'te" />
      </View>
    </View>
  );
}

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
        <Text style={styles.moreItem}>Hesap ve profil — Faz 03&apos;te</Text>
        <Text style={styles.moreItem}>Şube seçimi — Faz 03&apos;te</Text>
        <Text style={styles.moreItem}>Senkron merkezi — Faz 13&apos;te</Text>
        <Text style={styles.moreItem}>Destek ve gizlilik — Faz 15&apos;te</Text>
      </View>
      <Text style={styles.version}>
        VetCore mobil kabuk · Faz 02 · Sentetik demo verisi
      </Text>
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState<BottomNavTab>('bugun');
  const insets = useSafeAreaInsets();

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
          Mobil kabuk önizlemesi — kimlik doğrulama Faz 03&apos;te, gerçek akışlar sonraki
          fazlarda eklenir.
        </Text>
      </View>

      {/* İçerik — kaydırılabilir, alt navigasyonla çakışmaz */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'bugun' && <TodayScreen />}
        {tab === 'hastalar' && (
          <PlaceholderScreen
            title="Hasta arama"
            description="Hasta listesi, mikroçip ve hasta koduyla arama bu ekranda yer alacak."
            phaseHint="Faz 04'te aktifleşecek"
          />
        )}
        {tab === 'randevular' && (
          <PlaceholderScreen
            title="Randevu ajandası"
            description="Günlük randevu ajandası ve durum güncelleme burada yer alacak."
            phaseHint="Faz 05'te aktifleşecek"
          />
        )}
        {tab === 'gorevler' && (
          <PlaceholderScreen
            title="Görevler"
            description="Klinik iç görev listesi ve hatırlatmalar burada yer alacak."
            phaseHint="Faz 05'te aktifleşecek"
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
  agendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.neutral200,
    padding: SPACING.md,
    gap: SPACING.md,
    minHeight: 44,
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
