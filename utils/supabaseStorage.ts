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
 * Gets the user's sex from their profile
 */
export async function getUserSex(): Promise<'male' | 'female' | null> {
  try {
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from('user_settings')
      .select('sex')
      .eq('user_id', userId)
      .single();

    if (error || !data?.sex) return null;
    return data.sex as 'male' | 'female';
  } catch {
    return null;
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

export { DEFAULT_THRESHOLD, getTodayKey, getYesterdayKey, toDateKey };

