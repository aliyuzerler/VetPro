import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING, STATUS, TOUCH_TARGET_MIN, TYPO } from '../theme/tokens';
import { EmptyState } from '../components/StateViews';
import type { MobilePatientSummary } from '../lib/api';
import type { StoragePorts, DraftRow } from '../lib/db/ports';
import type { SyncEngine } from '../lib/sync/engine';

/**
 * Faz 13 — çevrimdışı muayene taslağı (SOAP + vital). Kaydet her koşulda
 * ÇALIŞIR: çevrimdışıyken veri cihazda saklanır ve outbox'a işlem girer;
 * bağlantı geldiğinde sunucu onayıyla kalıcılaşır (syncState ile görünür).
 * Kesinleştirme (finalize) bilinçli olarak BU EKRANDA YOKTUR — hizmet/stok/
 * ücret kesinleşmesi yalnız sunucu onaylı çevrimiçi uçlarla yapılır.
 */
export function EncounterDraftScreen({
  storage,
  engine,
  patient,
  appointmentId,
  onBack,
  onSynced,
}: {
  storage: StoragePorts;
  engine: SyncEngine;
  patient: MobilePatientSummary;
  appointmentId: string | null;
  onBack: () => void;
  onSynced: () => void;
}) {
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [tempC, setTempC] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hastanın açık taslağı varsa yükle (restart recovery: queued taslak korunur).
  useEffect(() => {
    void (async () => {
      const existing = (await storage.drafts.list()).find(
        (d) => d.patientId === patient.id && d.syncState !== 'synced',
      );
      const row = existing ?? null;
      setDraft(row);
      if (row) {
        setChiefComplaint(row.chiefComplaint ?? '');
        setSubjective(row.subjective ?? '');
        setObjective(row.objective ?? '');
        setAssessment(row.assessment ?? '');
        setPlan(row.plan ?? '');
        if (row.vitals) {
          try {
            const v = JSON.parse(row.vitals) as { tempC?: string; weightKg?: string };
            setTempC(v.tempC ?? '');
            setWeightKg(v.weightKg ?? '');
          } catch {
            // bozuk vital verisi formu bloklamaz
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  const syncStateLabel: Record<DraftRow['syncState'], { text: string; bg: string; fg: string }> = {
    local_only: { text: 'Cihazda — gönderilmedi', bg: STATUS.neutralBg, fg: STATUS.neutral },
    draft: { text: 'Taslak — gönderilmedi', bg: STATUS.neutralBg, fg: STATUS.neutral },
    queued: { text: 'Gönderim kuyruğunda', bg: STATUS.warningBg, fg: STATUS.warning },
    synced: { text: 'Sunucu onaylı', bg: STATUS.successBg, fg: STATUS.success },
    conflict: { text: 'Çakışma — senkron merkezinde çözün', bg: STATUS.dangerBg, fg: STATUS.danger },
    error: { text: 'Gönderim hatası — yeniden denenecek', bg: STATUS.dangerBg, fg: STATUS.danger },
  };

  const save = useCallback(
    async (thenSync: boolean): Promise<void> => {
      setBusy(true);
      setError(null);
      setFeedback(null);
      try {
        const vitals = {
          ...(tempC ? { tempC } : {}),
          ...(weightKg ? { weightKg } : {}),
        };
        const now = Date.now();
        const base: DraftRow = {
          localId: draft?.localId ?? `local-${now}-${Math.random().toString(36).slice(2, 8)}`,
          serverId: draft?.serverId ?? null,
          serverVersion: draft?.serverVersion ?? null,
          patientId: patient.id,
          patientName: patient.name,
          appointmentId,
          chiefComplaint: chiefComplaint || null,
          subjective: subjective || null,
          objective: objective || null,
          assessment: assessment || null,
          plan: plan || null,
          notes: null,
          vitals: Object.keys(vitals).length ? JSON.stringify(vitals) : null,
          syncState: 'local_only',
          lastOperationId: draft?.lastOperationId ?? null,
          updatedAt: now,
          createdAt: draft?.createdAt ?? now,
        };

        // 1) Taslağı cihazda kalıcı kıl (çevrimdışı güvenlik).
        const persisted = { ...base, syncState: 'queued' as const };
        await storage.drafts.upsert(persisted);
        setDraft(persisted);

        // 2) Outbox işlemi üret.
        const clientOperationId = await engine.enqueue(
          base.serverId
            ? {
                kind: 'encounter.update_draft',
                entity: 'encounter',
                entityId: base.serverId,
                expectedVersion: base.serverVersion ?? '1',
                payload: {
                  ...(chiefComplaint ? { chiefComplaint } : {}),
                  ...(subjective ? { subjective } : {}),
                  ...(objective ? { objective } : {}),
                  ...(assessment ? { assessment } : {}),
                  ...(plan ? { plan } : {}),
                },
              }
            : {
                kind: 'encounter.create_draft',
                entity: 'encounter',
                expectedVersion: '0',
                payload: {
                  patientId: patient.id,
                  ...(appointmentId ? { appointmentId } : {}),
                  ...(chiefComplaint ? { chiefComplaint } : {}),
                  ...(subjective ? { subjective } : {}),
                  ...(objective ? { objective } : {}),
                  ...(assessment ? { assessment } : {}),
                  ...(plan ? { plan } : {}),
                },
              },
        );
        await storage.drafts.upsert({ ...persisted, lastOperationId: clientOperationId });
        setDraft({ ...persisted, lastOperationId: clientOperationId });

        if (thenSync) {
          const summary = await engine.syncNow();
          if (summary.push.networkError) {
            setFeedback('Kaydedildi (cihazda) — bağlantı yok, gönderim kuyrukta');
          } else {
            const fresh = await storage.drafts.get(persisted.localId);
            setDraft(fresh);
            setFeedback(
              fresh?.syncState === 'synced'
                ? 'Kaydedildi ve sunucu onaylandı'
                : fresh?.syncState === 'conflict'
                  ? 'Çakışma oluştu — senkron merkezinde iki versiyon korunuyor'
                  : 'Kaydedildi — gönderim kuyrukta',
            );
            onSynced();
          }
        } else {
          setFeedback('Kaydedildi (cihazda) — gönderim kuyrukta');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Kaydetme başarısız');
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, patient.id, patient.name, appointmentId, chiefComplaint, subjective, objective, assessment, plan, tempC, weightKg],
  );

  const stateBadge = draft ? syncStateLabel[draft.syncState] : null;

  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" accessibilityLabel="Geri dön" onPress={onBack}>
        <Text style={styles.back}>← Geri</Text>
      </Pressable>

      <View style={styles.headerRow}>
        <Text style={styles.title} accessibilityRole="header">
          Muayene taslağı — {patient.name}
        </Text>
        {stateBadge && (
          <View style={[styles.badge, { backgroundColor: stateBadge.bg }]}>
            <Text style={[styles.badgeText, { color: stateBadge.fg }]}>{stateBadge.text}</Text>
          </View>
        )}
      </View>

      <ScrollView nestedScrollEnabled contentContainerStyle={styles.form}>
        <Text style={styles.label}>Şikayet</Text>
        <TextInput
          accessibilityLabel="Şikayet"
          style={styles.input}
          value={chiefComplaint}
          onChangeText={setChiefComplaint}
          multiline
          placeholder="Klinik şikayet özeti"
          placeholderTextColor={COLORS.neutral600}
        />
        <Text style={styles.label}>S — Anamnez (sahip beyanı)</Text>
        <TextInput
          accessibilityLabel="Subjektif anamnez"
          style={styles.input}
          value={subjective}
          onChangeText={setSubjective}
          multiline
          placeholder="Sahibin beyanları, başlangıç zamanı"
          placeholderTextColor={COLORS.neutral600}
        />
        <Text style={styles.label}>O — Klinik bulgu</Text>
        <TextInput
          accessibilityLabel="Objektif bulgular"
          style={styles.input}
          value={objective}
          onChangeText={setObjective}
          multiline
          placeholder="Muayene bulguları"
          placeholderTextColor={COLORS.neutral600}
        />
        <Text style={styles.label}>A — Değerlendirme</Text>
        <TextInput
          accessibilityLabel="Değerlendirme"
          style={styles.input}
          value={assessment}
          onChangeText={setAssessment}
          multiline
          placeholder="Tanı değerlendirmesi"
          placeholderTextColor={COLORS.neutral600}
        />
        <Text style={styles.label}>P — Plan</Text>
        <TextInput
          accessibilityLabel="Tedavi planı"
          style={styles.input}
          value={plan}
          onChangeText={setPlan}
          multiline
          placeholder="Tedavi / takip planı"
          placeholderTextColor={COLORS.neutral600}
        />
        <View style={styles.vitalRow}>
          <View style={styles.vitalField}>
            <Text style={styles.label}>Vücut sıcaklığı (°C)</Text>
            <TextInput
              accessibilityLabel="Vücut sıcaklığı"
              style={styles.input}
              value={tempC}
              onChangeText={setTempC}
              keyboardType="decimal-pad"
              placeholder="38.5"
              placeholderTextColor={COLORS.neutral600}
            />
          </View>
          <View style={styles.vitalField}>
            <Text style={styles.label}>Ağırlık (kg)</Text>
            <TextInput
              accessibilityLabel="Ağırlık"
              style={styles.input}
              value={weightKg}
              onChangeText={setWeightKg}
              keyboardType="decimal-pad"
              placeholder="12.4"
              placeholderTextColor={COLORS.neutral600}
            />
          </View>
        </View>

        {feedback !== null && (
          <View style={styles.okBox} accessibilityRole="status">
            <Text style={styles.okText}>{feedback}</Text>
          </View>
        )}
        {error !== null && (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Taslağı kaydet"
            accessibilityState={{ busy }}
            disabled={busy}
            onPress={() => void save(false)}
            style={[styles.button, styles.buttonSecondary, busy && styles.disabled]}
          >
            <Text style={styles.buttonSecondaryText}>Cihaza kaydet</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kaydet ve senkronize et"
            accessibilityState={{ busy }}
            disabled={busy}
            onPress={() => void save(true)}
            style={[styles.button, busy && styles.disabled]}
          >
            {busy ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.buttonText}>Kaydet ve gönder</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.finalizeNote}>
          <Text style={styles.finalizeText}>
            Hizmet/stok/ücret kesinleşmesi (finalize) sunucu onaylıdır: çevrimdışı
            işlem bu ekrandan asla "kesinleşti" görünmez; finalize yalnız çevrimiçi
            muayene iş akışında yapılır.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: SPACING.sm },
  back: { color: COLORS.brand600, fontSize: TYPO.small, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
  title: { fontSize: TYPO.h2, fontWeight: '700', color: COLORS.neutral950, flex: 1 },
  badge: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  badgeText: { fontSize: TYPO.tiny, fontWeight: '600' },
  form: { gap: SPACING.xs, paddingBottom: SPACING.xl },
  label: { fontSize: TYPO.tiny, color: COLORS.neutral600, marginTop: SPACING.xs },
  input: {
    borderWidth: 1,
    borderColor: COLORS.neutral200,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: TOUCH_TARGET_MIN,
    fontSize: TYPO.body,
    color: COLORS.neutral950,
    backgroundColor: COLORS.white,
    textAlignVertical: 'top',
  },
  vitalRow: { flexDirection: 'row', gap: SPACING.sm },
  vitalField: { flex: 1 },
  okBox: {
    backgroundColor: STATUS.successBg,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  okText: { color: STATUS.success, fontSize: TYPO.tiny },
  errorBox: {
    backgroundColor: STATUS.dangerBg,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  errorText: { color: STATUS.danger, fontSize: TYPO.tiny },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  button: {
    flex: 1,
    backgroundColor: COLORS.brand600,
    borderRadius: RADIUS.md,
    minHeight: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.neutral200 },
  buttonSecondaryText: { color: COLORS.neutral950, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  buttonText: { color: COLORS.white, fontWeight: '600' },
  finalizeNote: {
    backgroundColor: STATUS.infoBg,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  finalizeText: { color: STATUS.info, fontSize: TYPO.tiny, lineHeight: 16 },
});
