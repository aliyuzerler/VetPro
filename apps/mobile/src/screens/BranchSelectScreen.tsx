import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING, STATUS, TOUCH_TARGET_MIN, TYPO } from '../theme/tokens';
import type { AuthMeResponse } from '../lib/api';

/**
 * Faz 13 — şube seçimi. /auth/me'den gelen şube listesi; seçim sunucuya
 * /auth/active-branch ile yazılır (hata tolere edilir — yerel seçim geçerli)
 * ve oturum deposuna kaydedilir. Çok şubeli personel için zorunlu adım;
 * tek şubeli personel bu ekranı görmez.
 */
export function BranchSelectScreen({
  me,
  onSelect,
}: {
  me: AuthMeResponse;
  onSelect: (branch: { id: string; name: string; code: string }) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">
        Şube seçin
      </Text>
      <Text style={styles.subtitle}>
        Merhaba {me.staff.fullName}. Hangi şubede çalışıyorsunuz?
      </Text>
      <View style={styles.list}>
        {me.branches.map((branch) => (
          <Pressable
            key={branch.id}
            accessibilityRole="button"
            accessibilityLabel={`${branch.name} şubesini seç`}
            onPress={() => onSelect(branch)}
            style={({ pressed }) => [styles.branchCard, pressed && styles.pressed]}
          >
            <Text style={styles.branchName}>{branch.name}</Text>
            <Text style={styles.branchCode}>{branch.code}</Text>
            {branch.isDefault && (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultText}>Varsayılan</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
      {me.branches.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Hesabınıza atanmış aktif şube bulunamadı. Klinik yöneticinizle görüşün.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: SPACING.lg, gap: SPACING.md },
  title: { fontSize: TYPO.h2, fontWeight: '700', color: COLORS.neutral950 },
  subtitle: { fontSize: TYPO.body, color: COLORS.neutral600 },
  list: { gap: SPACING.sm },
  branchCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.neutral200,
    padding: SPACING.lg,
    minHeight: TOUCH_TARGET_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  pressed: { backgroundColor: COLORS.brand50 },
  branchName: { fontSize: TYPO.body, fontWeight: '600', color: COLORS.neutral950, flex: 1 },
  branchCode: { fontSize: TYPO.tiny, color: COLORS.neutral600 },
  defaultBadge: {
    backgroundColor: STATUS.successBg,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  defaultText: { color: STATUS.success, fontSize: TYPO.tiny },
  empty: {
    backgroundColor: STATUS.warningBg,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  emptyText: { color: STATUS.warning, fontSize: TYPO.small },
});
