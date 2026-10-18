/**
 * Saves and reads structured records through the database write functions
 * (supabase/migrations/20261018141002_structured_records.sql).
 *
 * Every save carries a client request ID created once per form. Retrying with
 * the same ID returns the stored record, so a save that timed out on the device
 * after the server stored it is never written twice.
 */
import * as Crypto from 'expo-crypto';

import type { Database } from '@/types/database';

import type { Answers } from './answers';
import { supabase } from './supabase';

export type DailyCheckInRecord = Database['public']['Tables']['daily_checkins']['Row'];
export type EpisodeRecord = Database['public']['Tables']['episodes']['Row'];
export type OnsetPrecision = 'exact' | 'approximate' | 'unknown';

/** Bump when a form's questions or answer meanings change. */
export const DAILY_FORM_VERSION = 1;
export const EPISODE_FORM_VERSION = 1;

/** Error codes raised by the write functions, plus `network` for anything else. */
export type RecordErrorCode =
  | 'invalid_answers'
  | 'episode_ongoing'
  | 'episode_already_ended'
  | 'invalid_end_time'
  | 'invalid_onset'
  | 'not_found'
  | 'network';

const KNOWN_CODES: RecordErrorCode[] = [
  'invalid_answers',
  'episode_ongoing',
  'episode_already_ended',
  'invalid_end_time',
  'invalid_onset',
  'not_found',
];

export class RecordError extends Error {
  constructor(
    readonly code: RecordErrorCode,
    message: string,
    /** For episode_ongoing, the ongoing episode's ID. */
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = 'RecordError';
  }
}

function toRecordError(error: { message: string; details?: string | null }): RecordError {
  const code = KNOWN_CODES.find(c => c === error.message) ?? 'network';
  return new RecordError(code, error.message, error.details ?? null);
}

export function newClientId(): string {
  return Crypto.randomUUID();
}

/** The device's IANA time zone, e.g. "America/Bogota". */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The device's local calendar date as YYYY-MM-DD. */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Saves the daily check-in for `localDate`, replacing that day's check-in if one exists. */
export async function saveDailyCheckIn(params: {
  clientId: string;
  localDate: string;
  answers: Answers;
}): Promise<DailyCheckInRecord> {
  const { data, error } = await supabase.rpc('save_daily_checkin', {
    p_client_id: params.clientId,
    p_local_date: params.localDate,
    p_time_zone: deviceTimeZone(),
    p_form_version: DAILY_FORM_VERSION,
    p_answers: params.answers,
  });
  if (error) throw toRecordError(error);
  return data as DailyCheckInRecord;
}

/** The signed-in user's check-in for `localDate`, or null. */
export async function getDailyCheckIn(localDate: string): Promise<DailyCheckInRecord | null> {
  const { data, error } = await supabase
    .from('daily_checkins')
    .select('*')
    .eq('local_date', localDate)
    .maybeSingle();
  if (error) throw toRecordError(error);
  return data as DailyCheckInRecord | null;
}

/**
 * Starts an ongoing episode. Throws RecordError('episode_ongoing') with the
 * ongoing episode's ID as `detail` if one is already ongoing.
 */
export async function startEpisode(params: {
  clientId: string;
  onsetAt: string | null;
  onsetPrecision: OnsetPrecision;
  source: 'manual' | 'voice';
  answers: Answers;
}): Promise<EpisodeRecord> {
  const { data, error } = await supabase.rpc('start_episode', {
    p_client_id: params.clientId,
    p_onset_at: params.onsetAt,
    p_onset_precision: params.onsetPrecision,
    p_time_zone: deviceTimeZone(),
    p_source: params.source,
    p_form_version: EPISODE_FORM_VERSION,
    p_answers: params.answers,
  });
  if (error) throw toRecordError(error);
  return data as EpisodeRecord;
}

/** The signed-in user's ongoing episode, or null. */
export async function getOngoingEpisode(): Promise<EpisodeRecord | null> {
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .is('ended_at', null)
    .maybeSingle();
  if (error) throw toRecordError(error);
  return data as EpisodeRecord | null;
}

export async function getEpisode(id: string): Promise<EpisodeRecord | null> {
  const { data, error } = await supabase.from('episodes').select('*').eq('id', id).maybeSingle();
  if (error) throw toRecordError(error);
  return data as EpisodeRecord | null;
}

/** Ends an ongoing episode at the time the user reports. Repeating the call is harmless. */
export async function endEpisode(id: string, endedAt: string): Promise<EpisodeRecord> {
  const { data, error } = await supabase.rpc('end_episode', {
    p_episode_id: id,
    p_ended_at: endedAt,
  });
  if (error) throw toRecordError(error);
  return data as EpisodeRecord;
}
