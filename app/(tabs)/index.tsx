import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Href, Link, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Modal, Pressable, View as RNView, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import {
  calculateHeadacheRisk,
  checkAndResetCLIfHeadacheResolved,
  CheckIn,
  evaluateMigraine,
  getAllCheckIns,
  getLatestCheckIn,
  HeadacheRiskEvaluation,
  isMigraineAlertCooldownExpired,
  MigraineAlertData,
  MigraineEvaluation,
  setMigraineAlertDismissedAt,
  shouldShowMigraineAlert,
} from '@/utils/storage';

// Risk level colors
const RISK_COLORS = {
  low: '#4CAF50',      // Green
  moderate: '#FFC107', // Yellow/Amber
  high: '#F44336',     // Red
};

// Headache risk zone colors
const HEADACHE_ZONE_COLORS = {
  safe: '#4CAF50',     // Green
  caution: '#FFC107',  // Yellow/Amber
  danger: '#F44336',   // Red
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


export default function TabOneScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [evaluation, setEvaluation] = useState<MigraineEvaluation>(DEFAULT_EVALUATION);
  const [hasCheckIn, setHasCheckIn] = useState(false);
  const [headacheRisk, setHeadacheRisk] = useState<HeadacheRiskEvaluation | null>(null);
  const [showCrisisModal, setShowCrisisModal] = useState(false);
  const [showMigraineAlert, setShowMigraineAlert] = useState(false);
  const [migraineAlertData, setMigraineAlertData] = useState<MigraineAlertData | null>(null);

  const dismissMigraineAlert = useCallback(async () => {
    setShowMigraineAlert(false);
    await setMigraineAlertDismissedAt();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        // Load all check-ins for headache resolution check
        const allCheckIns = await getAllCheckIns();
        
        // Check if headache has resolved and reset CL if needed
        await checkAndResetCLIfHeadacheResolved(allCheckIns);
        
        // Load latest check-in for risk evaluation
        const latestCheckIn = await getLatestCheckIn();
        if (latestCheckIn && latestCheckIn.answers.length > 0) {
          setHasCheckIn(true);
          const result = evaluateMigraine(latestCheckIn);
          setEvaluation(result);
          
          // Calculate headache risk (returns null if migraine risk is high)
          const headacheRiskResult = await calculateHeadacheRisk(latestCheckIn);
          setHeadacheRisk(headacheRiskResult);
        } else {
          setHasCheckIn(false);
          setEvaluation(DEFAULT_EVALUATION);
          setHeadacheRisk(null);
        }

        // Evaluate migraine alert conditions
        const alertData = shouldShowMigraineAlert(allCheckIns);
        if (alertData) {
          const cooldownExpired = await isMigraineAlertCooldownExpired();
          if (cooldownExpired) {
            setMigraineAlertData(alertData);
            setShowMigraineAlert(true);
          }
        }
      };
      loadData();
    }, [])
  );

  const riskColor = RISK_COLORS[evaluation.riskLevel];
  const isDark = colorScheme === 'dark';
  const checkinButtonColor = isDark ? BUTTON_COLORS.checkin.dark : BUTTON_COLORS.checkin.light;
  const crisisButtonColor = isDark ? BUTTON_COLORS.crisis.dark : BUTTON_COLORS.crisis.light;

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >        
        {/* Migraine Score Display */}
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreLabel}>Riesgo de Migraña</Text>
          <View style={[
            styles.scoreCircle,
            { borderColor: riskColor }
          ]}>
            <Text style={[styles.scoreValue, { color: riskColor }]}>
              {evaluation.score}
            </Text>
            <Text style={styles.scoreMax}>/100</Text>
          </View>
          
          {/* Status Pill */}
          <View style={[
            styles.statusPill,
            { backgroundColor: evaluation.mayHaveMigraine ? RISK_COLORS.high : RISK_COLORS.low }
          ]}>
            <Text style={styles.statusText}>
              {!hasCheckIn 
                ? 'Sin check-in' 
                : evaluation.mayHaveMigraine 
                  ? 'Posible migraña' 
                  : 'Probable no migraña'}
            </Text>
          </View>
          
          {/* Reasons */}
          {hasCheckIn && (
            <View style={styles.reasonsContainer}>
              {evaluation.reasons.met.map((reason, index) => (
                <View key={`met-${index}`} style={styles.reasonRow}>
                  <Text style={[styles.reasonIcon, { color: RISK_COLORS.high }]}>✓</Text>
                  <Text style={styles.reasonText}>{reason}</Text>
                </View>
              ))}
              {evaluation.reasons.notMet.map((reason, index) => (
                <View key={`notmet-${index}`} style={styles.reasonRow}>
                  <Text style={[styles.reasonIcon, { color: RISK_COLORS.low }]}>✗</Text>
                  <Text style={styles.reasonText}>{reason}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        
        {/* Headache Risk Display - Only show when migraine risk is low */}
        {hasCheckIn && headacheRisk && (
          <>
            <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
            
            <View style={styles.headacheRiskContainer}>
              <Text style={styles.headacheRiskTitle}>Riesgo de Dolor de Cabeza</Text>

              {/* Score Circle */}
              <View style={styles.scoreContainer}>
                <View style={[
                  styles.scoreCircle,
                  { borderColor: HEADACHE_ZONE_COLORS[headacheRisk.riskZone] }
                ]}>
                  <Text style={[styles.scoreValue, { color: HEADACHE_ZONE_COLORS[headacheRisk.riskZone] }]}>
                    {Math.round(headacheRisk.percentage)}
                  </Text>
                  <Text style={styles.scoreMax}>%</Text>
                </View>

                {/* Status Pill */}
                <View style={[
                  styles.statusPill,
                  { backgroundColor: HEADACHE_ZONE_COLORS[headacheRisk.riskZone] }
                ]}>
                  <Text style={styles.statusText}>
                    {headacheRisk.riskZone === 'safe'
                      ? 'Zona Segura'
                      : headacheRisk.riskZone === 'caution'
                        ? 'Zona de Precaución'
                        : 'Zona de Peligro'}
                  </Text>
                </View>

                {/* Prediction Message */}
                <Text style={styles.headachePredictionText}>
                  {headacheRisk.prediction}
                </Text>

                {/* Reasons */}
                <View style={styles.reasonsContainer}>
                  {headacheRisk.reasons.met.map((reason, index) => (
                    <View key={`met-${index}`} style={styles.reasonRow}>
                      <Text style={[styles.reasonIcon, { color: HEADACHE_ZONE_COLORS.danger }]}>✓</Text>
                      <Text style={styles.reasonText}>{reason}</Text>
                    </View>
                  ))}
                  {headacheRisk.reasons.notMet.map((reason, index) => (
                    <View key={`notmet-${index}`} style={styles.reasonRow}>
                      <Text style={[styles.reasonIcon, { color: HEADACHE_ZONE_COLORS.safe }]}>✗</Text>
                      <Text style={styles.reasonText}>{reason}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </>
        )}
        
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
          onPress={() => setShowCrisisModal(true)}
          style={({ pressed }) => [
            styles.crisisButton,
            pressed && styles.crisisButtonPressed,
          ]}
        >
          <RNView style={[styles.crisisButtonInner, { backgroundColor: crisisButtonColor }]}>
            <Text style={styles.crisisButtonText}>Me duele la cabeza</Text>
          </RNView>
        </Pressable>

        {/* Crisis mode picker modal */}
        <Modal
          visible={showCrisisModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCrisisModal(false)}
        >
          <Pressable
            style={styles.crisisModalOverlay}
            onPress={() => setShowCrisisModal(false)}
          >
            <RNView style={styles.crisisModalContent}>
              <Text style={styles.crisisModalTitle}>¿Cómo quieres registrar?</Text>

              <Pressable
                style={({ pressed }) => [
                  styles.crisisModalOption,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  setShowCrisisModal(false);
                  router.push('/crisis');
                }}
              >
                <Text style={styles.crisisModalOptionText}>Modo Visual</Text>
                <Text style={styles.crisisModalOptionHint}>Formulario en pantalla</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.crisisModalOption,
                  styles.crisisModalOptionVoice,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  setShowCrisisModal(false);
                  router.push('/crisis-voice');
                }}
              >
                <Text style={styles.crisisModalOptionText}>Modo Voz</Text>
                <Text style={styles.crisisModalOptionHint}>Solo audio, sin mirar pantalla</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.crisisModalCancel,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => setShowCrisisModal(false)}
              >
                <Text style={styles.crisisModalCancelText}>Cancelar</Text>
              </Pressable>
            </RNView>
          </Pressable>
        </Modal>

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
              <FontAwesome name="exclamation-triangle" size={40} color="#F44336" style={styles.alertIcon} />

              <Text style={styles.alertTitle}>
                Alerta: Alta Probabilidad de Migraña
              </Text>

              <Text style={styles.alertBody}>
                Según tus registros recientes, existe una alta probabilidad de que estés
                experimentando migrañas. Te recomendamos consultar a un médico lo antes posible.
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
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  scoreMax: {
    fontSize: 14,
    opacity: 0.6,
  },
  statusPill: {
    marginTop: 16,
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
  // Headache Risk Styles
  headacheRiskContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  headacheRiskTitle: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 16,
    textAlign: 'center',
  },
  headachePredictionText: {
    marginTop: 16,
    fontSize: 13,
    opacity: 0.8,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 18,
    maxWidth: 300,
  },
  // Crisis mode picker modal styles
  crisisModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  crisisModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  crisisModalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  crisisModalOption: {
    width: '100%',
    backgroundColor: '#2a2a2a',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  crisisModalOptionVoice: {
    borderColor: '#e74c3c',
    borderWidth: 1.5,
  },
  crisisModalOptionText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  crisisModalOptionHint: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  crisisModalCancel: {
    marginTop: 4,
    paddingVertical: 12,
  },
  crisisModalCancelText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 15,
    textAlign: 'center',
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
