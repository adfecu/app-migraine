jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000000' }));

import { QUESTIONS } from '@/app/checkin';
import { CRISIS_QUESTIONS } from '@/app/crisis';

import { decodeAnswers, encodeAnswer, encodeAnswers, encodeVoiceAnswer, type FormValue } from '../answers';

const q = (id: string) => {
  const found = [...QUESTIONS, ...CRISIS_QUESTIONS].find(question => question.id === id);
  if (!found) throw new Error(`no question ${id}`);
  return found;
};

describe('encodeAnswer', () => {
  it('stores slider numbers and "Prefiero no responder" distinctly', () => {
    expect(encodeAnswer(q('q_stress'), 7)).toEqual({ status: 'answered', value: 7 });
    expect(encodeAnswer(q('q_stress'), 0)).toEqual({ status: 'answered', value: 0 });
    expect(encodeAnswer(q('q_stress'), '')).toEqual({ status: 'skipped' });
    expect(encodeAnswer(q('q_stress'), null)).toEqual({ status: 'unknown' });
  });

  it('stores yes/no answers', () => {
    expect(encodeAnswer(q('q1_headache'), false)).toEqual({ status: 'answered', value: false });
    expect(encodeAnswer(q('q1_headache'), null)).toEqual({ status: 'unknown' });
  });

  it('keeps free text only for selected free-text options', () => {
    expect(
      encodeAnswer(q('q7_triggers'), ['estres', 'otro'], { otro: '  ruido de obra  ', estres: 'ignored' }),
    ).toEqual({ status: 'answered', value: ['estres', 'otro'], text: { otro: 'ruido de obra' } });
    expect(encodeAnswer(q('q7_triggers'), ['estres'], { otro: 'not selected' })).toEqual({
      status: 'answered',
      value: ['estres'],
    });
    expect(encodeAnswer(q('q7_triggers'), ['otro'], { otro: '   ' })).toEqual({ status: 'answered', value: ['otro'] });
  });

  it('keeps free text for nested medication options', () => {
    expect(encodeAnswer(q('q5_2_medication'), ['si', 'otra_medicacion'], { otra_medicacion: 'naproxeno' })).toEqual({
      status: 'answered',
      value: ['si', 'otra_medicacion'],
      text: { otra_medicacion: 'naproxeno' },
    });
  });

  it('limits free text to 500 characters', () => {
    const entry = encodeAnswer(q('q7_triggers'), ['otro'], { otro: 'x'.repeat(600) });
    expect(entry.status === 'answered' && entry.text?.otro.length).toBe(500);
  });

  it('treats an empty checkbox list as not answered', () => {
    expect(encodeAnswer(q('q4_symptoms'), [])).toEqual({ status: 'unknown' });
  });

  it('turns a typed health-centre answer into yes with text', () => {
    const visit = q('crisis_healthcare_visit');
    expect(encodeAnswer(visit, 'no')).toEqual({ status: 'answered', value: 'no' });
    expect(encodeAnswer(visit, 'yes')).toEqual({ status: 'answered', value: 'yes' });
    expect(encodeAnswer(visit, 'Urgencias del hospital')).toEqual({
      status: 'answered',
      value: 'yes',
      text: { yes: 'Urgencias del hospital' },
    });
    expect(encodeAnswer(visit, '')).toEqual({ status: 'unknown' });
  });

  it('stores duration codes', () => {
    expect(encodeAnswer(q('q2_2_duration'), '3_horas')).toEqual({ status: 'answered', value: '3_horas' });
    expect(encodeAnswer(q('q2_2_duration'), '')).toEqual({ status: 'unknown' });
  });
});

describe('encodeAnswers', () => {
  it('encodes only the asked questions and leaves the crisis onset out', () => {
    const values = new Map<string, FormValue | null>([
      ['crisis_pain_start', '2026-10-18T08:00:00.000Z'],
      ['crisis_intensity', 8],
      ['crisis_aura', ['luces']],
    ]);
    const answers = encodeAnswers(CRISIS_QUESTIONS, values);
    expect(answers).not.toHaveProperty('crisis_pain_start');
    expect(answers.crisis_intensity).toEqual({ status: 'answered', value: 8 });
    expect(answers.crisis_symptoms).toEqual({ status: 'unknown' });
    expect(Object.keys(answers)).toHaveLength(CRISIS_QUESTIONS.length - 1);
  });

  it('omits questions that were not asked', () => {
    const asked = QUESTIONS.filter(question => !question.conditional);
    const answers = encodeAnswers(asked, new Map([['q1_headache', false]]));
    expect(answers).not.toHaveProperty('q2_1_intensity');
    expect(answers.q1_headache).toEqual({ status: 'answered', value: false });
  });
});

describe('encodeVoiceAnswer', () => {
  it('treats the voice flow\'s empty answer as unknown for every type', () => {
    expect(encodeVoiceAnswer('')).toEqual({ status: 'unknown' });
  });

  it('keeps an empty list as a real answer (no aura)', () => {
    expect(encodeVoiceAnswer([])).toEqual({ status: 'answered', value: [] });
  });
});

describe('decodeAnswers', () => {
  it('restores what encodeAnswers stored', () => {
    const values = new Map<string, FormValue | null>([
      ['q1_headache', true],
      ['q2_1_intensity', 6],
      ['q_stress', ''],
      ['q7_triggers', ['otro']],
    ]);
    const textInputs = { q7_triggers: { otro: 'ruido' } };
    const restored = decodeAnswers(QUESTIONS, encodeAnswers(QUESTIONS, values, textInputs));
    expect(restored.values.get('q1_headache')).toBe(true);
    expect(restored.values.get('q2_1_intensity')).toBe(6);
    expect(restored.values.get('q_stress')).toBe('');
    expect(restored.values.get('q7_triggers')).toEqual(['otro']);
    expect(restored.values.has('q4_symptoms')).toBe(false);
    expect(restored.textInputs).toEqual(textInputs);
  });

  it('restores a typed health-centre answer as the typed text', () => {
    const restored = decodeAnswers(CRISIS_QUESTIONS, {
      crisis_healthcare_visit: { status: 'answered', value: 'yes', text: { yes: 'Urgencias' } },
    });
    expect(restored.values.get('crisis_healthcare_visit')).toBe('Urgencias');
  });
});
