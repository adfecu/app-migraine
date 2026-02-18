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
