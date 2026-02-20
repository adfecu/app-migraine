/**
 * Supabase Storage Module
 * 
 * This module provides all data storage functions using Supabase as the backend.
 * It mirrors the API of the original AsyncStorage-based storage.ts for seamless migration.
 */

import { supabase } from './supabase';

// ============================================================================
// Types
// ============================================================================

export type AnswerValue = boolean | number | string | string[];

export type EntryType = 'checkin' | 'crisis';

export interface CheckIn {
  id: string;
  date: string; // ISO string
  type: EntryType;
  answers: AnswerValue[];
  questions: string[];
  endDate?: string; // ISO string - when crisis ended (only for crisis type)
}

// Database row types
interface CheckInRow {
  id: string;
  user_id: string;
  date: string;
  type: string;
  answers: AnswerValue[];
  questions: string[];
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

interface UserSettingsRow {
  user_id: string;
  headache_threshold: number;
  name?: string;
  sex?: 'male' | 'female';
  age?: number;
  created_at: string;
  updated_at: string;
}

interface CLHistoryRow {
  id: string;
  user_id: string;
  date: string;
  cl_value: number;
  created_at: string;
  updated_at: string;
}

interface ThresholdDataRow {
  id: string;
  user_id: string;
  cl_value: number;
  created_at: string;
}

// CL history data format (date-keyed object for compatibility)
interface CLHistoryData {
  [date: string]: number; // date in YYYY-MM-DD format -> CL value
}

// Threshold data format
interface ThresholdData {
  headacheDayCLValues: number[];
}

// Question patterns for answer mapping
const QUESTION_PATTERNS = {
  headache: 'dolor de cabeza en las últimas 24 horas',
  intensity: 'intensidad máxima',
  duration: 'Cuántas horas duró',
  painCharacteristics: 'Cómo sentiste el dolor',
  symptoms: 'síntomas junto con el dolor',
  sleep: 'Cuántas horas dormiste',
  stress: 'Qué tan estresado',
  alcohol: 'Has consumido alcohol',
  caffeine: 'tazas de café',
};

// Constants
const DEFAULT_THRESHOLD = 75;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets the current authenticated user ID
 * @throws Error if user is not authenticated
 */
async function getCurrentUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('User not authenticated');
  }
  return user.id;
}

/**
 * Converts database row to CheckIn interface
 */
function rowToCheckIn(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    date: row.date,
    type: row.type as EntryType,
    answers: row.answers,
    questions: row.questions,
    endDate: row.end_date ?? undefined,
  };
}

/**
 * Converts ISO date string to YYYY-MM-DD format
 */
function toDateKey(isoString: string): string {
  return isoString.split('T')[0];
}

/**
 * Gets yesterday's date key in YYYY-MM-DD format
 */
function getYesterdayKey(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return toDateKey(yesterday.toISOString());
}

/**
 * Gets today's date key in YYYY-MM-DD format
 */
function getTodayKey(): string {
  return toDateKey(new Date().toISOString());
}

// ============================================================================
// Check-in Functions
// ============================================================================

/**
 * Saves a new check-in to Supabase
 * Also handles ending active crises if headache question is answered "No"
 */
export async function saveCheckIn(answers: AnswerValue[], questions: string[]): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    const checkInDate = new Date().toISOString();
    
    // Check if there's an active crisis (crisis without end_date)
    // and if the first question (headache in last 24h) is answered "No"
    if (questions.length > 0) {
      const firstQuestion = questions[0];
      const firstAnswer = answers[0];
      
      if (
        firstQuestion.includes(QUESTION_PATTERNS.headache) &&
        firstAnswer === false
      ) {
        // Mark any active crisis as ended
        await supabase
          .from('check_ins')
          .update({ end_date: checkInDate })
          .eq('user_id', userId)
          .eq('type', 'crisis')
          .is('end_date', null);
      }
    }
    
    // Insert the new check-in
    const { error } = await supabase
      .from('check_ins')
      .insert({
        user_id: userId,
        date: checkInDate,
        type: 'checkin',
        answers: answers,
        questions: questions,
      });
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error saving check-in:', error);
    throw error;
  }
}

/**
 * Saves a new crisis episode to Supabase
 */
export async function saveCrisisEpisode(answers: AnswerValue[], questions: string[]): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    
    const { error } = await supabase
      .from('check_ins')
      .insert({
        user_id: userId,
        date: new Date().toISOString(),
        type: 'crisis',
        answers: answers,
        questions: questions,
      });
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error saving crisis episode:', error);
    throw error;
  }
}

/**
 * Gets all check-ins for the current user
 */
export async function getAllCheckIns(): Promise<CheckIn[]> {
  try {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('check_ins')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    return (data || []).map(rowToCheckIn);
  } catch (error) {
    console.error('Error getting check-ins:', error);
    return [];
  }
}

/**
 * Gets the most recent check-in for the current user
 */
export async function getLatestCheckIn(): Promise<CheckIn | null> {
  try {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('check_ins')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      throw error;
    }
    
    return data ? rowToCheckIn(data) : null;
  } catch (error) {
    console.error('Error getting latest check-in:', error);
    return null;
  }
}

/**
 * Deletes a check-in by ID
 */
export async function deleteCheckIn(id: string): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    
    const { error } = await supabase
      .from('check_ins')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error deleting check-in:', error);
    throw error;
  }
}

// ============================================================================
// User Settings Functions
// ============================================================================

/**
 * Gets the user's headache threshold
 */
export async function getUserThreshold(): Promise<number> {
  try {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('user_settings')
      .select('headache_threshold')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No row found, return default
        return DEFAULT_THRESHOLD;
      }
      throw error;
    }
    
    return data?.headache_threshold ?? DEFAULT_THRESHOLD;
  } catch (error) {
    console.error('Error getting user threshold:', error);
    return DEFAULT_THRESHOLD;
  }
}

/**
 * Saves the user's headache threshold (upsert)
 */
export async function saveUserThreshold(threshold: number): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        headache_threshold: threshold,
      }, {
        onConflict: 'user_id',
      });
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error saving user threshold:', error);
  }
}

/**
 * Saves the user's profile (name, sex, age) to user_settings (upsert)
 */
export async function saveUserProfile(name: string, sex: 'male' | 'female', age: number): Promise<void> {
  try {
    const userId = await getCurrentUserId();

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        name,
        sex,
        age,
      }, {
        onConflict: 'user_id',
      });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error saving user profile:', error);
  }
}

// ============================================================================
// CL History Functions
// ============================================================================

/**
 * Gets CL history as a date-keyed object
 */
export async function getCLHistory(): Promise<CLHistoryData> {
  try {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('cl_history')
      .select('date, cl_value')
      .eq('user_id', userId);
    
    if (error) {
      throw error;
    }
    
    // Convert array to date-keyed object
    const history: CLHistoryData = {};
    (data || []).forEach((row: { date: string; cl_value: number }) => {
      history[row.date] = row.cl_value;
    });
    
    return history;
  } catch (error) {
    console.error('Error getting CL history:', error);
    return {};
  }
}

/**
 * Saves CL history (upserts entries by date)
 */
export async function saveCLHistory(history: CLHistoryData): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    
    // Convert object to array of rows
    const rows = Object.entries(history).map(([date, cl_value]) => ({
      user_id: userId,
      date: date,
      cl_value: cl_value,
    }));
    
    if (rows.length === 0) {
      return;
    }
    
    // Upsert all rows
    const { error } = await supabase
      .from('cl_history')
      .upsert(rows, {
        onConflict: 'user_id,date',
      });
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error saving CL history:', error);
  }
}

/**
 * Gets CL value for a specific date
 */
export async function getCLForDate(dateKey: string): Promise<number> {
  try {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('cl_history')
      .select('cl_value')
      .eq('user_id', userId)
      .eq('date', dateKey)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return 0;
      }
      throw error;
    }
    
    return data?.cl_value ?? 0;
  } catch (error) {
    console.error('Error getting CL for date:', error);
    return 0;
  }
}

/**
 * Saves CL value for a specific date (upsert)
 */
export async function saveCLForDate(dateKey: string, clValue: number): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    
    const { error } = await supabase
      .from('cl_history')
      .upsert({
        user_id: userId,
        date: dateKey,
        cl_value: clValue,
      }, {
        onConflict: 'user_id,date',
      });
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error saving CL for date:', error);
  }
}

// ============================================================================
// Threshold Data Functions
// ============================================================================

/**
 * Gets threshold training data (CL values from non-migraine headache days)
 */
export async function getThresholdData(): Promise<ThresholdData> {
  try {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('threshold_data')
      .select('cl_value')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    return {
      headacheDayCLValues: (data || []).map((row: { cl_value: number }) => row.cl_value),
    };
  } catch (error) {
    console.error('Error getting threshold data:', error);
    return { headacheDayCLValues: [] };
  }
}

/**
 * Adds a CL value to threshold training data
 */
export async function addThresholdDataPoint(clValue: number): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    
    const { error } = await supabase
      .from('threshold_data')
      .insert({
        user_id: userId,
        cl_value: clValue,
      });
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error adding threshold data point:', error);
  }
}

/**
 * Clears all threshold training data for the user
 */
export async function clearThresholdData(): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    
    const { error } = await supabase
      .from('threshold_data')
      .delete()
      .eq('user_id', userId);
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error clearing threshold data:', error);
  }
}

// ============================================================================
// Composite Functions
// ============================================================================

/**
 * Updates user threshold based on non-migraine headache occurrence
 * Records the current CL and recalculates threshold as average of all headache-day CL values
 */
export async function updateUserThreshold(currentCL: number): Promise<void> {
  try {
    // Add CL value to threshold training data
    await addThresholdDataPoint(currentCL);
    
    // Get all threshold data points
    const thresholdData = await getThresholdData();
    
    // Calculate new threshold as average of all headache-day CL values
    const values = thresholdData.headacheDayCLValues;
    if (values.length > 0) {
      const sum = values.reduce((acc, val) => acc + val, 0);
      const newThreshold = sum / values.length;
      await saveUserThreshold(newThreshold);
    }
  } catch (error) {
    console.error('Error updating user threshold:', error);
  }
}

/**
 * Resets cumulative load to 0 (called when headache resolves)
 */
export async function resetCumulativeLoad(): Promise<void> {
  try {
    const todayKey = getTodayKey();
    await saveCLForDate(todayKey, 0);
  } catch (error) {
    console.error('Error resetting cumulative load:', error);
  }
}

/**
 * Calculates and saves cumulative load for today
 * CL_today = TL_daily + (DecayFactor × CL_yesterday)
 */
export async function calculateAndSaveCumulativeLoad(dailyTensionLoad: number): Promise<number> {
  const DECAY_FACTOR = 0.5;
  
  const yesterdayCL = await getCLForDate(getYesterdayKey());
  const todayCL = dailyTensionLoad + (DECAY_FACTOR * yesterdayCL);
  
  await saveCLForDate(getTodayKey(), todayCL);
  
  return todayCL;
}

// ============================================================================
// Export utility functions for use in storage.ts
// ============================================================================

export { DEFAULT_THRESHOLD, getTodayKey, getYesterdayKey, QUESTION_PATTERNS, toDateKey };

