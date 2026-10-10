/**
 * Voice answers must never invent values: anything missing or not understood
 * is stored as UNKNOWN_ANSWER ('').
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('expo-speech', () => ({}));
jest.mock('expo-haptics', () => ({}));

import { classifyNegation, getVoiceQuestions, UNKNOWN_ANSWER, VoiceQuestion } from '../voiceCrisis';

const questions = getVoiceQuestions('female');
const byId = (id: string): VoiceQuestion => {
  const q = questions.find(v => v.questionId === id);
  if (!q) throw new Error(`missing ${id}`);
  return q;
};
const combine = (id: string, answer: string | number | boolean | null) => byId(id).combine([answer]);

describe('classifyNegation', () => {
  it.each([
    ['no', 'none'],
    ['No, nada', 'none'],
    ['ninguno', 'none'],
    ['no sé', 'unknown'],
    ['No se', 'unknown'],
    ['uno', null],
    ['de noche', null],
  ])('%s -> %s', (text, expected) => {
    expect(classifyNegation(text)).toBe(expected);
  });
});

describe('voice answers without a usable reply', () => {
  it.each([
    'crisis_pain_start',
    'crisis_intensity',
    'crisis_pain_characteristics',
    'crisis_aura',
    'crisis_symptoms',
    'crisis_triggers',
    'crisis_medication',
    'crisis_healthcare_visit',
  ])('%s is unknown when nothing was heard', id => {
    expect(combine(id, null)).toBe(UNKNOWN_ANSWER);
  });

  it('does not treat "no sé" as "no triggers"', () => {
    expect(combine('crisis_triggers', 'no sé')).toBe(UNKNOWN_ANSWER);
  });

  it('does not treat an unrecognised description as "none"', () => {
    expect(combine('crisis_pain_characteristics', 'me duele detrás del ojo')).toBe(UNKNOWN_ANSWER);
    expect(combine('crisis_symptoms', 'estoy mareada')).toBe(UNKNOWN_ANSWER);
  });

  it('does not record "no medication" for an unrecognised medication', () => {
    expect(combine('crisis_medication', 'tomé sumatriptán')).toBe(UNKNOWN_ANSWER);
    expect(combine('crisis_medication', 'sí, una pastilla')).toEqual(['si']);
  });
});

describe('voice answers with a clear reply', () => {
  it('keeps explicit negatives', () => {
    expect(combine('crisis_pain_characteristics', 'ninguna')).toEqual(['ninguna']);
    expect(combine('crisis_symptoms', 'no')).toEqual(['ninguno']);
    expect(combine('crisis_aura', 'no')).toEqual([]);
    expect(combine('crisis_medication', 'no')).toEqual(['no']);
    expect(combine('crisis_healthcare_visit', false)).toBe('no');
  });

  it('keeps recognised values', () => {
    expect(combine('crisis_intensity', 8)).toBe(8);
    expect(combine('crisis_pain_characteristics', 'me late en un solo lado')).toEqual(['pulsatil', 'unilateral']);
    expect(combine('crisis_medication', 'tomé ibuprofeno')).toEqual(['si', 'ibuprofeno']);
    expect(combine('crisis_healthcare_visit', true)).toBe('yes');
  });
});
