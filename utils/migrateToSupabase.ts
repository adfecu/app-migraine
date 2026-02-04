/**
 * Migration Utility: AsyncStorage to Supabase
 * 
 * This module provides functions to migrate existing local data from AsyncStorage
 * to Supabase. It handles:
 * - Check-ins and crisis episodes
 * - User settings (headache threshold)
 * - CL history data
 * - Threshold training data
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import { AnswerValue, EntryType } from './supabaseStorage';

// AsyncStorage keys (matching the original storage.ts)
const CHECKINS_KEY = 'checkins';
const HEADACHE_THRESHOLD_KEY = 'headache_threshold';
const HEADACHE_CL_HISTORY_KEY = 'headache_cl_history';
const HEADACHE_THRESHOLD_DATA_KEY = 'headache_threshold_data';
const MIGRATION_COMPLETED_KEY = 'supabase_migration_completed';

// Old AsyncStorage interfaces
interface OldCheckIn {
  id: string;
  date: string;
  type?: EntryType;
  answers: AnswerValue[];
  questions: string[];
  endDate?: string;
}

interface OldCLHistoryData {
  [date: string]: number;
}

interface OldThresholdData {
  headacheDayCLValues: number[];
}

// Migration result interface
export interface MigrationResult {
  success: boolean;
  checkInsMigrated: number;
  clHistoryMigrated: number;
  thresholdDataMigrated: number;
  settingsMigrated: boolean;
  errors: string[];
}

/**
 * Checks if migration has already been completed
 */
export async function isMigrationCompleted(): Promise<boolean> {
  try {
    const migrationStatus = await AsyncStorage.getItem(MIGRATION_COMPLETED_KEY);
    return migrationStatus === 'true';
  } catch (error) {
    console.error('Error checking migration status:', error);
    return false;
  }
}

/**
 * Checks if there is data in AsyncStorage that needs to be migrated
 */
export async function hasDataToMigrate(): Promise<boolean> {
  try {
    const [checkIns, threshold, clHistory, thresholdData] = await Promise.all([
      AsyncStorage.getItem(CHECKINS_KEY),
      AsyncStorage.getItem(HEADACHE_THRESHOLD_KEY),
      AsyncStorage.getItem(HEADACHE_CL_HISTORY_KEY),
      AsyncStorage.getItem(HEADACHE_THRESHOLD_DATA_KEY),
    ]);
    
    return !!(checkIns || threshold || clHistory || thresholdData);
  } catch (error) {
    console.error('Error checking for data to migrate:', error);
    return false;
  }
}

/**
 * Checks if Supabase already has data for the current user
 */
export async function hasSupabaseData(): Promise<boolean> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return false;
    }
    
    const { count, error } = await supabase
      .from('check_ins')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    
    if (error) {
      console.error('Error checking Supabase data:', error);
      return false;
    }
    
    return (count ?? 0) > 0;
  } catch (error) {
    console.error('Error checking Supabase data:', error);
    return false;
  }
}

/**
 * Checks if migration is needed
 * Returns true if: user is authenticated, has local data, migration not completed, and no Supabase data
 */
export async function needsMigration(): Promise<boolean> {
  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return false;
    }
    
    // Check if migration was already completed
    const migrationCompleted = await isMigrationCompleted();
    if (migrationCompleted) {
      return false;
    }
    
    // Check if there's local data to migrate
    const hasLocalData = await hasDataToMigrate();
    if (!hasLocalData) {
      return false;
    }
    
    // Check if Supabase already has data (don't overwrite)
    const hasRemoteData = await hasSupabaseData();
    if (hasRemoteData) {
      // Mark migration as completed since Supabase already has data
      await AsyncStorage.setItem(MIGRATION_COMPLETED_KEY, 'true');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error checking if migration is needed:', error);
    return false;
  }
}

/**
 * Migrates check-ins from AsyncStorage to Supabase
 */
async function migrateCheckIns(userId: string): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;
  
  try {
    const data = await AsyncStorage.getItem(CHECKINS_KEY);
    if (!data) {
      return { count: 0, errors: [] };
    }
    
    const checkIns = JSON.parse(data) as OldCheckIn[];
    if (checkIns.length === 0) {
      return { count: 0, errors: [] };
    }
    
    // Prepare rows for insertion
    const rows = checkIns.map(checkIn => ({
      user_id: userId,
      date: checkIn.date,
      type: checkIn.type || 'checkin',
      answers: checkIn.answers,
      questions: checkIn.questions,
      end_date: checkIn.endDate || null,
    }));
    
    // Insert in batches to avoid hitting limits
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase
        .from('check_ins')
        .insert(batch);
      
      if (error) {
        errors.push(`Error inserting check-ins batch ${i / batchSize + 1}: ${error.message}`);
      } else {
        count += batch.length;
      }
    }
    
    return { count, errors };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Error migrating check-ins: ${errorMsg}`);
    return { count, errors };
  }
}

/**
 * Migrates CL history from AsyncStorage to Supabase
 */
async function migrateCLHistory(userId: string): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;
  
  try {
    const data = await AsyncStorage.getItem(HEADACHE_CL_HISTORY_KEY);
    if (!data) {
      return { count: 0, errors: [] };
    }
    
    const clHistory = JSON.parse(data) as OldCLHistoryData;
    const entries = Object.entries(clHistory);
    
    if (entries.length === 0) {
      return { count: 0, errors: [] };
    }
    
    // Prepare rows for insertion
    const rows = entries.map(([date, cl_value]) => ({
      user_id: userId,
      date: date,
      cl_value: cl_value,
    }));
    
    // Insert all rows (using upsert to handle duplicates)
    const { error } = await supabase
      .from('cl_history')
      .upsert(rows, {
        onConflict: 'user_id,date',
      });
    
    if (error) {
      errors.push(`Error inserting CL history: ${error.message}`);
    } else {
      count = rows.length;
    }
    
    return { count, errors };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Error migrating CL history: ${errorMsg}`);
    return { count, errors };
  }
}

/**
 * Migrates threshold data from AsyncStorage to Supabase
 */
async function migrateThresholdData(userId: string): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;
  
  try {
    const data = await AsyncStorage.getItem(HEADACHE_THRESHOLD_DATA_KEY);
    if (!data) {
      return { count: 0, errors: [] };
    }
    
    const thresholdData = JSON.parse(data) as OldThresholdData;
    const values = thresholdData.headacheDayCLValues || [];
    
    if (values.length === 0) {
      return { count: 0, errors: [] };
    }
    
    // Prepare rows for insertion
    const rows = values.map(cl_value => ({
      user_id: userId,
      cl_value: cl_value,
    }));
    
    // Insert all rows
    const { error } = await supabase
      .from('threshold_data')
      .insert(rows);
    
    if (error) {
      errors.push(`Error inserting threshold data: ${error.message}`);
    } else {
      count = rows.length;
    }
    
    return { count, errors };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Error migrating threshold data: ${errorMsg}`);
    return { count, errors };
  }
}

/**
 * Migrates user settings from AsyncStorage to Supabase
 */
async function migrateUserSettings(userId: string): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    const data = await AsyncStorage.getItem(HEADACHE_THRESHOLD_KEY);
    if (!data) {
      return { success: true, errors: [] }; // No settings to migrate
    }
    
    const threshold = parseFloat(data);
    if (isNaN(threshold)) {
      return { success: true, errors: [] }; // Invalid data, skip
    }
    
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        headache_threshold: threshold,
      }, {
        onConflict: 'user_id',
      });
    
    if (error) {
      errors.push(`Error inserting user settings: ${error.message}`);
      return { success: false, errors };
    }
    
    return { success: true, errors: [] };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Error migrating user settings: ${errorMsg}`);
    return { success: false, errors };
  }
}

/**
 * Performs the full migration from AsyncStorage to Supabase
 * 
 * @param clearLocalData - If true, clears AsyncStorage data after successful migration
 * @returns Migration result with counts and any errors
 */
export async function migrateToSupabase(clearLocalData: boolean = false): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    checkInsMigrated: 0,
    clHistoryMigrated: 0,
    thresholdDataMigrated: 0,
    settingsMigrated: false,
    errors: [],
  };
  
  try {
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      result.errors.push('User not authenticated');
      return result;
    }
    
    const userId = user.id;
    
    // Migrate check-ins
    const checkInsResult = await migrateCheckIns(userId);
    result.checkInsMigrated = checkInsResult.count;
    result.errors.push(...checkInsResult.errors);
    
    // Migrate CL history
    const clHistoryResult = await migrateCLHistory(userId);
    result.clHistoryMigrated = clHistoryResult.count;
    result.errors.push(...clHistoryResult.errors);
    
    // Migrate threshold data
    const thresholdDataResult = await migrateThresholdData(userId);
    result.thresholdDataMigrated = thresholdDataResult.count;
    result.errors.push(...thresholdDataResult.errors);
    
    // Migrate user settings
    const settingsResult = await migrateUserSettings(userId);
    result.settingsMigrated = settingsResult.success;
    result.errors.push(...settingsResult.errors);
    
    // Mark migration as completed if there were no critical errors
    const hasCriticalErrors = result.errors.length > 0 && 
      result.checkInsMigrated === 0 && 
      result.clHistoryMigrated === 0 && 
      result.thresholdDataMigrated === 0 && 
      !result.settingsMigrated;
    
    if (!hasCriticalErrors) {
      await AsyncStorage.setItem(MIGRATION_COMPLETED_KEY, 'true');
      result.success = true;
      
      // Optionally clear local data
      if (clearLocalData) {
        await clearLocalStorageData();
      }
    }
    
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Migration failed: ${errorMsg}`);
    return result;
  }
}

/**
 * Clears all app data from AsyncStorage (but keeps migration status)
 */
export async function clearLocalStorageData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      CHECKINS_KEY,
      HEADACHE_THRESHOLD_KEY,
      HEADACHE_CL_HISTORY_KEY,
      HEADACHE_THRESHOLD_DATA_KEY,
    ]);
  } catch (error) {
    console.error('Error clearing local storage data:', error);
  }
}

/**
 * Resets migration status (for testing or re-migration)
 */
export async function resetMigrationStatus(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MIGRATION_COMPLETED_KEY);
  } catch (error) {
    console.error('Error resetting migration status:', error);
  }
}

/**
 * Gets migration status info for debugging
 */
export async function getMigrationStatus(): Promise<{
  migrationCompleted: boolean;
  hasLocalData: boolean;
  hasSupabaseData: boolean;
  isAuthenticated: boolean;
}> {
  const [migrationCompleted, hasLocalData, hasRemoteData] = await Promise.all([
    isMigrationCompleted(),
    hasDataToMigrate(),
    hasSupabaseData(),
  ]);
  
  const { data: { user } } = await supabase.auth.getUser();
  
  return {
    migrationCompleted,
    hasLocalData,
    hasSupabaseData: hasRemoteData,
    isAuthenticated: !!user,
  };
}
