import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING, STATUS, TOUCH_TARGET_MIN, TYPO } from '../theme/tokens';
import { EmptyState } from '../components/StateViews';
import type { MobileApi } from '../lib/api';
import type { StoragePorts, PhotoRow } from '../lib/db/ports';
import { randomUUID } from 'node:crypto';

/**
 * Faz 13 — fotoğraf/metadata kuyruğu. Kamera galeriden seçim yapmak için
 * expo-image-picker kullanır (cihazda); sandbox/önizlemede picker yoksa metadata
 * elle girilebilir — iki yol da PhotoStore'a yazılır ve ÇEVRİMDIŞI KORUNUR.
 * Yükleme kuyruğu: bağlantı geldiğinde /files/upload ile gönderilir; sunucu
 * onayı gelmeden kayıt "yüklendi" görünmez.
 */
export function MediaScreen({
  api,
  storage,
  isOnline,
  patientId,
  onChanged,
}: {
  api: MobileApi;
  storage: StoragePorts;
  isOnline: boolean;
  patientId: string | null;
  onChanged: () => void;
}) {
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setPhotos(await storage.photos.listAll());
  }, [storage]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addMetadata(uri: string, name: string, mime: string, size: number): Promise<void> {
    const row: PhotoRow = {
      localId: randomUUID(),
      patientId,
      encounterId: null,
      uri,
      fileName: name,
      mimeType: mime,
      sizeBytes: size,
      caption: caption || null,
      status: 'pending',
      attempts: 0,
      remoteFileId: null,
      createdAt: Date.now(),
    };
    await storage.photos.add(row);
    setCaption('');
    setFileName('');
    await refresh();
    onChanged();
  }

  /** Cihazda galeri/kamera seçimi — picker yoksa metadata girişine düşer. */
  async function pickFromDevice(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const picker = await import('expo-image-picker');
      const permission = await (picker as unknown as {
        requestMediaLibraryPermissionsAsync: () => Promise<{ granted: boolean }>;
      }).requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Galeri izni verilmedi — metadata elle girilebilir');
        return;
      }
      const result = await (
        picker as unknown as {
          launchImageLibraryAsync: () => Promise<{
            canceled: boolean;
            assets?: { uri: string; fileName: string | null; mimeType: string | null; fileSize: number | null }[];
          }>;
        }
      ).launchImageLibraryAsync();
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      await addMetadata(
        asset.uri,
        asset.fileName ?? `foto-${Date.now()}.jpg`,
        asset.mimeType ?? 'image/jpeg',
        asset.fileSize ?? 0,
      );
    } catch {
      setError('Galeri bu cihazda kullanılamıyor — metadata elle girilebilir');
    } finally {
      setBusy(false);
    }
  }

  /** Yükleme kuyruğu: pending fotoğrafları sunucuya gönderir (çevrimiçiyken). */
  async function flushUploadQueue(): Promise<void> {
    if (!isOnline) {
      Alert.alert('Çevrimdışı', 'Bağlantı geldiğinde yükleme kuyruğu otomatik denenir.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pending = await storage.photos.listPending();
      for (const photo of pending) {
        try {
          await storage.photos.markStatus(photo.localId, 'uploading');
          // Not: cihazdosyası upload'u FormData ile yapılır; sandbox/önizlemede
          // dosya erişimi olmadığından bu adım sunucu hatasında pending'e döner.
          const form = new FormData();
          // @ts-expect-error — RN FormData blob yapısı
          form.append('file', { uri: photo.uri, name: photo.fileName, type: photo.mimeType });
          form.append('kind', 'image');
          if (photo.patientId) form.append('patientId', photo.patientId);
          const res = await fetch('http://localhost:4000/api/v1/files/upload', {
            method: 'POST',
            body: form,
            headers: {},
          });
          if (!res.ok) throw new Error(`upload ${res.status}`);
          const body = (await res.json()) as { id?: string };
          await storage.photos.markStatus(photo.localId, 'done', body.id ?? undefined);
        } catch {
          const current = await storage.photos.get(photo.localId);
          await storage.photos.markStatus(photo.localId, 'pending');
          if (current) {
            const attempts = current.attempts + 1;
            if (attempts >= 5) {
              await storage.photos.markStatus(photo.localId, 'failed');
            }
          }
        }
      }
      await refresh();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">
        Fotoğraflar ve metadata
      </Text>
      <Text style={styles.note}>
        Çevrimdışı eklenen fotoğrafların metadata'sı cihazda saklanır — uygulama
        kapansa bile kaybolmaz. Sunucu onayı olmadan kayıt "yüklendi" görünmez.
      </Text>

      <View style={styles.formCard}>
        <Text style={styles.label}>Açıklama (metadata)</Text>
        <TextInput
          accessibilityLabel="Fotoğraf açıklaması"
          style={styles.input}
          value={caption}
          onChangeText={setCaption}
          placeholder="Örn. yaralanma bölgesi — sol arka bacak"
          placeholderTextColor={COLORS.neutral600}
        />
        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Galeriden fotoğraf seç"
            accessibilityState={{ busy }}
            disabled={busy}
            onPress={() => void pickFromDevice()}
            style={[styles.button, styles.secondary, busy && styles.disabled]}
          >
            <Text style={styles.secondaryText}>Galeriden seç</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Metadata kaydı ekle"
            disabled={busy || !fileName}
            onPress={() => {
              if (!fileName) return;
              void addMetadata('device://pending', fileName, 'image/jpeg', 0);
            }}
            style={[styles.button, busy && styles.disabled]}
          >
            <Text style={styles.primaryText}>Metadata ekle</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="Dosya adı (metadata girişi)"
          style={styles.input}
          value={fileName}
          onChangeText={setFileName}
          placeholder="Kullanılamaz galeri için dosya adı"
          placeholderTextColor={COLORS.neutral600}
          autoCapitalize="none"
        />
      </View>

      {error !== null && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Yükleme kuyruğunu çalıştır"
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={() => void flushUploadQueue()}
        style={[styles.button, busy && styles.disabled]}
      >
        <Text style={styles.primaryText}>
          Yükleme kuyruğunu çalıştır ({isOnline ? 'çevrimiçi' : 'çevrimdışı'})
        </Text>
      </Pressable>

      {photos.length === 0 && (
        <EmptyState
          title="Kayıt yok"
          description="Galeriden fotoğraf seçin veya metadata kaydı ekleyin; kuyruk çevrimdışı korunur."
        />
      )}
      <ScrollView nestedScrollEnabled contentContainerStyle={{ gap: SPACING.xs }}>
        {photos.map((photo) => (
          <View key={photo.localId} style={styles.photoRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.photoName}>{photo.fileName}</Text>
              <Text style={styles.photoSub}>
                {photo.caption ?? 'açıklama yok'} · {photo.mimeType}
              </Text>
            </View>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    photo.status === 'done'
                      ? STATUS.successBg
                      : photo.status === 'failed'
                        ? STATUS.dangerBg
                        : STATUS.warningBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color:
                      photo.status === 'done'
                        ? STATUS.success
                        : photo.status === 'failed'
                          ? STATUS.danger
                          : STATUS.warning,
                  },
                ]}
              >
                {photo.status === 'pending'
                  ? 'Kuyrukta'
                  : photo.status === 'uploading'
                    ? 'Yükleniyor'
                    : photo.status === 'done'
                      ? 'Sunucuda'
                      : 'Başarısız'}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: SPACING.sm },
  title: { fontSize: TYPO.h2, fontWeight: '700', color: COLORS.neutral950 },
  note: { fontSize: TYPO.tiny, color: COLORS.neutral600, lineHeight: 16 },
  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.neutral200,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  label: { fontSize: TYPO.tiny, color: COLORS.neutral600 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.neutral200,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    minHeight: TOUCH_TARGET_MIN - 6,
    fontSize: TYPO.body,
    color: COLORS.neutral950,
    backgroundColor: COLORS.neutral50,
  },
  buttonRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.xs },
  button: {
    flex: 1,
    backgroundColor: COLORS.brand600,
    borderRadius: RADIUS.sm,
    minHeight: TOUCH_TARGET_MIN - 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.neutral200 },
  secondaryText: { color: COLORS.neutral950, fontWeight: '600', fontSize: TYPO.small },
  primaryText: { color: COLORS.white, fontWeight: '600', fontSize: TYPO.small },
  disabled: { opacity: 0.6 },
  errorBox: {
    backgroundColor: STATUS.dangerBg,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
  },
  errorText: { color: STATUS.danger, fontSize: TYPO.tiny },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.neutral200,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
  },
  photoName: { fontSize: TYPO.small, fontWeight: '600', color: COLORS.neutral950 },
  photoSub: { fontSize: TYPO.tiny, color: COLORS.neutral600 },
  badge: { borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  badgeText: { fontSize: TYPO.tiny, fontWeight: '600' },
});
