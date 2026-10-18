/**
 * Tests for the pure evaluators in utils/storage.ts, reading answers by
 * question ID. Wording and scoring are unchanged until the clinical review
 * (docs/app-migraine-implementation-plan.md, Phase 5).
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../supabase', () => ({ supabase: {} }));

import type { AnswerEntry, Answers, FormValue } from '../answers';
import type { Entry } from '../entries';
import { evaluateMigraine, shouldShowMigraineAlert } from '../storage';

const answered = (value: FormValue): AnswerEntry => ({ status: 'answered', value });

function dayKey(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function checkIn(answers: Record<string, FormValue | AnswerEntry>, daysAgo = 0): Entry {
  const encoded: Answers = {};
  for (const [id, value] of Object.entries(answers)) {
    encoded[id] =
      typeof value === 'object' && value !== null && !Array.isArray(value) && 'status' in value
        ? (value as AnswerEntry)
        : answered(value as FormValue);
  }
  return {
    id: Math.random().toString(36).slice(2),
    kind: 'checkin',
    date: new Date().toISOString(),
    dayKey: dayKey(daysAgo),
    answers: encoded,
    onsetPrecision: null,
    endDate: null,
    endReported: false,
    legacyTimeZone: false,
    needsReview: false,
  };
}

function crisis(overrides: Partial<Entry> = {}, answers: Answers = {}): Entry {
  return {
    id: Math.random().toString(36).slice(2),
    kind: 'crisis',
    date: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    dayKey: dayKey(),
    answers: {
      crisis_intensity: answered(9),
      crisis_pain_characteristics: answered(['unilateral', 'pulsatil']),
      crisis_symptoms: answered(['nauseas', 'luz_ruido']),
      ...answers,
    },
    onsetPrecision: 'exact',
    endDate: null,
    endReported: false,
    legacyTimeZone: false,
    needsReview: false,
    ...overrides,
  };
}

const fullMigraineCheckIn = (duration = '5_horas') =>
  checkIn({
    q1_headache: true,
    q2_1_intensity: 8,
    q2_2_duration: duration,
    q3_pain_characteristics: ['unilateral', 'pulsatil', 'agravamiento_actividad'],
    q4_symptoms: ['nauseas', 'luz_ruido'],
  });

describe('evaluateMigraine', () => {
  it('returns score 0 when no headache was reported', () => {
    const result = evaluateMigraine(checkIn({ q1_headache: false }));
    expect(result).toMatchObject({ hadHeadache: false, mayHaveMigraine: false, score: 0, riskLevel: 'low' });
  });

  it('meets all criteria for a full presentation with a duration the current form saves', () => {
    const result = evaluateMigraine(fullMigraineCheckIn('5_horas'));
    expect(result.mayHaveMigraine).toBe(true);
    expect(result.score).toBe(100);
    expect(result.riskLevel).toBe('high');
  });

  it('accepts the duration ranges stored by older builds', () => {
    expect(evaluateMigraine(fullMigraineCheckIn('4-12_horas')).mayHaveMigraine).toBe(true);
    expect(evaluateMigraine(fullMigraineCheckIn('todo_el_dia')).mayHaveMigraine).toBe(true);
    expect(evaluateMigraine(fullMigraineCheckIn('1-4_horas')).mayHaveMigraine).toBe(false);
  });

  it('requires duration >= 4h for mayHaveMigraine', () => {
    const result = evaluateMigraine(fullMigraineCheckIn('3_horas'));
    expect(result.mayHaveMigraine).toBe(false);
    expect(result.reasons.notMet).toContain('Duración <4 horas');
    expect(result.score).toBe(70);
  });

  it('does not count a skipped or unverified intensity as moderate/severe', () => {
    const base = {
      q1_headache: true,
      q2_2_duration: '5_horas',
      q3_pain_characteristics: ['unilateral'],
      q4_symptoms: ['nauseas'],
    };
    const skipped = evaluateMigraine(checkIn({ ...base, q2_1_intensity: { status: 'skipped' } }));
    expect(skipped.reasons.notMet).toContain('Características del dolor: 1/2 mínimo');
    const unverified = evaluateMigraine(
      checkIn({ ...base, q2_1_intensity: { status: 'answered', value: 5, unverified: true } as AnswerEntry }),
    );
    expect(unverified.mayHaveMigraine).toBe(false);
  });
});

describe('shouldShowMigraineAlert', () => {
  it('returns null with no entries', () => {
    expect(shouldShowMigraineAlert([])).toBeNull();
  });

  it('alerts when the latest check-in meets criteria', () => {
    const alert = shouldShowMigraineAlert([fullMigraineCheckIn()]);
    expect(alert?.reasons).toEqual(['Tu último check-in reúne los rasgos de migraña de los criterios ICHD-3']);
  });

  it('uses the latest check-in by day, not by save order', () => {
    const older = fullMigraineCheckIn();
    older.dayKey = dayKey(3);
    older.date = new Date().toISOString();
    const latest = checkIn({ q1_headache: false });
    latest.date = new Date(Date.now() - 86_400_000).toISOString();
    expect(shouldShowMigraineAlert([older, latest])).toBeNull();
  });

  it('alerts on an ongoing crisis', () => {
    const alert = shouldShowMigraineAlert([crisis({}, { crisis_intensity: answered(2) })]);
    expect(alert?.reasons).toContain('Tienes un episodio de crisis activo sin resolver');
  });

  it('does not alert for an ended crisis with low scores', () => {
    const alert = shouldShowMigraineAlert([
      crisis(
        { endDate: new Date().toISOString() },
        { crisis_intensity: answered(2), crisis_pain_characteristics: answered(['ninguna']), crisis_symptoms: answered(['ninguno']) },
      ),
    ]);
    expect(alert).toBeNull();
  });

  it('scores crises by their own questions and length', () => {
    // Three ended 6-hour crises with every feature: all score 100.
    const ended = () => crisis({ endDate: new Date().toISOString(), endReported: true });
    const alert = shouldShowMigraineAlert([ended(), ended(), ended()]);
    expect(alert?.reasons).toContain('3 de 3 episodios recientes reúnen varios rasgos de migraña');
  });

  it('does not count the time until an automatic close as crisis length', () => {
    const autoClosed = () => crisis({ endDate: new Date().toISOString(), endReported: false });
    // Without a reported end the 30 duration points are missing: 70 is not reached.
    const alert = shouldShowMigraineAlert([autoClosed(), autoClosed(), autoClosed()]);
    expect(alert).toBeNull();
  });

  it('describes recorded headache days without classifying them as chronic', () => {
    const days = Array.from({ length: 46 }, (_, i) => checkIn({ q1_headache: true }, i));
    const reasons = shouldShowMigraineAlert(days)?.reasons ?? [];
    expect(reasons).toContain('Registraste 46 días con dolor de cabeza en los últimos 90 días');
    expect(reasons.join(' ')).not.toMatch(/probabilidad|crónico/i);
  });

  it('counts a day once when it has a check-in and a crisis', () => {
    const entries = Array.from({ length: 45 }, (_, i) => checkIn({ q1_headache: true }, i));
    const sameDayCrisis = crisis({ endDate: new Date().toISOString() });
    const reasons = shouldShowMigraineAlert([...entries, sameDayCrisis])?.reasons ?? [];
    expect(reasons).toContain('Registraste 45 días con dolor de cabeza en los últimos 90 días');
  });
});
