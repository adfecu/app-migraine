/**
 * Storage Module
 * 
 * This module provides all data storage functions and evaluation logic.
 * Storage operations are handled by Supabase (via supabaseStorage.ts).
 * 
 * The module exports:
 * - Storage functions (CRUD operations for check-ins, settings, etc.)
 * - Evaluation functions (migraine evaluation, headache risk calculation)
 * - Type definitions
 */

// Re-export types and storage functions from supabaseStorage
export {
  AnswerValue,
  CheckIn, DEFAULT_THRESHOLD, deleteCheckIn, EntryType, getAllCheckIns,
  getLatestCheckIn, getUserThreshold, QUESTION_PATTERNS, resetCumulativeLoad, saveCheckIn,
  saveCrisisEpisode, updateUserThreshold
} from './supabaseStorage';

// Import internal functions needed for evaluation
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AnswerValue,
  calculateAndSaveCumulativeLoad,
  CheckIn,
  getUserThreshold,
  QUESTION_PATTERNS,
} from './supabaseStorage';

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
 * Maps check-in answers by question type using question text patterns
 */
export function mapAnswersByQuestion(checkIn: CheckIn): Record<string, AnswerValue> {
  const mapped: Record<string, AnswerValue> = {};
  
  checkIn.questions.forEach((questionText, index) => {
    if (questionText.includes(QUESTION_PATTERNS.headache)) {
      mapped['headache'] = checkIn.answers[index];
    } else if (questionText.includes(QUESTION_PATTERNS.intensity)) {
      mapped['intensity'] = checkIn.answers[index];
    } else if (questionText.includes(QUESTION_PATTERNS.duration)) {
      mapped['duration'] = checkIn.answers[index];
    } else if (questionText.includes(QUESTION_PATTERNS.painCharacteristics)) {
      mapped['painCharacteristics'] = checkIn.answers[index];
    } else if (questionText.includes(QUESTION_PATTERNS.symptoms)) {
      mapped['symptoms'] = checkIn.answers[index];
    } else if (questionText.includes(QUESTION_PATTERNS.sleep)) {
      mapped['sleep'] = checkIn.answers[index];
    } else if (questionText.includes(QUESTION_PATTERNS.stress)) {
      mapped['stress'] = checkIn.answers[index];
    } else if (questionText.includes(QUESTION_PATTERNS.alcohol)) {
      mapped['alcohol'] = checkIn.answers[index];
    } else if (questionText.includes(QUESTION_PATTERNS.caffeine)) {
      mapped['caffeine'] = checkIn.answers[index];
    }
  });
  
  return mapped;
}

/**
 * Evaluates migraine criteria based on check-in answers
 * Based on ICHD-3 criteria B-D (criterion A requires ≥5 attacks, not tracked per check-in)
 */
export function evaluateMigraine(checkIn: CheckIn): MigraineEvaluation {
  const answers = mapAnswersByQuestion(checkIn);
  const reasonsMet: string[] = [];
  const reasonsNotMet: string[] = [];
  
  // Check if headache was reported
  const hadHeadache = answers['headache'] === true;
  
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
  const duration = answers['duration'] as string;
  const meetsDuration = duration === '4-12_horas' || duration === 'todo_el_dia';
  if (meetsDuration) {
    scorePoints += 30;
    reasonsMet.push('Duración ≥4 horas');
  } else {
    reasonsNotMet.push('Duración <4 horas');
  }
  
  // Criterion C: Pain characteristics (need ≥2 of 4)
  const intensity = answers['intensity'] as number;
  const painChars = (answers['painCharacteristics'] as string[]) || [];
  
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
  const symptoms = (answers['symptoms'] as string[]) || [];
  
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
// Headache (Tension-Type) Risk Algorithm
// ============================================================================

export type HeadacheRiskZone = 'safe' | 'caution' | 'danger';

export interface HeadacheRiskEvaluation {
  riskZone: HeadacheRiskZone;
  cumulativeLoad: number;
  threshold: number;
  percentage: number; // CL/threshold * 100
  prediction: string;
  dailyTensionLoad: number;
  reasons: { met: string[]; notMet: string[] };
}

// Weights for tension load calculation
const HEADACHE_WEIGHTS = {
  sleep: 0.3,
  stress: 0.4,
  alcohol: 0.15,
  caffeine: 0.15,
};

/**
 * Calculates daily tension load from check-in answers
 * TL_daily = (W_sleep × InvSleep) + (W_stress × Stress) + (W_alcohol × Alcohol) + (W_caffeine × Caffeine)
 */
function calculateDailyTensionLoad(answers: Record<string, AnswerValue>): number {
  // Get values with defaults (sleep hours: 0-12, default 6)
  const sleepHours = typeof answers['sleep'] === 'number' ? answers['sleep'] : 6;
  const stressLevel = typeof answers['stress'] === 'number' ? answers['stress'] : 5;
  const alcoholConsumption = typeof answers['alcohol'] === 'number' ? answers['alcohol'] : 0;
  const caffeineCups = typeof answers['caffeine'] === 'number' ? answers['caffeine'] : 2;
  const caffeineForLoad = caffeineCups * 2; // Scale 0-5 to 0-10 equivalent
  
  // Convert sleep hours (0-12) to risk: more hours = less risk, scaled 0-10
  const invSleep = 10 * (12 - sleepHours) / 12;
  
  // Calculate tension load
  const tensionLoad = 
    (HEADACHE_WEIGHTS.sleep * invSleep) +
    (HEADACHE_WEIGHTS.stress * stressLevel) +
    (HEADACHE_WEIGHTS.alcohol * alcoholConsumption) +
    (HEADACHE_WEIGHTS.caffeine * caffeineForLoad);
  
  return tensionLoad;
}

/**
 * Determines risk zone and prediction message based on CL vs threshold
 */
function determineRiskZone(cumulativeLoad: number, threshold: number): { zone: HeadacheRiskZone; prediction: string } {
  const percentage = (cumulativeLoad / threshold) * 100;
  
  if (percentage < 50) {
    return {
      zone: 'safe',
      prediction: 'Riesgo bajo de dolor de cabeza en las próximas 48 horas.',
    };
  } else if (percentage < 80) {
    return {
      zone: 'caution',
      prediction: 'Riesgo moderado. Si continúa el estrés o mal sueño, es probable dolor de cabeza en 24-48 horas.',
    };
  } else {
    return {
      zone: 'danger',
      prediction: 'Riesgo alto. Es probable dolor de cabeza en 12-24 horas sin intervención.',
    };
  }
}

/**
 * Main function to evaluate headache risk
 * Should be called after migraine evaluation confirms low migraine risk
 */
export async function evaluateHeadacheRisk(checkIn: CheckIn): Promise<HeadacheRiskEvaluation> {
  const answers = mapAnswersByQuestion(checkIn);
  
  // Get values with defaults (sleep hours: 0-12, default 6)
  const sleepHours = typeof answers['sleep'] === 'number' ? answers['sleep'] : 6;
  const stressLevel = typeof answers['stress'] === 'number' ? answers['stress'] : 5;
  const alcoholConsumption = typeof answers['alcohol'] === 'number' ? answers['alcohol'] : 0;
  const caffeineCups = typeof answers['caffeine'] === 'number' ? answers['caffeine'] : 2;
  
  // Generate reasons
  const reasonsMet: string[] = [];
  const reasonsNotMet: string[] = [];
  
  // Sleep: Fewer than 6 hours contributes to risk
  if (sleepHours < 6) {
    reasonsMet.push(`Sueño: ${sleepHours} h (poco descanso)`);
  } else {
    reasonsNotMet.push(`Sueño: ${sleepHours} h (suficiente)`);
  }
  
  // Stress: High stress (> 6) contributes to risk
  if (stressLevel > 6) {
    reasonsMet.push(`Estrés: ${stressLevel}/10 (alto)`);
  } else {
    reasonsNotMet.push(`Estrés: ${stressLevel}/10 (bajo)`);
  }
  
  // Alcohol: Consumption > 5 contributes to risk
  if (alcoholConsumption > 5) {
    reasonsMet.push(`Alcohol: ${alcoholConsumption}/10 (mucho más de lo habitual)`);
  } else if (alcoholConsumption === 0) {
    reasonsNotMet.push(`Alcohol: ${alcoholConsumption}/10 (ninguno)`);
  } else {
    reasonsNotMet.push(`Alcohol: ${alcoholConsumption}/10 (consumo habitual)`);
  }
  
  // Caffeine: Both withdrawal (0) and excess (4-5 cups) contribute to risk
  if (caffeineCups === 0) {
    reasonsMet.push(`Cafeína: ${caffeineCups}/5 (ninguna - abstinencia)`);
  } else if (caffeineCups >= 4) {
    reasonsMet.push(`Cafeína: ${caffeineCups}/5 (alto)`);
  } else {
    reasonsNotMet.push(`Cafeína: ${caffeineCups}/5 (moderado)`);
  }
  
  // Calculate daily tension load
  const dailyTensionLoad = calculateDailyTensionLoad(answers);
  
  // Calculate cumulative load
  const cumulativeLoad = await calculateAndSaveCumulativeLoad(dailyTensionLoad);
  
  // Get user threshold
  const threshold = await getUserThreshold();
  
  // Determine risk zone
  const { zone, prediction } = determineRiskZone(cumulativeLoad, threshold);
  
  // Calculate percentage
  const percentage = Math.min(100, (cumulativeLoad / threshold) * 100);
  
  return {
    riskZone: zone,
    cumulativeLoad,
    threshold,
    percentage,
    prediction,
    dailyTensionLoad,
    reasons: { met: reasonsMet, notMet: reasonsNotMet },
  };
}

/**
 * Full headache risk calculation with migraine integration
 * Returns null if migraine risk is high (score >= 40 or mayHaveMigraine: true)
 * Handles threshold updates for non-migraine headaches and CL resets
 */
export async function calculateHeadacheRisk(checkIn: CheckIn): Promise<HeadacheRiskEvaluation | null> {
  // Import updateUserThreshold here to avoid circular dependency issues
  const { updateUserThreshold } = await import('./supabaseStorage');
  
  // First, run migraine evaluation
  const migraineEval = evaluateMigraine(checkIn);
  
  // If migraine risk is high, don't show headache prediction
  if (migraineEval.score >= 40 || migraineEval.mayHaveMigraine) {
    return null;
  }
  
  // Calculate headache risk
  const headacheRisk = await evaluateHeadacheRisk(checkIn);
  
  // Check if headache was reported with low migraine risk (non-migraine headache)
  // This is a data point to train the threshold
  if (migraineEval.hadHeadache && migraineEval.score < 40 && !migraineEval.mayHaveMigraine) {
    await updateUserThreshold(headacheRisk.cumulativeLoad);
  }
  
  return headacheRisk;
}

/**
 * Checks if headache has resolved (no headache reported after previous headache)
 * and resets CL if needed
 */
export async function checkAndResetCLIfHeadacheResolved(checkIns: CheckIn[]): Promise<void> {
  // Import resetCumulativeLoad here to avoid circular dependency issues
  const { resetCumulativeLoad } = await import('./supabaseStorage');
  
  if (checkIns.length < 2) return;
  
  // Get the two most recent check-ins
  const sortedCheckIns = [...checkIns].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  const latestCheckIn = sortedCheckIns[0];
  const previousCheckIn = sortedCheckIns[1];
  
  const latestAnswers = mapAnswersByQuestion(latestCheckIn);
  const previousAnswers = mapAnswersByQuestion(previousCheckIn);
  
  const hadHeadacheToday = latestAnswers['headache'] === true;
  const hadHeadacheYesterday = previousAnswers['headache'] === true;
  
  // If headache resolved (had headache before, no headache now), reset CL
  if (hadHeadacheYesterday && !hadHeadacheToday) {
    await resetCumulativeLoad();
  }
}

// ============================================================================
// Migraine Alert (High-Likelihood Popup)
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

/**
 * Simplified migraine score for crisis entries whose question wording
 * differs from check-in questions (mapAnswersByQuestion won't match).
 */
function scoreCrisisEntry(entry: CheckIn): number {
  let score = 0;
  const qMap: Record<string, AnswerValue> = {};

  entry.questions.forEach((q, i) => {
    const a = entry.answers[i];
    if (q.includes('intensidad')) qMap['intensity'] = a;
    else if (q.includes('sentiste el dolor') || q.includes('sientes el dolor'))
      qMap['painChars'] = a;
    else if (q.includes('síntomas')) qMap['symptoms'] = a;
    else if (q.includes('comenzó el dolor')) qMap['painStart'] = a;
  });

  if (qMap['painStart'] && entry.endDate) {
    const hours =
      (new Date(entry.endDate).getTime() - new Date(qMap['painStart'] as string).getTime()) /
      3_600_000;
    if (hours >= 4) score += 30;
  }

  const painChars = Array.isArray(qMap['painChars']) ? qMap['painChars'] as string[] : [];
  if (painChars.includes('unilateral')) score += 10;
  if (painChars.includes('pulsatil')) score += 10;
  if (painChars.includes('agravamiento_actividad')) score += 10;

  if (typeof qMap['intensity'] === 'number' && qMap['intensity'] >= 4) score += 20;

  const symptoms = Array.isArray(qMap['symptoms']) ? qMap['symptoms'] as string[] : [];
  if (symptoms.includes('nauseas')) score += 10;
  if (symptoms.includes('luz_ruido')) score += 10;

  return Math.min(100, score);
}

/**
 * Evaluates whether a high-migraine-likelihood alert should be shown.
 * Returns alert metadata when triggered, or null when no alert is warranted.
 *
 * Trigger conditions (any one is sufficient):
 *  1. Latest check-in meets all ICHD-3 B-D criteria (mayHaveMigraine)
 *  2. Active unresolved crisis (no end_date)
 *  3. Chronic pattern (>= 15 headache days/month over last 90 days)
 *  4. >50 % of recent headache episodes score >= 70, with >= 3 episodes
 */
export function shouldShowMigraineAlert(checkIns: CheckIn[]): MigraineAlertData | null {
  if (checkIns.length === 0) return null;

  const reasons: string[] = [];

  // --- Condition 1: Immediate high score on latest check-in ---
  const sorted = [...checkIns].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const latestCheckin = sorted.find(c => c.type === 'checkin');
  if (latestCheckin) {
    const evalResult = evaluateMigraine(latestCheckin);
    if (evalResult.mayHaveMigraine) {
      reasons.push('Tu último check-in cumple los criterios clínicos de migraña (ICHD-3)');
    }
  }

  // --- Condition 2: Active unresolved crisis ---
  const activeCrisis = checkIns.some(c => c.type === 'crisis' && !c.endDate);
  if (activeCrisis) {
    reasons.push('Tienes un episodio de crisis activo sin resolver');
  }

  // --- Conditions 3 & 4: pattern-based (last 90 days) ---
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 90);

  const recent = checkIns.filter(c => new Date(c.date) >= cutoff);

  // Condition 3: Chronic pattern (>= 15 headache days / month)
  const headacheDates = new Set<string>();
  for (const entry of recent) {
    if (entry.type === 'crisis') {
      headacheDates.add(new Date(entry.date).toISOString().split('T')[0]);
    } else {
      const mapped = mapAnswersByQuestion(entry);
      if (mapped['headache'] === true) {
        headacheDates.add(new Date(entry.date).toISOString().split('T')[0]);
      }
    }
  }
  const months = Math.max(1, 90 / 30);
  const headacheDaysPerMonth = headacheDates.size / months;
  if (headacheDaysPerMonth >= 15) {
    reasons.push(
      `Patrón crónico detectado: ${headacheDates.size} días con cefalea en los últimos 90 días (~${Math.round(headacheDaysPerMonth)}/mes)`,
    );
  }

  // Condition 4: Frequent high-score episodes (>50 % scoring >= 70, min 3)
  const headacheEpisodes = recent.filter(c => {
    if (c.type === 'crisis') return true;
    const mapped = mapAnswersByQuestion(c);
    return mapped['headache'] === true;
  });

  if (headacheEpisodes.length >= 3) {
    let highCount = 0;
    for (const ep of headacheEpisodes) {
      const score =
        ep.type === 'crisis'
          ? scoreCrisisEntry(ep)
          : evaluateMigraine(ep).score;
      if (score >= 70) highCount++;
    }
    const pct = Math.round((highCount / headacheEpisodes.length) * 100);
    if (pct > 50) {
      reasons.push(
        `${pct}% de tus episodios recientes tienen alta probabilidad de migraña (${highCount}/${headacheEpisodes.length})`,
      );
    }
  }

  if (reasons.length === 0) return null;
  return { reasons };
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
