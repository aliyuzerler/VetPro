import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Faz 01 iskeleti: uygulama geliştirme modunda açılabilir.
 * Tasarım sistemi ve personel iş akışları Faz 02 ve Faz 13 kapsamında inşa edilir.
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1FAF8',
    paddingHorizontal: 24,
  },
  wordmark: {
    fontSize: 32,
    fontWeight: '700',
    color: '#173B39',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#216A64',
    marginTop: 8,
  },
  phase: {
    fontSize: 13,
    color: '#6E7C80',
    marginTop: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Text accessibilityRole="header" style={styles.wordmark}>
        VetCore
      </Text>
      <Text style={styles.subtitle}>Veteriner Klinik Yönetim Platformu</Text>
      <Text style={styles.phase}>
        Faz 01 — Monorepo ve altyapı iskeleti kurulu.{'\n'}
        Personel mobil iş akışları sonraki fazlarda eklenecektir.
      </Text>
    </View>
  );
}
