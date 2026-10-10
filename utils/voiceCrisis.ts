/**
 * Voice Crisis Mode - Audio interaction engine
 *
 * Provides TTS prompts, speech recognition, and answer parsing
 * for a fully voice-driven crisis questionnaire.
 *
 * NOTE: expo-speech-recognition is a native module — use a dev/client build
 * (`expo run:ios` / EAS), not Expo Go. Module access is lazy-loaded via require()
 * so Expo Go doesn't crash when the native binary isn't present.
 */
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import type { Voice } from 'expo-speech';

/** Native speech recognition module type (null when unavailable, e.g. in Expo Go) */
type STTModule = {
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  addListener: (event: string, cb: (e: any) => void) => { remove: () => void };
  start: (opts: Record<string, any>) => void;
  stop: () => void;
  abort: () => void;
  isRecognitionAvailable: () => boolean;
};

/** Lazy accessor for the native speech recognition module. Returns null in Expo Go (no dev build). */
function getSTT(): STTModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-speech-recognition');
    const stt = mod?.ExpoSpeechRecognitionModule ?? mod?.default?.ExpoSpeechRecognitionModule;
    return stt ?? null;
  } catch {
    return null;
  }
}

/** True if speech recognition can be used (requires a dev build and an available recognizer) */
export function isVoiceAvailable(): boolean {
  const stt = getSTT();
  if (!stt) return false;
  try {
    return stt.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/** Errors after which listening again cannot succeed on this device. */
const FATAL_RECOGNITION_ERRORS = ['not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture'];

/** Thrown by listenForSpeech when the recognizer is unavailable, so the flow can fall back to the form. */
export class RecognitionUnavailableError extends Error {}

import { AnswerValue } from '@/utils/storage';
import { CRISIS_QUESTIONS } from '@/app/crisis';

// ============================================================================
// Types
// ============================================================================

/** The kind of spoken answer we expect for a voice prompt */
export type VoiceAnswerType = 'yes_no' | 'number_0_10' | 'time_bucket' | 'keyword_extract';

/** A single voice prompt (one TTS utterance + one STT capture) */
export interface VoicePrompt {
  /** Text to speak aloud */
  prompt: string;
  /** How to parse the spoken answer */
  answerType: VoiceAnswerType;
  /** For checkbox sub-questions: the option value to set if "sí" */
  optionValue?: string;
  /** Override the default STT timeout (ms) for longer open-ended answers */
  listenTimeoutMs?: number;
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
// Keyword maps for open-ended voice extraction
// ============================================================================

type KeywordMap = Record<string, string[]>;

const PAIN_CHAR_KEYWORDS: KeywordMap = {
  pulsatil: ['latidos', 'pulsaciones', 'pulsátil', 'pulsatil', 'late', 'pulsa', 'pum'],
  unilateral: ['un lado', 'un solo lado', 'unilateral'],
  agravamiento_actividad: ['moverme', 'caminar', 'agacharme', 'movimiento', 'empeora', 'actividad'],
};

const AURA_KEYWORDS: KeywordMap = {
  luces: ['luces', 'destellos', 'flashes', 'brillos'],
  lineas: ['líneas', 'lineas'],
  manchas: ['manchas', 'puntos'],
  hormigueo: ['hormigueo', 'cosquilleo', 'adormecimiento'],
};

const SYMPTOM_KEYWORDS: KeywordMap = {
  luz_ruido: ['luz', 'ruido', 'molesta', 'sensible', 'sonido'],
  nauseas: ['náuseas', 'nauseas', 'vomitar', 'asco', 'vómito', 'vomito'],
};

const TRIGGER_KEYWORDS: KeywordMap = {
  estres: ['estrés', 'estres', 'estresado', 'estresada', 'tensión', 'tension'],
  falta_sueno: ['sueño', 'sueno', 'dormir', 'descanso', 'dormí', 'dormi', 'insomnio'],
  clima: ['clima', 'presión', 'presion', 'tiempo', 'lluvia', 'calor', 'frío', 'frio'],
  comida: ['comida', 'alimento', 'bebida', 'café', 'cafe', 'chocolate', 'alcohol', 'vino'],
  menstruacion: ['menstruación', 'menstruacion', 'regla', 'periodo', 'período'],
  pantallas: ['pantallas', 'pantalla', 'computadora', 'celular', 'monitor', 'luz intensa'],
};

const MEDICATION_KEYWORDS: KeywordMap = {
  ibuprofeno: ['ibuprofeno', 'advil', 'motrin'],
  acetaminofen: ['acetaminofén', 'acetaminofen', 'paracetamol', 'tylenol'],
  aspirina: ['aspirina'],
};

/** Stored when a spoken answer is missing or not understood. Never replaced by a guess. */
export const UNKNOWN_ANSWER = '';

const NONE_WORDS = ['no', 'nada', 'ninguno', 'ninguna', 'nop', 'negativo', 'nel'];

function normalizeSpeech(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Classifies a short negative reply using whole words.
 * "no sé" means unknown; "no", "nada", "ninguno" mean none.
 */
export function classifyNegation(transcript: string): 'none' | 'unknown' | null {
  const text = normalizeSpeech(transcript).trim();
  if (!text || text.length >= 20) return null;
  if (/\bno se\b/.test(text)) return 'unknown';
  const words = text.split(/[^a-z]+/).filter(Boolean);
  return words.some(w => NONE_WORDS.includes(w)) ? 'none' : null;
}

/**
 * Combines an open-ended answer for a checkbox question.
 * Silence, "no sé", and unrecognised descriptions are stored as unknown, not as "none".
 */
function combineKeywordAnswer(
  keywordMap: KeywordMap,
  noneValue: AnswerValue,
  toAnswer: (matched: string[]) => AnswerValue = matched => matched,
) {
  return (subs: (string | number | boolean | null)[]): AnswerValue => {
    const transcript = typeof subs[0] === 'string' ? subs[0] : '';
    if (!transcript.trim()) return UNKNOWN_ANSWER;
    const negation = classifyNegation(transcript);
    if (negation === 'none') return noneValue;
    if (negation === 'unknown') return UNKNOWN_ANSWER;
    const matched = parseKeywords(transcript, keywordMap);
    return matched.length > 0 ? toAnswer(matched) : UNKNOWN_ANSWER;
  };
}

function exclusiveOption(options: { value: string; exclusive?: boolean }[] | undefined): AnswerValue {
  const exclusive = (options ?? []).find(o => o.exclusive);
  return exclusive ? [exclusive.value] : [];
}

/** Scan a transcript for known keywords and return matched option values */
export function parseKeywords(text: string, keywordMap: KeywordMap): string[] {
  const lower = normalizeSpeech(text);
  const matched: string[] = [];

  for (const [value, keywords] of Object.entries(keywordMap)) {
    const normalizedKeywords = keywords.map(normalizeSpeech);
    if (normalizedKeywords.some(kw => lower.includes(kw))) {
      matched.push(value);
    }
  }

  return matched;
}

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
    case 'keyword_extract':
      return text;
  }
}

// ============================================================================
// Voice question definitions (derived from CRISIS_QUESTIONS)
// ============================================================================

function buildVoiceQuestions(userSex: 'male' | 'female' | null = null): VoiceQuestion[] {
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
          combine: (subs) => (typeof subs[0] === 'string' ? subs[0] : UNKNOWN_ANSWER),
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
          combine: (subs) => (typeof subs[0] === 'number' ? subs[0] : UNKNOWN_ANSWER),
        };

      // 3. Pain characteristics – open-ended keyword extraction
      case 'crisis_pain_characteristics':
        return {
          questionId: q.id,
          questionText: q.text,
          prompts: [
            {
              prompt:
                'Descríbeme tu dolor. Por ejemplo, si late o pulsa, si está en un solo lado, o si empeora al moverte. O di ninguna.',
              answerType: 'keyword_extract' as VoiceAnswerType,
              listenTimeoutMs: 10000,
            },
          ],
          combine: combineKeywordAnswer(PAIN_CHAR_KEYWORDS, exclusiveOption(q.options)),
        };

      // 4. Aura – open-ended keyword extraction
      case 'crisis_aura':
        return {
          questionId: q.id,
          questionText: q.text,
          prompts: [
            {
              prompt:
                'Antes o durante el dolor, ¿viste luces, líneas, manchas, o sentiste hormigueo? Describe brevemente o di no.',
              answerType: 'keyword_extract' as VoiceAnswerType,
              listenTimeoutMs: 10000,
            },
          ],
          combine: combineKeywordAnswer(AURA_KEYWORDS, []),
        };

      // 5. Symptoms – open-ended keyword extraction
      case 'crisis_symptoms':
        return {
          questionId: q.id,
          questionText: q.text,
          prompts: [
            {
              prompt:
                'Ahora mismo, ¿te molesta la luz o el ruido, o tienes náuseas? Describe o di ninguno.',
              answerType: 'keyword_extract' as VoiceAnswerType,
              listenTimeoutMs: 10000,
            },
          ],
          combine: combineKeywordAnswer(SYMPTOM_KEYWORDS, exclusiveOption(q.options)),
        };

      // 6. Triggers – open-ended keyword extraction
      case 'crisis_triggers': {
        const triggerPrompt = userSex === 'male'
          ? '¿Qué pudo causar esta crisis? Por ejemplo estrés, mal sueño, clima, comida, pantallas, o di no sé.'
          : '¿Qué pudo causar esta crisis? Por ejemplo estrés, mal sueño, clima, comida, menstruación, pantallas, o di no sé.';
        const triggerKeywords = userSex === 'male'
          ? Object.fromEntries(Object.entries(TRIGGER_KEYWORDS).filter(([k]) => k !== 'menstruacion'))
          : TRIGGER_KEYWORDS;
        return {
          questionId: q.id,
          questionText: q.text,
          prompts: [
            {
              prompt: triggerPrompt,
              answerType: 'keyword_extract' as VoiceAnswerType,
              listenTimeoutMs: 10000,
            },
          ],
          combine: combineKeywordAnswer(triggerKeywords, exclusiveOption(q.options)),
        };
      }

      // 7. Medication – open-ended keyword extraction
      case 'crisis_medication':
        return {
          questionId: q.id,
          questionText: q.text,
          prompts: [
            {
              prompt:
                '¿Tomaste alguna medicación? Di el nombre, por ejemplo ibuprofeno, acetaminofén, aspirina, o di no.',
              answerType: 'keyword_extract' as VoiceAnswerType,
              listenTimeoutMs: 10000,
            },
          ],
          combine: (subs) => {
            const answer = combineKeywordAnswer(MEDICATION_KEYWORDS, ['no'], matched => ['si', ...matched])(subs);
            // An unrecognised medication is still a medication: record "sí" without a name.
            const transcript = typeof subs[0] === 'string' ? subs[0] : '';
            if (answer === UNKNOWN_ANSWER && parseYesNo(transcript) === true) return ['si'];
            return answer;
          },
        };

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
          combine: (subs) => (subs[0] === true ? 'yes' : subs[0] === false ? 'no' : UNKNOWN_ANSWER),
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
          combine: (subs) => (subs[0] === true ? 'yes' : subs[0] === false ? 'no' : UNKNOWN_ANSWER),
        };
    }
  });
}

export function getVoiceQuestions(userSex: 'male' | 'female' | null = null): VoiceQuestion[] {
  return buildVoiceQuestions(userSex);
}

// ============================================================================
// TTS helpers
// ============================================================================

/** Prefer male Spanish voices (labels differ by OS / engine). */
function scoreMaleSpanishVoice(v: Voice): number {
  const blob = `${v.name} ${v.identifier}`.toLowerCase();
  let score = 0;
  if (
    /\b(male|masculino|hombre|m\.)\b|google.*male|samsung.*male|tts.*male|-male-|_male/i.test(blob)
  ) {
    score += 60;
  }
  if (
    /\bjorge\b|\bdiego\b|\bcarlos\b|\bantonio\b|\bpablo\b|\bmanuel\b|\bjavier\b|\bdaniel\b|\balberto\b|\bpedro\b|\bmartín\b|\bmartin\b|\bluis\b|\braúl\b|\braul\b|\bfernando\b|\benrique\b|\bricardo\b|\bvicente\b|\bandrés\b|\bandres\b|\bjuan\b|\bsergio\b|\broberto\b/i.test(
      blob
    )
  ) {
    score += 40;
  }
  if (
    /\bfemale\b|\bfemenina\b|\bmujer\b|\bpaulina\b|\bmónica\b|\bmonica\b|\bhelena\b|\blaura\b|\bsofía\b|\bsofia\b/gi.test(blob)
  ) {
    score -= 100;
  }
  const lang = v.language.replace('_', '-').toLowerCase();
  if (lang === 'es-mx' || lang.startsWith('es-mx')) score += 8;
  else if (lang === 'es-419' || lang.startsWith('es-419')) score += 5;
  else if (lang === 'es-es' || lang.startsWith('es-es')) score += 3;
  else if (/^es(-|$)/.test(lang)) score += 1;
  return score;
}

function pickMaleSpanishVoice(voices: Voice[]): Voice | undefined {
  const spanish = voices.filter(v => /^es[-_]?/i.test(v.language.trim()));
  if (spanish.length === 0) return undefined;

  const ranked = [...spanish].sort((a, b) => scoreMaleSpanishVoice(b) - scoreMaleSpanishVoice(a));
  const best = ranked[0];
  if (scoreMaleSpanishVoice(best) > 0) return best;

  const mx = spanish.filter(v => /^es[-_]MX$/i.test(v.language.replace('_', '-')));
  const pool = mx.length > 0 ? mx : spanish;
  const notFemale = pool.filter(v => scoreMaleSpanishVoice(v) >= -50);
  return notFemale[0] ?? pool[0];
}

let maleSpanishVoiceIdPromise: Promise<string | undefined> | null = null;

async function getMaleSpanishVoiceIdentifier(): Promise<string | undefined> {
  if (!maleSpanishVoiceIdPromise) {
    maleSpanishVoiceIdPromise = (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        return pickMaleSpanishVoice(voices)?.identifier;
      } catch {
        return undefined;
      }
    })();
  }
  return maleSpanishVoiceIdPromise;
}

/** Speak a text string and return a Promise that resolves when done (male Spanish voice when available). */
export async function speak(text: string): Promise<void> {
  const voice = await getMaleSpanishVoiceIdentifier();
  return new Promise((resolve, reject) => {
    Speech.speak(text, {
      language: 'es-MX',
      ...(voice ? { voice } : {}),
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
    if (!stt) return false;
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
 * Rejects with RecognitionUnavailableError when the recognizer cannot be used.
 */
export function listenForSpeech(timeoutMs: number = 7000): Promise<string | null> {
  const stt = getSTT();
  if (!stt) return Promise.reject(new RecognitionUnavailableError('Speech recognition module missing'));

  return new Promise((resolve, reject) => {
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

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
      if (FATAL_RECOGNITION_ERRORS.includes(event.error)) {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(new RecognitionUnavailableError(event.error));
        return;
      }
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
    getSTT()?.abort();
  } catch { /* ignore – module may not be available */ }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
