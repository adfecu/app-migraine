import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, View as RNView, ScrollView, StyleSheet } from 'react-native';

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
  MigraineEvaluation,
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

// Episode statistics interface
interface EpisodeStats {
  episodesThisMonth: number;
  daysSinceLastEpisode: number | null;
  comparisonWithLastMonth: number | null; // positive = more, negative = less, null = no data
  averageTimeBetweenCrises: number | null; // null if less than 2 episodes
}

const DEFAULT_EPISODE_STATS: EpisodeStats = {
  episodesThisMonth: 0,
  daysSinceLastEpisode: null,
  comparisonWithLastMonth: null,
  averageTimeBetweenCrises: null,
};

// Helper functions for episode statistics
function getCrisisEpisodes(checkIns: CheckIn[]): CheckIn[] {
  return checkIns.filter(entry => entry.type === 'crisis');
}

function getEpisodesInMonth(episodes: CheckIn[], year: number, month: number): CheckIn[] {
  return episodes.filter(episode => {
    const date = new Date(episode.date);
    return date.getFullYear() === year && date.getMonth() === month;
  });
}

function calculateDaysSince(dateString: string): number {
  const episodeDate = new Date(dateString);
  const today = new Date();
  // Reset time to compare dates only
  episodeDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - episodeDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function calculateAverageTimeBetweenCrises(episodes: CheckIn[]): number | null {
  if (episodes.length < 2) return null;
  
  // Sort episodes by date (oldest first)
  const sortedEpisodes = [...episodes].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // Calculate intervals between consecutive episodes
  let totalDays = 0;
  for (let i = 1; i < sortedEpisodes.length; i++) {
    const prevDate = new Date(sortedEpisodes[i - 1].date);
    const currDate = new Date(sortedEpisodes[i].date);
    prevDate.setHours(0, 0, 0, 0);
    currDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
    totalDays += diffDays;
  }
  
  return Math.round(totalDays / (sortedEpisodes.length - 1));
}

function calculateEpisodeStats(checkIns: CheckIn[]): EpisodeStats {
  const crisisEpisodes = getCrisisEpisodes(checkIns);
  
  if (crisisEpisodes.length === 0) {
    return DEFAULT_EPISODE_STATS;
  }
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  // Episodes this month
  const episodesThisMonth = getEpisodesInMonth(crisisEpisodes, currentYear, currentMonth).length;
  
  // Find most recent episode
  const sortedByDate = [...crisisEpisodes].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const lastEpisode = sortedByDate[0];
  const daysSinceLastEpisode = calculateDaysSince(lastEpisode.date);
  
  // Episodes last month
  let lastMonthYear = currentYear;
  let lastMonth = currentMonth - 1;
  if (lastMonth < 0) {
    lastMonth = 11;
    lastMonthYear = currentYear - 1;
  }
  const episodesLastMonth = getEpisodesInMonth(crisisEpisodes, lastMonthYear, lastMonth).length;
  const comparisonWithLastMonth = episodesThisMonth - episodesLastMonth;
  
  // Average time between crises
  const averageTimeBetweenCrises = calculateAverageTimeBetweenCrises(crisisEpisodes);
  
  return {
    episodesThisMonth,
    daysSinceLastEpisode,
    comparisonWithLastMonth,
    averageTimeBetweenCrises,
  };
}

export default function TabOneScreen() {
  const colorScheme = useColorScheme();
  const [evaluation, setEvaluation] = useState<MigraineEvaluation>(DEFAULT_EVALUATION);
  const [hasCheckIn, setHasCheckIn] = useState(false);
  const [episodeStats, setEpisodeStats] = useState<EpisodeStats>(DEFAULT_EPISODE_STATS);
  const [headacheRisk, setHeadacheRisk] = useState<HeadacheRiskEvaluation | null>(null);

  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        // Load all check-ins for episode statistics and headache resolution check
        const allCheckIns = await getAllCheckIns();
        const stats = calculateEpisodeStats(allCheckIns);
        setEpisodeStats(stats);
        
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
              
              {/* Progress Bar */}
              <View style={styles.progressBarContainer}>
                <View style={styles.progressBarBackground}>
                  <View 
                    style={[
                      styles.progressBarFill,
                      { 
                        width: `${Math.min(100, headacheRisk.percentage)}%`,
                        backgroundColor: HEADACHE_ZONE_COLORS[headacheRisk.riskZone],
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.progressBarText}>
                  {Math.round(headacheRisk.percentage)}%
                </Text>
              </View>
              
              {/* Risk Zone Pill */}
              <View style={[
                styles.headacheZonePill,
                { backgroundColor: HEADACHE_ZONE_COLORS[headacheRisk.riskZone] }
              ]}>
                <Text style={styles.headacheZoneText}>
                  {headacheRisk.riskZone === 'safe' 
                    ? 'Zona Segura' 
                    : headacheRisk.riskZone === 'caution' 
                      ? 'Zona de Precaución' 
                      : 'Zona de Peligro'}
                </Text>
              </View>
              
              {/* Prediction Message */}
              <Text style={styles.predictionText}>
                {headacheRisk.prediction}
              </Text>
              
              {/* Reasons */}
              <View style={styles.reasonsContainer}>
                {headacheRisk.reasons.met.map((reason, index) => (
                  <View key={`met-${index}`} style={styles.reasonRow}>
                    <Text style={[styles.reasonIcon, { color: HEADACHE_ZONE_COLORS.danger }]}>✗</Text>
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
              
              {/* CL / Threshold Details */}
              <View style={styles.clDetailsContainer}>
                <View style={styles.clDetailItem}>
                  <Text style={styles.clDetailValue}>{headacheRisk.cumulativeLoad.toFixed(1)}</Text>
                  <Text style={styles.clDetailLabel}>Carga{'\n'}Acumulada</Text>
                </View>
                <Text style={styles.clDetailDivider}>/</Text>
                <View style={styles.clDetailItem}>
                  <Text style={styles.clDetailValue}>{headacheRisk.threshold.toFixed(1)}</Text>
                  <Text style={styles.clDetailLabel}>Umbral{'\n'}Personal</Text>
                </View>
              </View>
            </View>
          </>
        )}
        
        <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
        
        {/* Episode Summary */}
        <View style={styles.episodeSummaryContainer}>
          <Text style={styles.episodeSummaryTitle}>Resumen de Episodios</Text>
          
          <View style={styles.statsGrid}>
            {/* Episodes this month */}
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{episodeStats.episodesThisMonth}</Text>
              <Text style={styles.statLabel}>Este mes</Text>
            </View>
            
            {/* Days since last episode */}
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {episodeStats.daysSinceLastEpisode !== null 
                  ? episodeStats.daysSinceLastEpisode 
                  : '-'}
              </Text>
              <Text style={styles.statLabel}>Días desde{'\n'}último episodio</Text>
            </View>
            
            {/* Comparison with last month */}
            <View style={styles.statCard}>
              <Text style={[
                styles.statValue,
                episodeStats.comparisonWithLastMonth !== null && episodeStats.comparisonWithLastMonth > 0 
                  ? { color: RISK_COLORS.high }
                  : episodeStats.comparisonWithLastMonth !== null && episodeStats.comparisonWithLastMonth < 0
                    ? { color: RISK_COLORS.low }
                    : {}
              ]}>
                {episodeStats.comparisonWithLastMonth !== null 
                  ? (episodeStats.comparisonWithLastMonth > 0 
                      ? `+${episodeStats.comparisonWithLastMonth}` 
                      : episodeStats.comparisonWithLastMonth === 0 
                        ? 'Igual' 
                        : episodeStats.comparisonWithLastMonth)
                  : '-'}
              </Text>
              <Text style={styles.statLabel}>vs. mes{'\n'}anterior</Text>
            </View>
            
            {/* Average time between crises */}
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {episodeStats.averageTimeBetweenCrises !== null 
                  ? episodeStats.averageTimeBetweenCrises 
                  : '-'}
              </Text>
              <Text style={styles.statLabel}>Días promedio{'\n'}entre crisis</Text>
            </View>
          </View>
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

        <Link href="/crisis" asChild>
          <Pressable
            style={({ pressed }) => [
              styles.crisisButton,
              pressed && styles.crisisButtonPressed,
            ]}
          >
            <RNView style={[styles.crisisButtonInner, { backgroundColor: crisisButtonColor }]}>
              <Text style={styles.crisisButtonText}>Me duele la cabeza</Text>
            </RNView>
          </Pressable>
        </Link>

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
  disclaimer: {
    marginTop: 20,
    fontSize: 11,
    opacity: 0.5,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 16,
  },
  episodeSummaryContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  episodeSummaryTitle: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 320,
  },
  statCard: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.3)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minWidth: 140,
    flex: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 4,
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
  progressBarContainer: {
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
    marginBottom: 12,
  },
  progressBarBackground: {
    width: '100%',
    height: 12,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressBarText: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.8,
  },
  headacheZonePill: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  headacheZoneText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  predictionText: {
    marginTop: 16,
    fontSize: 13,
    opacity: 0.8,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 18,
    maxWidth: 300,
  },
  clDetailsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: 'transparent',
  },
  clDetailItem: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
  },
  clDetailValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  clDetailLabel: {
    fontSize: 11,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 2,
  },
  clDetailDivider: {
    fontSize: 24,
    opacity: 0.4,
    fontWeight: '300',
  },
});
