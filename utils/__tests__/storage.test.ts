/**
 * Characterization tests for the pure evaluators in utils/storage.ts.
 *
 * These pin down CURRENT behavior, including known defects (marked
 * "known defect"), so that later fixes show up as deliberate test changes.
 * See docs/app-migraine-implementation-plan.md, Phase 5.
 */
import type { CheckIn } from '../supabaseStorage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../supabase', () => ({ supabase: {} }));

import { evaluateMigraine, mapAnswersByQuestion, shouldShowMigraineAlert } from '../storage';

// Question wording copied from app/checkin.tsx and app/crisis.tsx.
const Q = {
  headache: '¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?',
  intensity: '¿Cuál fue la intensidad máxima del dolor hoy?',
  duration: '¿Cuántas horas duró el dolor hoy?',
  painChars: '¿Cómo sentiste el dolor hoy? (Marca todas las que apliquen)',
  symptoms: '¿Notaste alguno de estos síntomas junto con el dolor?',
  sleep: '¿Cuántas horas dormiste anoche?',
  stress: '¿Qué tan estresado te sientes hoy?',
};

const CRISIS_Q = {
  start: '¿Cuándo comenzó el dolor?',
  intensity: '¿Cuál es la intensidad del dolor ahora?',
  painChars: '¿Cómo sientes el dolor? (Marca todas las que apliquen)',
  symptoms: '¿Tienes alguno de estos síntomas ahora?',
};

function checkIn(entries: [string, CheckIn['answers'][number]][], date = new Date().toISOString()): CheckIn {
  return {
    id: Math.random().toString(36).slice(2),
    date,
    type: 'checkin',
    questions: entries.map(([q]) => q),
    answers: entries.map(([, a]) => a),
  };
}

function crisis(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: Math.random().toString(36).slice(2),
    date: new Date().toISOString(),
    type: 'crisis',
    questions: [CRISIS_Q.start, CRISIS_Q.intensity, CRISIS_Q.painChars, CRISIS_Q.symptoms],
    answers: [new Date().toISOString(), 9, ['unilateral', 'pulsatil'], ['nauseas', 'luz_ruido']],
    ...overrides,
  };
}

const fullMigraineCheckIn = () =>
  checkIn([
    [Q.headache, true],
    [Q.intensity, 8],
    [Q.duration, 'todo_el_dia'],
    [Q.painChars, ['unilateral', 'pulsatil', 'agravamiento_actividad']],
    [Q.symptoms, ['nauseas', 'luz_ruido']],
  ]);

describe('mapAnswersByQuestion', () => {
  it('maps check-in answers by question wording', () => {
    const mapped = mapAnswersByQuestion(
      checkIn([
        [Q.headache, true],
        [Q.intensity, 6],
        [Q.sleep, 7],
        [Q.stress, 3],
      ]),
    );
    expect(mapped).toEqual({ headache: true, intensity: 6, sleep: 7, stress: 3 });
  });

  it('known defect: crisis wording does not map to any key', () => {
    expect(mapAnswersByQuestion(crisis())).toEqual({});
  });

  it('ignores unknown wording silently', () => {
    expect(mapAnswersByQuestion(checkIn([['Pregunta desconocida', 5]]))).toEqual({});
  });
});

describe('evaluateMigraine', () => {
  it('returns score 0 when no headache was reported', () => {
    const result = evaluateMigraine(checkIn([[Q.headache, false]]));
    expect(result).toMatchObject({ hadHeadache: false, mayHaveMigraine: false, score: 0, riskLevel: 'low' });
  });

  it('meets all criteria for a full migraine presentation', () => {
    const result = evaluateMigraine(fullMigraineCheckIn());
    expect(result.mayHaveMigraine).toBe(true);
    expect(result.score).toBe(100);
    expect(result.riskLevel).toBe('high');
  });

  it('requires duration >= 4h for mayHaveMigraine', () => {
    const result = evaluateMigraine(
      checkIn([
        [Q.headache, true],
        [Q.intensity, 8],
        [Q.duration, '1-4_horas'],
        [Q.painChars, ['unilateral', 'pulsatil']],
        [Q.symptoms, ['nauseas']],
      ]),
    );
    expect(result.mayHaveMigraine).toBe(false);
    expect(result.reasons.notMet).toContain('Duración <4 horas');
    expect(result.score).toBe(50);
  });

  it('known defect: a severe crisis entry scores 0 because it lacks check-in wording', () => {
    const result = evaluateMigraine(crisis());
    expect(result).toMatchObject({ hadHeadache: false, score: 0, riskLevel: 'low' });
  });

  it('known defect: a missing intensity answer counts as "not moderate/severe" rather than unknown', () => {
    const result = evaluateMigraine(
      checkIn([
        [Q.headache, true],
        [Q.duration, 'todo_el_dia'],
        [Q.painChars, ['unilateral']],
        [Q.symptoms, ['nauseas']],
      ]),
    );
    expect(result.mayHaveMigraine).toBe(false);
    expect(result.reasons.notMet).toContain('Características del dolor: 1/2 mínimo');
  });
});

describe('shouldShowMigraineAlert', () => {
  it('returns null with no entries', () => {
    expect(shouldShowMigraineAlert([])).toBeNull();
  });

  it('alerts when the latest check-in meets criteria', () => {
    const alert = shouldShowMigraineAlert([fullMigraineCheckIn()]);
    expect(alert?.reasons).toEqual([
      'Tu último check-in cumple los criterios clínicos de migraña (ICHD-3)',
    ]);
  });

  it('alerts on an active unresolved crisis', () => {
    const alert = shouldShowMigraineAlert([crisis({ answers: [new Date().toISOString(), 2, [], []] })]);
    expect(alert?.reasons).toContain('Tienes un episodio de crisis activo sin resolver');
  });

  it('does not alert for a resolved crisis with low scores', () => {
    const alert = shouldShowMigraineAlert([
      crisis({ answers: [new Date().toISOString(), 2, [], []], endDate: new Date().toISOString() }),
    ]);
    expect(alert).toBeNull();
  });
});
