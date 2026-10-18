/**
 * Storage Module
 * 
 * This module provides all data storage functions and evaluation logic.
 * Storage operations are handled by Supabase (via supabaseStorage.ts).
 * 
 * The module exports:
 * - Storage functions (CRUD operations for check-ins, settings, etc.)
 * - Evaluation functions (pure: they never write data)
 * - Type definitions
 */

// Re-export types and storage functions from supabaseStorage
export { AnswerValue, getUserSex } from './supabaseStorage';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  durationAtLeast,
  episodeHours,
  type Entry,
  measured,
  measuredList,
  measuredNumber,
  newestFirst,
} from './entries';

// ============================================================================
// Migraine Evaluation Types and Helpers
// ============================================================================

export interface MigraineEvaluation {
  hadHeadache: boolean;
  mayHaveMigraine: boolean;
  score: number; // 0-100
  riskLevel: 'low' | 'moderate' | 'high';
  reasons: {
    met: string[];
    notMet: string[];
  };
}

/**
 * Evaluates migraine criteria based on check-in answers
 * Based on ICHD-3 criteria B-D (criterion A requires ≥5 attacks, not tracked per check-in)
 */
export function evaluateMigraine(checkIn: Entry): MigraineEvaluation {
  const reasonsMet: string[] = [];
  const reasonsNotMet: string[] = [];
  
  // Check if headache was reported
  const hadHeadache = measured(checkIn, 'q1_headache') === true;
  
  if (!hadHeadache) {
    return {
      hadHeadache: false,
      mayHaveMigraine: false,
      score: 0,
      riskLevel: 'low',
      reasons: { met: [], notMet: ['Sin dolor de cabeza reportado'] },
    };
  }
  
  let scorePoints = 0;
  
  // Criterion B: Duration 4-72 hours
  const duration = measured(checkIn, 'q2_2_duration');
  const meetsDuration = typeof duration === 'string' && durationAtLeast(duration, 4);
  if (meetsDuration) {
    scorePoints += 30;
    reasonsMet.push('Duración ≥4 horas');
  } else {
    reasonsNotMet.push('Duración <4 horas');
  }
  
  // Criterion C: Pain characteristics (need ≥2 of 4)
  const intensity = measuredNumber(checkIn, 'q2_1_intensity');
  const painChars = measuredList(checkIn, 'q3_pain_characteristics');
  
  let painFeaturesCount = 0;
  
  // C1: Unilateral
  const isUnilateral = painChars.includes('unilateral');
  if (isUnilateral) {
    painFeaturesCount++;
    scorePoints += 10;
    reasonsMet.push('Dolor unilateral');
  }
  
  // C2: Pulsating
  const isPulsating = painChars.includes('pulsatil');
  if (isPulsating) {
    painFeaturesCount++;
    scorePoints += 10;
    reasonsMet.push('Dolor pulsátil');
  }
  
  // C3: Moderate or severe intensity (≥4 on 0-10 scale)
  const isModerateOrSevere = typeof intensity === 'number' && intensity >= 4;
  if (isModerateOrSevere) {
    painFeaturesCount++;
    scorePoints += 20;
    reasonsMet.push('Intensidad moderada/severa');
  }
  
  // C4: Aggravated by activity
  const isAggravatedByActivity = painChars.includes('agravamiento_actividad');
  if (isAggravatedByActivity) {
    painFeaturesCount++;
    scorePoints += 10;
    reasonsMet.push('Empeora con actividad');
  }
  
  const meetsPainCriteria = painFeaturesCount >= 2;
  if (!meetsPainCriteria) {
    reasonsNotMet.push(`Características del dolor: ${painFeaturesCount}/2 mínimo`);
  }
  
  // Criterion D: Associated symptoms (need ≥1)
  const symptoms = measuredList(checkIn, 'q4_symptoms');
  
  let symptomFeaturesCount = 0;
  
  // D1: Nausea/vomiting
  const hasNausea = symptoms.includes('nauseas');
  if (hasNausea) {
    symptomFeaturesCount++;
    scorePoints += 10;
    reasonsMet.push('Náuseas');
  }
  
  // D2: Photophobia AND phonophobia (combined in our question)
  const hasPhotoPhonophobia = symptoms.includes('luz_ruido');
  if (hasPhotoPhonophobia) {
    symptomFeaturesCount++;
    scorePoints += 10;
    reasonsMet.push('Sensibilidad a luz y ruido');
  }
  
  const meetsSymptomCriteria = symptomFeaturesCount >= 1;
  if (!meetsSymptomCriteria) {
    reasonsNotMet.push('Sin síntomas asociados');
  }
  
  // Final evaluation
  const mayHaveMigraine = meetsDuration && meetsPainCriteria && meetsSymptomCriteria;
  
  // Clamp score to 0-100
  const score = Math.min(100, Math.max(0, scorePoints));
  
  // Determine risk level
  let riskLevel: 'low' | 'moderate' | 'high';
  if (score < 40) {
    riskLevel = 'low';
  } else if (score < 70) {
    riskLevel = 'moderate';
  } else {
    riskLevel = 'high';
  }
  
  return {
    hadHeadache,
    mayHaveMigraine,
    score,
    riskLevel,
    reasons: { met: reasonsMet, notMet: reasonsNotMet },
  };
}

// ============================================================================
// Migraine Alert (suggests a medical review)
// ============================================================================

const MIGRAINE_ALERT_DISMISSED_KEY = 'migraine_alert_dismissed_at';
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface MigraineAlertData {
  reasons: string[];
}

export async function getMigraineAlertDismissedAt(): Promise<string | null> {
  return AsyncStorage.getItem(MIGRAINE_ALERT_DISMISSED_KEY);
}

export async function setMigraineAlertDismissedAt(): Promise<void> {
  await AsyncStorage.setItem(MIGRAINE_ALERT_DISMISSED_KEY, new Date().toISOString());
}

/** The same features scored for a crisis, using its own questions and its length. */
function scoreCrisisEntry(entry: Entry): number {
  let score = 0;
  const hours = episodeHours(entry);
  if (hours !== null && hours >= 4) score += 30;

  const painChars = measuredList(entry, 'crisis_pain_characteristics');
  if (painChars.includes('unilateral')) score += 10;
  if (painChars.includes('pulsatil')) score += 10;
  if (painChars.includes('agravamiento_actividad')) score += 10;

  const intensity = measuredNumber(entry, 'crisis_intensity');
  if (intensity !== undefined && intensity >= 4) score += 20;

  const symptoms = measuredList(entry, 'crisis_symptoms');
  if (symptoms.includes('nauseas')) score += 10;
  if (symptoms.includes('luz_ruido')) score += 10;

  return Math.min(100, score);
}

/**
 * Evaluates whether to suggest reviewing recent records with a doctor.
 * Returns alert metadata when triggered, or null when no alert is warranted.
 *
 * Trigger conditions (any one is sufficient):
 *  1. Latest check-in meets all ICHD-3 B-D criteria (mayHaveMigraine)
 *  2. Active unresolved crisis (no end_date)
 *  3. Chronic pattern (>= 15 headache days/month over last 90 days)
 *  4. >50 % of recent headache episodes score >= 70, with >= 3 episodes
 */
export function shouldShowMigraineAlert(entries: Entry[], today: Date = new Date()): MigraineAlertData | null {
  if (entries.length === 0) return null;

  const reasons: string[] = [];
  const hadHeadache = (entry: Entry) => entry.kind === 'crisis' || measured(entry, 'q1_headache') === true;

  // --- Condition 1: Immediate high score on latest check-in ---
  const latestCheckin = newestFirst(entries).find(e => e.kind === 'checkin');
  if (latestCheckin && evaluateMigraine(latestCheckin).mayHaveMigraine) {
    reasons.push('Tu último check-in reúne los rasgos de migraña de los criterios ICHD-3');
  }

  // --- Condition 2: Active unresolved crisis ---
  if (entries.some(e => e.kind === 'crisis' && !e.endDate)) {
    reasons.push('Tienes un episodio de crisis activo sin resolver');
  }

  // --- Conditions 3 & 4: pattern-based (last 90 days, by calendar day) ---
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffKey = localDayKey(cutoff);
  const recent = entries.filter(e => e.dayKey >= cutoffKey);

  // Condition 3: Chronic pattern (>= 15 headache days / month)
  const headacheDays = new Set(recent.filter(hadHeadache).map(e => e.dayKey));
  const months = Math.max(1, 90 / 30);
  if (headacheDays.size / months >= 15) {
    reasons.push(`Registraste ${headacheDays.size} días con dolor de cabeza en los últimos 90 días`);
  }

  // Condition 4: Frequent high-score episodes (>50 % scoring >= 70, min 3)
  const headacheEpisodes = recent.filter(hadHeadache);
  if (headacheEpisodes.length >= 3) {
    let highCount = 0;
    for (const ep of headacheEpisodes) {
      const score = ep.kind === 'crisis' ? scoreCrisisEntry(ep) : evaluateMigraine(ep).score;
      if (score >= 70) highCount++;
    }
    const pct = Math.round((highCount / headacheEpisodes.length) * 100);
    if (pct > 50) {
      reasons.push(
        `${highCount} de ${headacheEpisodes.length} episodios recientes reúnen varios rasgos de migraña`,
      );
    }
  }

  if (reasons.length === 0) return null;
  return { reasons };
}

function localDayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/**
 * Returns true when the alert cooldown (24 h) has expired or
 * the alert has never been dismissed.
 */
export async function isMigraineAlertCooldownExpired(): Promise<boolean> {
  const dismissed = await getMigraineAlertDismissedAt();
  if (!dismissed) return true;
  return Date.now() - new Date(dismissed).getTime() >= ALERT_COOLDOWN_MS;
}
