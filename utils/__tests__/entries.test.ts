import type { DailyCheckInRecord, EpisodeRecord } from '../records';
import {
  dateKeyInZone,
  durationAtLeast,
  entryFromDaily,
  entryFromEpisode,
  episodeHours,
  measured,
  newestFirst,
} from '../entries';

const daily = (overrides: Partial<DailyCheckInRecord> = {}): DailyCheckInRecord => ({
  id: 'd1',
  user_id: 'u',
  local_date: '2026-10-17',
  time_zone: 'America/Bogota',
  answers: { q1_headache: { status: 'answered', value: true } },
  form_version: 1,
  source: 'manual',
  needs_review: false,
  legacy_check_in_id: null,
  recorded_at: '2026-10-18T02:00:00Z',
  updated_at: '2026-10-18T02:00:00Z',
  ...overrides,
});

const episode = (overrides: Partial<EpisodeRecord> = {}): EpisodeRecord => ({
  id: 'e1',
  user_id: 'u',
  onset_at: '2026-10-18T03:30:00Z',
  onset_precision: 'exact',
  ended_at: null,
  end_source: null,
  time_zone: 'America/Bogota',
  answers: {},
  form_version: 1,
  source: 'manual',
  needs_review: false,
  legacy_check_in_id: null,
  recorded_at: '2026-10-18T04:00:00Z',
  updated_at: '2026-10-18T04:00:00Z',
  ...overrides,
});

describe('dateKeyInZone', () => {
  it('uses the given time zone', () => {
    // 03:30 UTC is still the previous evening in Bogotá (UTC-5).
    expect(dateKeyInZone('2026-10-18T03:30:00Z', 'America/Bogota')).toBe('2026-10-17');
    expect(dateKeyInZone('2026-10-18T03:30:00Z', 'Europe/Madrid')).toBe('2026-10-18');
  });

  it('uses UTC when there is no time zone', () => {
    expect(dateKeyInZone('2026-10-18T03:30:00Z', null)).toBe('2026-10-18');
  });
});

describe('entries', () => {
  it('puts a check-in on its local date', () => {
    expect(entryFromDaily(daily()).dayKey).toBe('2026-10-17');
  });

  it('puts a crisis on the local day it started', () => {
    expect(entryFromEpisode(episode()).dayKey).toBe('2026-10-17');
  });

  it('falls back to the recording time when the onset is unknown', () => {
    const entry = entryFromEpisode(episode({ onset_at: null, onset_precision: 'unknown' }));
    expect(entry.date).toBe('2026-10-18T04:00:00Z');
    expect(episodeHours({ ...entry, endDate: '2026-10-18T10:00:00Z', endReported: true })).toBeNull();
  });

  it('shows when a check-in was first saved, not when it was converted or edited', () => {
    const entry = entryFromDaily(daily({ recorded_at: '2026-03-01T20:00:00Z', updated_at: '2026-10-18T14:10:00Z' }));
    expect(entry.date).toBe('2026-03-01T20:00:00Z');
  });

  it('marks converted records without a time zone', () => {
    expect(entryFromDaily(daily({ time_zone: null })).legacyTimeZone).toBe(true);
  });

  it('measures crisis length from onset to a reported end', () => {
    expect(episodeHours(entryFromEpisode(episode({ ended_at: '2026-10-18T09:30:00Z', end_source: 'user' })))).toBe(6);
  });

  it('has no length when an old build closed the crisis automatically', () => {
    const entry = entryFromEpisode(episode({ ended_at: '2026-10-28T09:30:00Z', end_source: 'legacy_next_checkin' }));
    expect(entry.endReported).toBe(false);
    expect(episodeHours(entry)).toBeNull();
  });

  it('orders by day, then time', () => {
    const a = entryFromDaily(daily({ id: 'a', local_date: '2026-10-16' }));
    const b = entryFromEpisode(episode({ id: 'b' }));
    const c = entryFromDaily(daily({ id: 'c', local_date: '2026-10-17', recorded_at: '2026-10-17T12:00:00Z' }));
    expect(newestFirst([a, c, b]).map(e => e.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('measured', () => {
  const entry = entryFromDaily(
    daily({
      answers: {
        q_stress: { status: 'skipped' },
        q_sleep: { status: 'answered', value: 6, unverified: true },
        q_alcohol: { status: 'answered', value: 0 },
      },
    }),
  );

  it('returns only real answers', () => {
    expect(measured(entry, 'q_alcohol')).toBe(0);
    expect(measured(entry, 'q_stress')).toBeUndefined();
    expect(measured(entry, 'q_sleep')).toBeUndefined();
    expect(measured(entry, 'q_caffeine')).toBeUndefined();
  });
});

describe('durationAtLeast', () => {
  it.each([
    ['<1_hora', false],
    ['3_horas', false],
    ['4_horas', true],
    ['24_horas', true],
    ['1-4_horas', false],
    ['4-12_horas', true],
    ['todo_el_dia', true],
    ['algo', false],
  ])('%s → %s for 4 hours', (code, expected) => {
    expect(durationAtLeast(code, 4)).toBe(expected);
  });
});
