/**
 * Converts form state to the stored answer format and back
 * (docs/step5-data-model-design.md, "Answers").
 *
 * Stored answers are keyed by question ID. Each is answered (with a value and
 * optional free text per option), skipped ("Prefiero no responder"), or unknown
 * (asked but not answered or not understood). Questions that were not asked
 * have no key.
 */

/** A form answer as held by the screens. */
export type FormValue = string | number | boolean | string[];

export type AnswerEntry =
  | { status: 'answered'; value: FormValue; text?: Record<string, string> }
  | { status: 'skipped' }
  | { status: 'unknown' };

export type Answers = Record<string, AnswerEntry>;

export type FormQuestionType =
  | 'yesno'
  | 'slider'
  | 'slider_labeled'
  | 'multiple_choice'
  | 'checkbox'
  | 'yesno_with_text'
  | 'time_picker'
  | 'checkbox_nested'
  | 'datetime_picker';

interface FormOption {
  value: string;
  hasTextInput?: boolean;
  subOptions?: FormOption[];
}

export interface FormQuestion {
  id: string;
  type: FormQuestionType;
  options?: FormOption[];
}

/** Free text per question ID, then per option value. */
export type TextInputs = Record<string, Record<string, string>>;

/** The database accepts up to 500 characters per free-text answer. */
export const MAX_TEXT_LENGTH = 500;

function textOptionValues(question: FormQuestion): Set<string> {
  const values = new Set<string>();
  for (const option of question.options ?? []) {
    if (option.hasTextInput) values.add(option.value);
    for (const sub of option.subOptions ?? []) {
      if (sub.hasTextInput) values.add(sub.value);
    }
  }
  return values;
}

function cleanText(text: string | undefined): string | null {
  const trimmed = (text ?? '').trim();
  return trimmed ? trimmed.slice(0, MAX_TEXT_LENGTH) : null;
}

/**
 * Encodes one manual-form answer. In the manual forms an empty slider value
 * means the user chose "Prefiero no responder"; anything else left empty was
 * not answered.
 */
export function encodeAnswer(
  question: FormQuestion,
  value: FormValue | null | undefined,
  texts: Record<string, string> = {},
): AnswerEntry {
  if (value === null || value === undefined) return { status: 'unknown' };

  switch (question.type) {
    case 'slider':
    case 'slider_labeled':
      if (value === '') return { status: 'skipped' };
      return typeof value === 'number' ? { status: 'answered', value } : { status: 'unknown' };

    case 'yesno':
      return typeof value === 'boolean' ? { status: 'answered', value } : { status: 'unknown' };

    case 'yesno_with_text': {
      // The form stores 'no', 'yes', or the typed answer to "¿Cuál?" after a yes.
      if (value === 'no' || value === 'yes') return { status: 'answered', value };
      const text = typeof value === 'string' ? cleanText(value) : null;
      return text ? { status: 'answered', value: 'yes', text: { yes: text } } : { status: 'unknown' };
    }

    case 'checkbox':
    case 'checkbox_nested': {
      if (!Array.isArray(value) || value.length === 0) return { status: 'unknown' };
      const allowed = textOptionValues(question);
      const text: Record<string, string> = {};
      for (const option of value) {
        const cleaned = allowed.has(option) ? cleanText(texts[option]) : null;
        if (cleaned) text[option] = cleaned;
      }
      return Object.keys(text).length > 0
        ? { status: 'answered', value, text }
        : { status: 'answered', value };
    }

    default:
      return value === '' ? { status: 'unknown' } : { status: 'answered', value };
  }
}

/**
 * Encodes the asked questions of a manual form. The crisis onset
 * (datetime_picker) is stored on the episode itself, not as an answer.
 */
export function encodeAnswers(
  questions: FormQuestion[],
  values: Map<string, FormValue | null>,
  textInputs: TextInputs = {},
): Answers {
  const answers: Answers = {};
  for (const question of questions) {
    if (question.type === 'datetime_picker') continue;
    answers[question.id] = encodeAnswer(question, values.get(question.id), textInputs[question.id]);
  }
  return answers;
}

/**
 * Encodes one voice answer. The voice flow returns '' when it could not get an
 * answer, for every question type. An empty list is a real answer (no aura).
 */
export function encodeVoiceAnswer(value: FormValue): AnswerEntry {
  if (value === '') return { status: 'unknown' };
  return { status: 'answered', value };
}

/**
 * Restores form state from stored answers, for editing. Unknown answers are
 * left out so the form shows its default; skipped sliders come back as ''.
 */
export function decodeAnswers(
  questions: FormQuestion[],
  answers: Answers,
): { values: Map<string, FormValue>; textInputs: TextInputs } {
  const values = new Map<string, FormValue>();
  const textInputs: TextInputs = {};
  for (const question of questions) {
    const entry = answers[question.id];
    if (!entry || entry.status === 'unknown') continue;
    if (entry.status === 'skipped') {
      values.set(question.id, '');
      continue;
    }
    if (question.type === 'yesno_with_text' && entry.value === 'yes' && entry.text?.yes) {
      values.set(question.id, entry.text.yes);
      continue;
    }
    values.set(question.id, entry.value);
    if (entry.text) textInputs[question.id] = { ...entry.text };
  }
  return { values, textInputs };
}
