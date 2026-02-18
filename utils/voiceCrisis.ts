/**
 * Voice Crisis Mode - Audio interaction engine
 *
 * Provides TTS prompts, speech recognition, and answer parsing
 * for a fully voice-driven crisis questionnaire.
 *
 * NOTE: expo-speech-recognition requires a dev build (native module).
 * All access is lazy-loaded so the module doesn't crash in Expo Go
 * when expo-router eagerly evaluates route files.
 */
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

/** Lazy accessor for the native speech recognition module */
function getSTT() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
  return ExpoSpeechRecognitionModule as {
    requestPermissionsAsync: () => Promise<{ granted: boolean }>;
    addListener: (event: string, cb: (e: any) => void) => { remove: () => void };
    start: (opts: Record<string, any>) => void;
    stop: () => void;
    abort: () => void;
  };
}

import { AnswerValue } from '@/utils/storage';
import { CRISIS_QUESTIONS } from '@/app/crisis';

// ============================================================================
// Types
// ============================================================================

/** The kind of spoken answer we expect for a voice prompt */
export type VoiceAnswerType = 'yes_no' | 'number_0_10' | 'time_bucket';

/** A single voice prompt (one TTS utterance + one STT capture) */
export interface VoicePrompt {
  /** Text to speak aloud */
  prompt: string;
  /** How to parse the spoken answer */
  answerType: VoiceAnswerType;
  /** For checkbox sub-questions: the option value to set if "sí" */
  optionValue?: string;
}

/** A group of voice prompts that map to one original CRISIS_QUESTIONS entry */
export interface VoiceQuestion {
  /** Matches the id from CRISIS_QUESTIONS */
  questionId: string;
  /** Original question text (stored alongside answers) */
  questionText: string;
  /** Ordered list of prompts to speak for this question */
  prompts: VoicePrompt[];
  /**
   * How to combine the sub-prompt answers into a single AnswerValue.
   * Called after all prompts in this group have been answered.
   */
  combine: (subAnswers: (string | number | boolean | null)[]) => AnswerValue;
}

// ============================================================================
// Spanish number / keyword maps
// ============================================================================

const SPANISH_NUMBERS: Record<string, number> = {
  cero: 0,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};

const YES_WORDS = ['sí', 'si', 'yes', 'claro', 'correcto', 'afirmativo', 'aja'];
const NO_WORDS = ['no', 'nop', 'negativo', 'nel', 'nada'];

/** Time bucket labels spoken to the user, mapped to approximate hours-ago offset */
const TIME_BUCKETS: { keywords: string[]; hoursAgo: number }[] = [
  { keywords: ['menos de una hora', 'menos de 1', 'hace poco', 'recién', 'ahora'], hoursAgo: 0.5 },
  { keywords: ['entre una y tres', 'una a tres', 'entre 1 y 3', 'hace una hora', 'hace dos horas', 'hace 2', 'hace 1'], hoursAgo: 2 },
  { keywords: ['entre tres y seis', 'tres a seis', 'entre 3 y 6', 'hace tres', 'hace cuatro', 'hace cinco', 'hace 3', 'hace 4', 'hace 5'], hoursAgo: 4.5 },
  { keywords: ['más de seis', 'más de 6', 'muchas horas', 'hace mucho'], hoursAgo: 8 },
];

// ============================================================================
// Parsing helpers
// ============================================================================

export function parseYesNo(text: string): boolean | null {
  const lower = text.toLowerCase().trim();
  if (YES_WORDS.some(w => lower.includes(w))) return true;
  if (NO_WORDS.some(w => lower.includes(w))) return false;
  return null;
}

export function parseNumber0to10(text: string): number | null {
  const lower = text.toLowerCase().trim();

  // Try word match first
  for (const [word, num] of Object.entries(SPANISH_NUMBERS)) {
    if (lower.includes(word)) return num;
  }

  // Try digit extraction
  const digitMatch = lower.match(/\b(\d{1,2})\b/);
  if (digitMatch) {
    const n = parseInt(digitMatch[1], 10);
    if (n >= 0 && n <= 10) return n;
  }

  return null;
}

export function parseTimeBucket(text: string): string | null {
  const lower = text.toLowerCase().trim();

  for (const bucket of TIME_BUCKETS) {
    if (bucket.keywords.some(kw => lower.includes(kw))) {
      // Return ISO string offset from now
      const d = new Date();
      d.setMinutes(d.getMinutes() - Math.round(bucket.hoursAgo * 60));
      return d.toISOString();
    }
  }

  return null;
}

export function parseAnswer(text: string, type: VoiceAnswerType): string | number | boolean | null {
  switch (type) {
    case 'yes_no':
      return parseYesNo(text);
    case 'number_0_10':
      return parseNumber0to10(text);
    case 'time_bucket':
      return parseTimeBucket(text);
  }
}

// ============================================================================
// Voice question definitions (derived from CRISIS_QUESTIONS)
// ============================================================================

function buildVoiceQuestions(): VoiceQuestion[] {
  return CRISIS_QUESTIONS.map((q) => {
    switch (q.id) {
      // 1. Pain start – converted to time bucket
      case 'crisis_pain_start':
        return {
          questionId: q.id,
          questionText: q.text,
          prompts: [
            {
              prompt:
                '¿Cuándo comenzó el dolor? Di: hace menos de una hora, entre una y tres horas, entre tres y seis horas, o hace más de seis horas.',
              answerType: 'time_bucket' as VoiceAnswerType,
            },
          ],
          combine: (subs) => (subs[0] as string) ?? new Date().toISOString(),
        };

      // 2. Intensity – number 0-10
      case 'crisis_intensity':
        return {
          questionId: q.id,
          questionText: q.text,
          prompts: [
            {
              prompt: 'Del cero al diez, ¿qué tan intenso es el dolor? Di un número.',
              answerType: 'number_0_10' as VoiceAnswerType,
            },
          ],
          combine: (subs) => (typeof subs[0] === 'number' ? subs[0] : 5),
        };

      // 3-6. Checkbox questions – each option becomes a yes/no prompt
      case 'crisis_pain_characteristics':
      case 'crisis_aura':
      case 'crisis_symptoms':
      case 'crisis_triggers': {
        const options = (q.options ?? []).filter(
          (o) => !o.hasTextInput && !o.exclusive
        );
        const prompts: VoicePrompt[] = options.map((o) => ({
          prompt: `¿${o.label}?`,
          answerType: 'yes_no' as VoiceAnswerType,
          optionValue: o.value,
        }));
        return {
          questionId: q.id,
          questionText: q.text,
          prompts,
          combine: (subs) => {
            const selected: string[] = [];
            subs.forEach((ans, i) => {
              if (ans === true && options[i]) {
                selected.push(options[i].value);
              }
            });
            // If nothing selected, mark with the exclusive option if available
            if (selected.length === 0) {
              const exclusive = (q.options ?? []).find((o) => o.exclusive);
              if (exclusive) selected.push(exclusive.value);
            }
            return selected;
          },
        };
      }

      // 7. Medication – nested checkbox
      case 'crisis_medication': {
        const parentYes = (q.options ?? []).find((o) => o.subOptions);
        const subOptions = (parentYes?.subOptions ?? []).filter(
          (o) => !o.hasTextInput
        );

        // First prompt: did you take medication?
        const prompts: VoicePrompt[] = [
          {
            prompt: '¿Has tomado alguna medicación para este dolor?',
            answerType: 'yes_no' as VoiceAnswerType,
          },
        ];
        // Sub-options only asked if yes (handled in the flow controller)
        subOptions.forEach((o) => {
          prompts.push({
            prompt: `¿${o.label}?`,
            answerType: 'yes_no' as VoiceAnswerType,
            optionValue: o.value,
          });
        });

        return {
          questionId: q.id,
          questionText: q.text,
          prompts,
          combine: (subs) => {
            const tookMedication = subs[0] === true;
            if (!tookMedication) return ['no'];

            const selected: string[] = ['si'];
            subs.slice(1).forEach((ans, i) => {
              if (ans === true && subOptions[i]) {
                selected.push(subOptions[i].value);
              }
            });
            return selected;
          },
        };
      }

      // 8. Healthcare visit – yes/no
      case 'crisis_healthcare_visit':
        return {
          questionId: q.id,
          questionText: q.text,
          prompts: [
            {
              prompt: '¿Ha acudido a algún centro de salud?',
              answerType: 'yes_no' as VoiceAnswerType,
            },
          ],
          combine: (subs) => (subs[0] === true ? 'yes' : 'no'),
        };

      // Fallback for any unexpected question
      default:
        return {
          questionId: q.id,
          questionText: q.text,
          prompts: [
            {
              prompt: q.text,
              answerType: 'yes_no' as VoiceAnswerType,
            },
          ],
          combine: (subs) => (subs[0] === true ? 'yes' : 'no'),
        };
    }
  });
}

export const VOICE_QUESTIONS: VoiceQuestion[] = buildVoiceQuestions();

// ============================================================================
// TTS helpers
// ============================================================================

/** Speak a text string and return a Promise that resolves when done */
export function speak(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Speech.speak(text, {
      language: 'es-MX',
      rate: 0.92,
      onDone: resolve,
      onError: (err) => reject(err),
    });
  });
}

export function stopSpeaking(): void {
  Speech.stop();
}

// ============================================================================
// Speech recognition helpers
// ============================================================================

/** Request microphone + speech recognition permissions. Returns true if granted. */
export async function requestVoicePermissions(): Promise<boolean> {
  try {
    const stt = getSTT();
    const result = await stt.requestPermissionsAsync();
    return result.granted;
  } catch (e) {
    console.error('Voice permission error:', e);
    return false;
  }
}

/**
 * Listen for speech and return the final transcript.
 * Resolves with the best transcript string, or null on timeout / no speech.
 */
export function listenForSpeech(timeoutMs: number = 7000): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stt = getSTT();

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      resultSub.remove();
      errorSub.remove();
      endSub.remove();
    };

    const finish = (value: string | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(value);
    };

    const resultSub = stt.addListener('result', (event: any) => {
      if (event.isFinal && event.results && event.results.length > 0) {
        const transcript = event.results[0]?.transcript ?? null;
        finish(transcript);
      }
    });

    const errorSub = stt.addListener('error', (event: any) => {
      console.warn('Speech recognition error:', event.error, event.message);
      finish(null);
    });

    const endSub = stt.addListener('end', () => {
      // If we haven't received a final result yet, resolve null
      finish(null);
    });

    // Start listening
    stt.start({
      lang: 'es-MX',
      interimResults: false,
      continuous: false,
      addsPunctuation: false,
    });

    // Safety timeout
    timer = setTimeout(() => {
      try {
        stt.stop();
      } catch { /* ignore */ }
      finish(null);
    }, timeoutMs);
  });
}

// ============================================================================
// Haptic patterns
// ============================================================================

export async function hapticConfirm(): Promise<void> {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export async function hapticSuccess(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export async function hapticWarning(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

// ============================================================================
// Utility
// ============================================================================

/** Abort any active speech recognition session */
export function abortRecognition(): void {
  try {
    getSTT().abort();
  } catch { /* ignore – module may not be available */ }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
