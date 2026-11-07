import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET_MIN, TYPO } from '../theme/tokens';

/**
 * Alt navigasyon — design/DESIGN_SYSTEM.md > Mobile adaptation:
 * "Bottom navigation for Today, Patients, Appointments, Tasks, More".
 * Tüm hedefler ≥44×44 pt; güvenli alan (safe area) dolgusu useSafeAreaInsets ile eklenir.
 * İkonlar bağımlılık eklemeden saf View geometrileriyle çizilir (dekoratif; erişilebilir
 * ad düğme üzerinde). Faal sekme yalnızca renkle değil, ağırlık + nokta göstergesiyle
 * belirtilir (rules/accessibility.md).
 */
export type BottomNavTab = 'bugun' | 'hastalar' | 'randevular' | 'gorevler' | 'daha-fazla';

const TABS: Array<{ id: BottomNavTab; label: string }> = [
  { id: 'bugun', label: 'Bugün' },
  { id: 'hastalar', label: 'Hastalar' },
  { id: 'randevular', label: 'Randevular' },
  { id: 'gorevler', label: 'Görevler' },
  { id: 'daha-fazla', label: 'Daha Fazla' },
];

function TabIcon({ tab, active }: { tab: BottomNavTab; active: boolean }) {
  const c = active ? COLORS.brand600 : COLORS.neutral600;
  const size = 22;

  switch (tab) {
    case 'bugun': // takvim: gövde + üst bar + iki nokta
      return (
        <View style={[{ width: size, height: size }, styles.center]} accessible={false}>
          <View style={[styles.calendar, { borderColor: c }]}>
            <View style={[styles.calendarTop, { backgroundColor: c }]} />
            <View style={styles.calendarDots}>
              <View style={[styles.calendarDot, { backgroundColor: c }]} />
              <View style={[styles.calendarDot, { backgroundColor: c }]} />
            </View>
          </View>
        </View>
      );
    case 'hastalar': // iki hasta başı: büyük + küçük daire
      return (
        <View style={[{ width: size, height: size }, styles.center, styles.row]} accessible={false}>
          <View style={[styles.head, { borderColor: c, width: 12, height: 12 }]} />
          <View
            style={[
              styles.head,
              { borderColor: c, width: 8, height: 8, marginLeft: -4, marginTop: 4 },
            ]}
          />
        </View>
      );
    case 'randevular': // saat: halka + akrep/yelkovan
      return (
        <View style={[{ width: size, height: size }, styles.center]} accessible={false}>
          <View style={[styles.clock, { borderColor: c }]}>
            <View style={[styles.hand, { backgroundColor: c, transform: [{ rotate: '45deg' }] }]} />
            <View
              style={[
                styles.hand,
                { backgroundColor: c, width: 7, transform: [{ rotate: '-90deg' }] },
              ]}
            />
          </View>
        </View>
      );
    case 'gorevler': // görev: köşeli kare + tik çubukları
      return (
        <View style={[{ width: size, height: size }, styles.center]} accessible={false}>
          <View style={[styles.taskBox, { borderColor: c }]}>
            <View style={[styles.tickA, { backgroundColor: c }]} />
            <View style={[styles.tickB, { backgroundColor: c }]} />
          </View>
        </View>
      );
    case 'daha-fazla': // üç nokta
      return (
        <View style={[{ width: size, height: size }, styles.center, styles.row]} accessible={false}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.moreDot, { backgroundColor: c, marginHorizontal: 2 }]} />
          ))}
        </View>
      );
  }
}

export function BottomNav({
  active,
  onChange,
}: {
  active: BottomNavTab;
  onChange: (tab: BottomNavTab) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
            hitSlop={4}
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            <TabIcon tab={tab.id} active={isActive} />
            <Text
              style={[
                styles.tabLabel,
                { color: isActive ? COLORS.brand600 : COLORS.neutral600 },
                isActive && styles.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeDot} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.neutral200,
    backgroundColor: COLORS.white,
    paddingTop: SPACING.xs,
  },
  tab: {
    flex: 1,
    minHeight: TOUCH_TARGET_MIN + 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: RADIUS.sm,
  },
  tabPressed: {
    backgroundColor: COLORS.brand50,
  },
  tabLabel: {
    fontSize: TYPO.tiny,
    fontWeight: '500',
  },
  tabLabelActive: {
    fontWeight: '700',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.brand600,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  calendar: {
    width: 18,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.5,
    overflow: 'hidden',
    paddingTop: 3,
    alignItems: 'center',
  },
  calendarTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3.5,
  },
  calendarDots: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
  },
  calendarDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  head: {
    borderRadius: 999,
    borderWidth: 1.5,
  },
  clock: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hand: {
    position: 'absolute',
    width: 5,
    height: 1.5,
    borderRadius: 1,
  },
  taskBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickA: {
    position: 'absolute',
    width: 5,
    height: 1.5,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }, { translateX: -1 }, { translateY: 2 }],
  },
  tickB: {
    position: 'absolute',
    width: 8,
    height: 1.5,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }, { translateX: 1 }, { translateY: 1 }],
  },
  moreDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
