/**
 * One shape for daily check-ins and episodes (crises) as the diary, dashboard
 * and report read them. Answers are looked up by question ID.
 */
import type { AnswerEntry, Answers, FormValue } from './answers';
import type { DailyCheckInRecord, EpisodeRecord, OnsetPrecision } from './records';

export type EntryKind = 'checkin' | 'crisis';

export interface Entry {
  id: string;
  kind: EntryKind;
  /**
   * When it happened: when a check-in was first saved (for converted records, the
   * original save), or a crisis's onset (or recording time when unknown).
   */
  date: string;
  /** The calendar day it belongs to, YYYY-MM-DD. */
  dayKey: string;
  answers: Answers;
  /** Crisis only. */
  onsetPrecision: OnsetPrecision | null;
  endDate: string | null;
  /**
   * True when the user reported when the crisis ended. Old builds closed crises
   * automatically at the next no-headache check-in, which is not when the pain ended.
   */
  endReported: boolean;
  /** Converted from the old format without a time zone; dayKey is the UTC date. */
  legacyTimeZone: boolean;
  needsReview: boolean;
}

/** The calendar date of `iso` in `timeZone` (UTC when null), as YYYY-MM-DD. */
export function dateKeyInZone(iso: string, timeZone: string | null): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone ?? 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function entryFromDaily(record: DailyCheckInRecord): Entry {
  return {
    id: record.id,
    kind: 'checkin',
    date: record.recorded_at,
    dayKey: record.local_date,
    answers: record.answers as Answers,
    onsetPrecision: null,
    endDate: null,
    endReported: false,
    legacyTimeZone: record.time_zone === null,
    needsReview: record.needs_review,
  };
}

export function entryFromEpisode(record: EpisodeRecord): Entry {
  const date = record.onset_at ?? record.recorded_at;
  return {
    id: record.id,
    kind: 'crisis',
    date,
    dayKey: dateKeyInZone(date, record.time_zone),
    answers: record.answers as Answers,
    onsetPrecision: record.onset_precision as OnsetPrecision,
    endDate: record.ended_at,
    endReported: record.end_source === 'user',
    legacyTimeZone: record.time_zone === null,
    needsReview: record.needs_review,
  };
}

/** Newest first, by day and then by time. */
export function newestFirst(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) =>
    a.dayKey !== b.dayKey ? (a.dayKey < b.dayKey ? 1 : -1) : new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function answerEntry(entry: Entry, questionId: string): AnswerEntry | undefined {
  return entry.answers[questionId];
}

/**
 * The value the user gave, or undefined when the question was not asked,
 * skipped, unknown, or is an old slider default that may not be a real answer.
 */
export function measured(entry: Entry, questionId: string): FormValue | undefined {
  const answer = entry.answers[questionId];
  if (!answer || answer.status !== 'answered') return undefined;
  if ('unverified' in answer && (answer as { unverified?: boolean }).unverified) return undefined;
  return answer.value;
}

export function measuredNumber(entry: Entry, questionId: string): number | undefined {
  const value = measured(entry, questionId);
  return typeof value === 'number' ? value : undefined;
}

export function measuredList(entry: Entry, questionId: string): string[] {
  const value = measured(entry, questionId);
  return Array.isArray(value) ? value : [];
}

/** True when the answer is an old slider default kept as unverified. */
export function isUnverified(entry: Entry, questionId: string): boolean {
  const answer = entry.answers[questionId] as { unverified?: boolean } | undefined;
  return answer?.unverified === true;
}

/** Free text the user typed for `option`, if any. */
export function answerText(entry: Entry, questionId: string, option: string): string | undefined {
  const answer = entry.answers[questionId];
  return answer?.status === 'answered' ? answer.text?.[option] : undefined;
}

/**
 * Whether a stored duration lasted at least `hours`. Current codes are
 * '<1_hora' and 'N_horas'; older builds stored ranges.
 */
export function durationAtLeast(code: string, hours: number): boolean {
  if (code === 'todo_el_dia') return hours <= 12;
  const range = code.match(/^(\d+)-(\d+)_horas$/);
  if (range) return parseInt(range[1], 10) >= hours;
  const exact = code.match(/^(\d+)_horas?$/);
  return exact ? parseInt(exact[1], 10) >= hours : false;
}

/** A crisis's length in hours, when its onset is known and the user reported its end. */
export function episodeHours(entry: Entry): number | null {
  if (entry.kind !== 'crisis' || !entry.endDate || !entry.endReported || entry.onsetPrecision === 'unknown') {
    return null;
  }
  return (new Date(entry.endDate).getTime() - new Date(entry.date).getTime()) / 3_600_000;
}
