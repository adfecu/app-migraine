/**
 * The user's profile in user_settings. Check-ins and crises are saved and read
 * through utils/records.ts.
 */

import { supabase } from './supabase';

// ============================================================================
// Types
// ============================================================================

export type AnswerValue = boolean | number | string | string[];

// ============================================================================
// Helpers
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

// ============================================================================
// User profile
// ============================================================================

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
