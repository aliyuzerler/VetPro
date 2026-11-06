import { StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, STATUS, TYPO } from '../theme/tokens';

/**
 * Durum rozeti — design/DESIGN_SYSTEM.md > Status chips (mobil uyarlama).
 * Durum yalnızca renkle iletilmez: nokta + metin birlikte sunulur.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<StatusTone, { fg: string; bg: string; dot: string }> = {
  success: { fg: STATUS.success, bg: STATUS.successBg, dot: STATUS.success },
  warning: { fg: STATUS.warning, bg: STATUS.warningBg, dot: STATUS.warning },
  danger: { fg: STATUS.danger, bg: STATUS.dangerBg, dot: STATUS.danger },
  info: { fg: STATUS.info, bg: STATUS.infoBg, dot: STATUS.info },
  neutral: { fg: STATUS.neutral, bg: STATUS.neutralBg, dot: STATUS.neutral },
};

export function StatusChip({ tone, label }: { tone: StatusTone; label: string }) {
  const t = TONES[tone];
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Durum: ${label}`}
      style={[styles.chip, { backgroundColor: t.bg }]}
    >
      <View style={[styles.dot, { backgroundColor: t.dot }]} />
      <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: TYPO.small,
    fontWeight: '600',
    color: COLORS.neutral950,
  },
});
