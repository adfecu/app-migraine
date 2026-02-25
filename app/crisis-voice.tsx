/**
 * Voice-Only Crisis Mode
 *
 * A near-black screen that walks the user through the crisis questionnaire
 * entirely via voice (TTS) + speech recognition + haptic feedback.
 * The user never needs to look at the screen.
 */
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Text } from '@/components/Themed';
import { AnswerValue, saveCrisisEpisode } from '@/utils/storage';
import {
  abortRecognition,
  delay,
  hapticConfirm,
  hapticSuccess,
  hapticWarning,
  isVoiceAvailable,
  listenForSpeech,
  parseAnswer,
  requestVoicePermissions,
  speak,
  stopSpeaking,
  VOICE_QUESTIONS,
  VoiceQuestion,
} from '@/utils/voiceCrisis';

// ============================================================================
// Constants
// ============================================================================

const MAX_RETRIES = 3;

type FlowState =
  | 'unavailable'   // voice module not available (Expo Go)
  | 'init'          // requesting permissions
  | 'speaking'      // TTS is reading a prompt
  | 'listening'     // waiting for user speech
  | 'processing'    // parsing answer
  | 'done'          // all questions answered, saving
  | 'error';        // something went wrong

// ============================================================================
// Pulsing dot component (subtle listening indicator)
// ============================================================================

function PulsingDot({ active }: { active: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (active) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 1.6,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 1,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 1,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.6,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      scale.setValue(1);
      opacity.setValue(0.3);
    }
  }, [active, scale, opacity]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
}

// ============================================================================
// Main screen
// ============================================================================

export default function CrisisVoiceScreen() {
  const router = useRouter();
  const [flowState, setFlowState] = useState<FlowState>('init');
  const [statusText, setStatusText] = useState('Iniciando modo voz...');
  const abortRef = useRef(false);

  // Run the entire voice flow as an imperative async sequence
  const runFlow = useCallback(async () => {
    // ------------------------------------------------------------------
    // 0. Check if voice is available (requires dev build, not Expo Go)
    // ------------------------------------------------------------------
    if (!isVoiceAvailable()) {
      setFlowState('unavailable');
      setStatusText('');
      return;
    }

    // ------------------------------------------------------------------
    // 1. Request permissions
    // ------------------------------------------------------------------
    setFlowState('init');
    setStatusText('Solicitando permisos...');

    const granted = await requestVoicePermissions();
    if (!granted) {
      setFlowState('error');
      setStatusText('Permisos de micrófono denegados.');
      await speak('No se pudieron obtener permisos de micrófono. Toca la pantalla para salir.');
      return;
    }

    // ------------------------------------------------------------------
    // 2. Opening greeting
    // ------------------------------------------------------------------
    setFlowState('speaking');
    setStatusText('Escucha las preguntas...');
    await speak('Modo crisis por voz. Voy a hacerte unas preguntas. Responde hablando.');
    await delay(400);

    // ------------------------------------------------------------------
    // 3. Walk through every voice question
    // ------------------------------------------------------------------
    const allAnswers: AnswerValue[] = [];
    const allQuestionTexts: string[] = [];

    for (const vq of VOICE_QUESTIONS) {
      if (abortRef.current) return;

      const answer = await processQuestion(vq);
      allAnswers.push(answer);
      allQuestionTexts.push(vq.questionText);
    }

    if (abortRef.current) return;

    // ------------------------------------------------------------------
    // 4. Save & finish
    // ------------------------------------------------------------------
    setFlowState('done');
    setStatusText('Guardando...');

    try {
      await saveCrisisEpisode(allAnswers, allQuestionTexts);
    } catch (e) {
      console.error('Error saving voice crisis:', e);
    }

    await hapticSuccess();
    await speak('Listo, tu registro fue guardado. Descansa.');
    await delay(1500);

    if (!abortRef.current) {
      router.back();
    }
  }, [router]);

  // Process a single VoiceQuestion (may contain multiple sub-prompts)
  async function processQuestion(vq: VoiceQuestion): Promise<AnswerValue> {
    const subAnswers: (string | number | boolean | null)[] = [];

    for (let i = 0; i < vq.prompts.length; i++) {
      if (abortRef.current) break;

      const prompt = vq.prompts[i];

      // Special handling for medication: skip sub-options if top-level answer is "no"
      if (vq.questionId === 'crisis_medication' && i === 1) {
        // Check if first answer was "no"
        if (subAnswers[0] !== true) {
          // Fill remaining sub-answers with false
          for (let j = i; j < vq.prompts.length; j++) {
            subAnswers.push(false);
          }
          break;
        }
      }

      // Speak the prompt
      setFlowState('speaking');
      setStatusText('Escuchando...');
      await speak(prompt.prompt);
      await delay(300);

      // Listen & parse with retries
      let parsed: string | number | boolean | null = null;
      let retries = 0;

      while (parsed === null && retries <= MAX_RETRIES) {
        if (abortRef.current) break;

        setFlowState('listening');

        const transcript = await listenForSpeech(7000);

        if (transcript) {
          setFlowState('processing');
          parsed = parseAnswer(transcript, prompt.answerType);
        }

        if (parsed === null) {
          retries++;
          if (retries <= MAX_RETRIES) {
            await hapticWarning();
            await speak('No entendí, por favor repite.');
            await delay(300);
          } else {
            // Max retries exceeded – skip with default
            await hapticWarning();
            await speak('No pude entender. Continuamos con la siguiente pregunta.');
          }
        }
      }

      subAnswers.push(parsed);

      if (parsed !== null) {
        await hapticConfirm();
      }

      await delay(200);
    }

    return vq.combine(subAnswers);
  }

  // Start the flow once on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      runFlow();
    }, 500);

    return () => {
      clearTimeout(timer);
      abortRef.current = true;
      stopSpeaking();
    };
  }, [runFlow]);

  // Tap anywhere to abort
  const handleAbort = useCallback(() => {
    abortRef.current = true;
    stopSpeaking();
    abortRecognition();
    router.back();
  }, [router]);

  const isListening = flowState === 'listening';

  // Voice module not available (Expo Go) — offer visual crisis flow
  if (flowState === 'unavailable') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.unavailableTitle}>Modo voz no disponible</Text>
          <Text style={styles.unavailableText}>
            El reconocimiento de voz requiere una versión de la app compilada.{'\n\n'}
            Usa el modo visual para registrar tu crisis.
          </Text>
          <Pressable
            onPress={() => router.replace('/crisis')}
            style={({ pressed }) => [
              styles.fallbackButton,
              pressed && styles.fallbackButtonPressed,
            ]}
          >
            <Text style={styles.fallbackButtonText}>Usar modo visual</Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            style={styles.backLink}
          >
            <Text style={styles.hintText}>Volver</Text>
          </Pressable>
        </View>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <Pressable style={styles.container} onPress={handleAbort}>
      <View style={styles.content}>
        <PulsingDot active={isListening} />
        <Text style={styles.statusText}>{statusText}</Text>
        <Text style={styles.hintText}>
          {flowState === 'error'
            ? 'Toca para salir'
            : 'Toca en cualquier lugar para cancelar'}
        </Text>
      </View>
      <StatusBar style="light" />
    </Pressable>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e74c3c',
    marginBottom: 40,
  },
  statusText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.25)',
    fontSize: 12,
    textAlign: 'center',
  },
  unavailableTitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  unavailableText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  fallbackButton: {
    backgroundColor: '#e74c3c',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    marginBottom: 16,
  },
  fallbackButtonPressed: {
    opacity: 0.8,
  },
  fallbackButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backLink: {
    padding: 12,
  },
});
