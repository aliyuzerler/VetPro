import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING, STATUS, TOUCH_TARGET_MIN, TYPO } from '../theme/tokens';
import { MobileApiError, type MobileApi, type AuthMeResponse } from '../lib/api';

/**
 * Faz 13 — mobil giriş ekranı. Gerçek /auth/login + /auth/me akışı; token'lar
 * SecureStore'a App kabuğunda yazılır. Demo kimlik bilgileri ekranda yazmaz —
 * sentetik demo hesapları docs/README'de belgelenmiştir.
 */
export function LoginScreen({
  api,
  onAuthenticated,
}: {
  api: MobileApi;
  onAuthenticated: (tokens: { accessToken: string; refreshToken: string }, me: AuthMeResponse) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!email.trim() || !password) {
      setError('E-posta ve parola zorunludur');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const tokens = await api.login(email.trim().toLowerCase(), password);
      const me = await api.me({ accessToken: tokens.accessToken });
      onAuthenticated(tokens, me);
    } catch (loginError) {
      setError(
        loginError instanceof MobileApiError
          ? loginError.status === 401
            ? 'E-posta veya parola hatalı'
            : loginError.message
          : 'Giriş başarısız — sunucuya ulaşılamadı',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <View style={styles.wrap}>
        <Text style={styles.brand} accessibilityRole="header">
          VetCore mobil
        </Text>
        <Text style={styles.subtitle}>Klinik personel uygulaması</Text>

        <View style={styles.card}>
          <Text style={styles.label} accessibilityRole="text">
            E-posta
          </Text>
          <TextInput
            accessibilityLabel="E-posta"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="ad@klinik.example"
            placeholderTextColor={COLORS.neutral600}
          />
          <Text style={styles.label} accessibilityRole="text">
            Parola
          </Text>
          <TextInput
            accessibilityLabel="Parola"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="••••••••"
            placeholderTextColor={COLORS.neutral600}
          />
          {error !== null && (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Giriş yap"
            accessibilityState={{ busy }}
            onPress={submit}
            disabled={busy}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            {busy ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.buttonText}>Giriş yap</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.note}>
          Çevrimdışı çalışma: giriş sonrası ajanda, taslak ve fotoğraflar cihazda
          saklanır; bağlantı geldiğinde sunucuyla senkronize edilir.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: {
    flex: 1,
    justifyContent: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  brand: {
    fontSize: TYPO.h1,
    fontWeight: '700',
    color: COLORS.neutral950,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: TYPO.body,
    color: COLORS.neutral600,
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.xs,
  },
  label: {
    fontSize: TYPO.tiny,
    color: COLORS.neutral600,
    marginTop: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.neutral200,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    minHeight: TOUCH_TARGET_MIN,
    fontSize: TYPO.body,
    color: COLORS.neutral950,
    backgroundColor: COLORS.neutral50,
  },
  errorBox: {
    backgroundColor: STATUS.dangerBg,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  errorText: { color: STATUS.danger, fontSize: TYPO.tiny },
  button: {
    backgroundColor: COLORS.brand600,
    borderRadius: RADIUS.md,
    minHeight: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  buttonPressed: { backgroundColor: COLORS.brand700 },
  buttonText: { color: COLORS.white, fontSize: TYPO.body, fontWeight: '600' },
  note: {
    fontSize: TYPO.tiny,
    color: COLORS.neutral600,
    textAlign: 'center',
    lineHeight: 16,
  },
});
