import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET_MIN, TYPO } from '../theme/tokens';

/**
 * Boş durum — rules/ui-ux.md: her ekran boş durumunu göstermeli ve
 * tek birincil sonraki eylemi açıklamalıdır (design/INTERACTION_RULES.md).
 * Aksiyon henüz ilgili fazda olmadığı için salt bilgilendirici sunulur;
 * sahte iş akışı içermez.
 */
export function EmptyState({
  title,
  description,
  phaseHint,
}: {
  title: string;
  description: string;
  /** Hangi fazda aktifleşeceği */
  phaseHint?: string;
}) {
  return (
    <View accessibilityRole="text" style={styles.box}>
      <View style={styles.iconHolder} accessible={false}>
        <View style={styles.iconLine} />
        <View style={[styles.iconLine, { width: '60%' }]} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {phaseHint ? <Text style={styles.hint}>{phaseHint}</Text> : null}
    </View>
  );
}

/** Devre dışı birincil eylem düğmesi — dokunma hedefi ≥44pt, aktifleşme fazı etiketli */
export function PendingAction({ label, phaseHint }: { label: string; phaseHint: string }) {
  return (
    <Pressable
      disabled
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel={`${label}, ${phaseHint} aktifleşecek`}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionHint}>{phaseHint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.neutral200,
    backgroundColor: COLORS.white,
    width: '100%',
  },
  iconHolder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.neutral100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 4,
  },
  iconLine: {
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.neutral600,
  },
  title: {
    fontSize: TYPO.body,
    fontWeight: '600',
    color: COLORS.neutral950,
    textAlign: 'center',
  },
  description: {
    fontSize: TYPO.small,
    color: COLORS.neutral600,
    textAlign: 'center',
    lineHeight: 18,
  },
  hint: {
    fontSize: TYPO.tiny,
    color: COLORS.brand600,
    marginTop: 2,
  },
  action: {
    minHeight: TOUCH_TARGET_MIN,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.neutral200,
    backgroundColor: COLORS.neutral50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    width: '100%',
  },
  actionPressed: {
    backgroundColor: COLORS.brand50,
  },
  actionLabel: {
    fontSize: TYPO.body,
    fontWeight: '600',
    color: COLORS.neutral600,
  },
  actionHint: {
    fontSize: TYPO.tiny,
    color: COLORS.neutral600,
    marginTop: 2,
  },
});
