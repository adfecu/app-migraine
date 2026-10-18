import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Href, Link, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Modal, Pressable, View as RNView, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/components/useColorScheme';
import {
  CheckIn,
  evaluateMigraine,
  getAllCheckIns,
  isMigraineAlertCooldownExpired,
  MigraineAlertData,
  MigraineEvaluation,
  setMigraineAlertDismissedAt,
  shouldShowMigraineAlert,
} from '@/utils/storage';
import { EpisodeRecord, getOngoingEpisode } from '@/utils/records';

// Neutral status colors: the summary describes answers, it does not rate risk
const STATUS_COLORS = {
  none: '#8E8E93',
  reported: '#5C6BC0',
  crisis: '#FF3B30',
  error: '#FF9500',
};

// Button colors for light and dark modes
const BUTTON_COLORS = {
  checkin: {
    light: '#007AFF',  // iOS blue
    dark: '#0A84FF',   // Lighter blue for dark mode
  },
  crisis: {
    light: '#FF3B30',  // iOS red
    dark: '#FF453A',   // Slightly lighter red for dark mode
  },
};

const DEFAULT_EVALUATION: MigraineEvaluation = {
  hadHeadache: false,
  mayHaveMigraine: false,
  score: 0,
  riskLevel: 'low',
  reasons: { met: [], notMet: [] },
};


function formatEntryDate(isoString: string): string {
  return new Date(isoString).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TabOneScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn | null>(null);
  const [activeCrisis, setActiveCrisis] = useState<EpisodeRecord | null>(null);
  const [evaluation, setEvaluation] = useState<MigraineEvaluation>(DEFAULT_EVALUATION);
  const [showMigraineAlert, setShowMigraineAlert] = useState(false);
  const [migraineAlertData, setMigraineAlertData] = useState<MigraineAlertData | null>(null);

  const dismissMigraineAlert = useCallback(async () => {
    setShowMigraineAlert(false);
    await setMigraineAlertDismissedAt();
  }, []);

  // Read-only: opening the dashboard must never write model or health data.
  const loadData = useCallback(async () => {
    let allCheckIns: CheckIn[];
    let ongoing: EpisodeRecord | null;
    try {
      [allCheckIns, ongoing] = await Promise.all([getAllCheckIns(), getOngoingEpisode()]);
    } catch {
      // Keep the last successful data on screen and flag it as possibly stale.
      setLoadState('error');
      return;
    }

    const newestFirst = [...allCheckIns].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const latestDaily = newestFirst.find(c => c.type === 'checkin') ?? null;
    setLatestCheckIn(latestDaily);
    setActiveCrisis(ongoing);
    setEvaluation(latestDaily ? evaluateMigraine(latestDaily) : DEFAULT_EVALUATION);
    setLoadState('ready');

    const alertData = shouldShowMigraineAlert(allCheckIns);
    if (alertData && await isMigraineAlertCooldownExpired()) {
      setMigraineAlertData(alertData);
      setShowMigraineAlert(true);
    }
  }, []);

  // The tabs can mount before the auth redirect; only read records once signed in.
  const { session } = useAuth();
  useFocusEffect(
    useCallback(() => {
      if (session) loadData();
    }, [session, loadData])
  );

  const statusLabel = !latestCheckIn
    ? 'Sin check-in'
    : !evaluation.hadHeadache
      ? 'Sin dolor de cabeza reportado'
      : evaluation.mayHaveMigraine
        ? 'Rasgos compatibles con migraña'
        : 'Dolor de cabeza registrado';
  const statusColor = latestCheckIn && evaluation.hadHeadache ? STATUS_COLORS.reported : STATUS_COLORS.none;
  const isDark = colorScheme === 'dark';
  const checkinButtonColor = isDark ? BUTTON_COLORS.checkin.dark : BUTTON_COLORS.checkin.light;
  const crisisButtonColor = isDark ? BUTTON_COLORS.crisis.dark : BUTTON_COLORS.crisis.light;

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >        
        {loadState === 'error' && (
          <View style={[styles.banner, { borderColor: STATUS_COLORS.error }]}>
            <Text style={styles.bannerText}>
              No se pudieron cargar tus registros. Lo que ves puede no estar actualizado.
            </Text>
            <Pressable onPress={loadData} style={({ pressed }) => pressed && { opacity: 0.6 }}>
              <Text style={[styles.bannerAction, { color: STATUS_COLORS.error }]}>Reintentar</Text>
            </Pressable>
          </View>
        )}

        {/* An open crisis is shown on its own; it is never scored as a daily check-in */}
        {activeCrisis && (
          <View style={[styles.banner, { borderColor: STATUS_COLORS.crisis }]}>
            <Text style={[styles.bannerTitle, { color: STATUS_COLORS.crisis }]}>Crisis en curso</Text>
            <Text style={styles.bannerText}>
              {activeCrisis.onset_at
                ? `Empezó el ${formatEntryDate(activeCrisis.onset_at)}.`
                : `Registrada el ${formatEntryDate(activeCrisis.recorded_at)}.`}
            </Text>
            <Pressable
              onPress={() => router.push({ pathname: '/end-episode', params: { id: activeCrisis.id } })}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={[styles.bannerAction, { color: STATUS_COLORS.crisis }]}>Terminó la crisis</Text>
            </Pressable>
          </View>
        )}

        {/* Latest daily check-in summary */}
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreLabel}>Resumen del último check-in</Text>

          {loadState === 'loading' && !latestCheckIn ? (
            <Text style={styles.entryDate}>Cargando…</Text>
          ) : (
            <>
              <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
                <Text style={styles.statusText}>{statusLabel}</Text>
              </View>
              {latestCheckIn && (
                <Text style={styles.entryDate}>Registrado el {formatEntryDate(latestCheckIn.date)}</Text>
              )}
            </>
          )}

          {latestCheckIn && evaluation.hadHeadache && (
            <View style={styles.reasonsContainer}>
              {evaluation.reasons.met.map((reason, index) => (
                <View key={`met-${index}`} style={styles.reasonRow}>
                  <Text style={[styles.reasonIcon, { color: STATUS_COLORS.reported }]}>✓</Text>
                  <Text style={styles.reasonText}>{reason}</Text>
                </View>
              ))}
              {evaluation.reasons.notMet.map((reason, index) => (
                <View key={`notmet-${index}`} style={styles.reasonRow}>
                  <Text style={[styles.reasonIcon, { color: STATUS_COLORS.none }]}>–</Text>
                  <Text style={styles.reasonText}>{reason}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.01)" />
        
        <Link href="/checkin" asChild>
          <Pressable
            style={({ pressed }) => [
              styles.checkinButton,
              pressed && styles.checkinButtonPressed,
            ]}
          >
            <RNView style={[styles.checkinButtonInner, { backgroundColor: checkinButtonColor }]}>
              <Text style={styles.checkinButtonText}>Check-in</Text>
            </RNView>
          </Pressable>
        </Link>

        <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.01)" />

        <Pressable
          onPress={() => router.push('/crisis-voice')}
          style={({ pressed }) => [
            styles.crisisButton,
            pressed && styles.crisisButtonPressed,
          ]}
        >
          <RNView style={[styles.crisisButtonInner, { backgroundColor: crisisButtonColor }]}>
            <Text style={styles.crisisButtonText}>Me duele la cabeza</Text>
          </RNView>
        </Pressable>

        {/* High migraine likelihood alert */}
        <Modal
          visible={showMigraineAlert}
          transparent
          animationType="fade"
          onRequestClose={dismissMigraineAlert}
        >
          <Pressable
            style={styles.alertOverlay}
            onPress={dismissMigraineAlert}
          >
            <RNView style={styles.alertContent}>
              <FontAwesome name="stethoscope" size={40} color={STATUS_COLORS.reported} style={styles.alertIcon} />

              <Text style={styles.alertTitle}>
                Revisa tus registros con un médico
              </Text>

              <Text style={styles.alertBody}>
                Tus registros recientes muestran lo siguiente. Te sugerimos compartir tu informe
                con un profesional de salud.
              </Text>

              {migraineAlertData && migraineAlertData.reasons.length > 0 && (
                <RNView style={styles.alertReasons}>
                  {migraineAlertData.reasons.map((reason, index) => (
                    <RNView key={index} style={styles.alertReasonRow}>
                      <Text style={styles.alertReasonBullet}>•</Text>
                      <Text style={styles.alertReasonText}>{reason}</Text>
                    </RNView>
                  ))}
                </RNView>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.alertReportButton,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={async () => {
                  await dismissMigraineAlert();
                  router.push('/report' as Href);
                }}
              >
                <Text style={styles.alertReportButtonText}>Ver Informe Médico</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.alertDismissButton,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={dismissMigraineAlert}
              >
                <Text style={styles.alertDismissButtonText}>Entendido</Text>
              </Pressable>
            </RNView>
          </Pressable>
        </Modal>

        <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.01)" />

        <Pressable
          onPress={() => router.push('/report' as Href)}
          style={({ pressed }) => [
            styles.reportButton,
            pressed && styles.reportButtonPressed,
          ]}
        >
          <RNView style={[styles.reportButtonInner, { borderColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' }]}>
            <Text style={styles.reportButtonText}>Informe médico</Text>
          </RNView>
        </Pressable>

        <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.01)" />

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Esta evaluación es orientativa y no constituye un diagnóstico médico. 
          Consulta a un profesional de salud para una evaluación completa.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 20,
    height: 1,
    width: '80%',
  },
  scoreContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  scoreLabel: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 10,
  },
  entryDate: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.6,
  },
  banner: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  bannerText: {
    fontSize: 13,
    opacity: 0.85,
    lineHeight: 18,
  },
  bannerAction: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  statusPill: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  reasonsContainer: {
    marginTop: 16,
    alignItems: 'flex-start',
    width: '100%',
    maxWidth: 280,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
    backgroundColor: 'transparent',
  },
  reasonIcon: {
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 8,
    width: 16,
  },
  reasonText: {
    fontSize: 13,
    opacity: 0.8,
    flex: 1,
  },
  checkinButton: {
    marginBottom: 10,
  },
  checkinButtonInner: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinButtonPressed: {
    opacity: 0.8,
  },
  checkinButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  crisisButton: {
    marginBottom: 10,
  },
  crisisButtonInner: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crisisButtonPressed: {
    opacity: 0.8,
  },
  crisisButtonText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  reportButton: {
    marginBottom: 10,
  },
  reportButtonInner: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  reportButtonPressed: {
    opacity: 0.6,
  },
  reportButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    marginTop: 20,
    fontSize: 11,
    opacity: 0.6,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 16,
  },
  // Migraine alert modal styles
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#F44336',
  },
  alertIcon: {
    marginBottom: 16,
  },
  alertTitle: {
    color: '#F44336',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  alertBody: {
    color: '#e0e0e0',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },
  alertReasons: {
    width: '100%',
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  alertReasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 3,
  },
  alertReasonBullet: {
    color: '#F44336',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 8,
    marginTop: 1,
  },
  alertReasonText: {
    color: '#e0e0e0',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  alertReportButton: {
    width: '100%',
    backgroundColor: '#F44336',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 10,
    alignItems: 'center',
  },
  alertReportButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  alertDismissButton: {
    paddingVertical: 10,
  },
  alertDismissButtonText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 15,
    textAlign: 'center',
  },
});
