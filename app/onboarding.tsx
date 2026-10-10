import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  requestNotificationPermissions,
  scheduleDailyCheckinNotification,
} from '@/utils/notifications';
import { saveUserProfile } from '@/utils/supabaseStorage';
import { requestVoicePermissions } from '@/utils/voiceCrisis';

// ─── constants ───────────────────────────────────────────────────────────────

export const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';
export const NOTIFICATION_HOUR_KEY = 'notification_hour';

const PRESET_HOURS = [7, 8, 9, 10, 12, 18, 20];

// Step indices
const STEP_WELCOME = 0;
const STEP_PROFILE = 1;
const STEP_SLIDE_CHECKINS = 2;
const STEP_SLIDE_RIESGO = 3;
const STEP_SLIDE_CRISIS = 4;
const STEP_NOTIF_TIME = 5;
const STEP_PERM_NOTIF = 6;
const STEP_PERM_MIC = 7;
const STEP_FIRST_CHECKIN = 8;

const TOTAL_STEPS = 9;

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatHour(h: number) {
  const suffix = h < 12 ? 'AM' : 'PM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${suffix}`;
}

// ─── sub-components ──────────────────────────────────────────────────────────

function ProgressDots({ current, total, tint, colorScheme }: { current: number; total: number; tint: string; colorScheme: 'light' | 'dark' | null | undefined }) {
  const inactiveColor = colorScheme === 'dark' ? '#555' : '#999';
  return (
    <View style={dots.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            dots.dot,
            i === current
              ? [dots.active, { backgroundColor: tint }]
              : { backgroundColor: inactiveColor },
          ]}
        />
      ))}
    </View>
  );
}

const dots = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 40,
    backgroundColor: 'transparent',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  active: {
    width: 24,
  },
});

// ─── main component ──────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme ?? 'light'].tint;

  const [currentStep, setCurrentStep] = useState(STEP_WELCOME);
  const [selectedHour, setSelectedHour] = useState(8);
  const [notifGranted, setNotifGranted] = useState(false);

  // Profile step state
  const [profileName, setProfileName] = useState('');
  const [profileSex, setProfileSex] = useState<'male' | 'female' | null>(null);
  const [profileAge, setProfileAge] = useState('');
  const [profileError, setProfileError] = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const goToStep = (next: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setCurrentStep(next);
  };

  const next = () => goToStep(currentStep + 1);

  const handleProfileNext = () => {
    setProfileError('');
    if (!profileName.trim()) {
      setProfileError('Por favor ingresa tu nombre');
      return;
    }
    if (!profileSex) {
      setProfileError('Por favor selecciona tu sexo');
      return;
    }
    const ageNum = parseInt(profileAge, 10);
    if (!profileAge || isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      setProfileError('Por favor ingresa una edad válida (1–120)');
      return;
    }
    next();
  };

  // Called from both "Sí" and "Más tarde" on the final step
  const finish = async (openCheckin: boolean) => {
    await saveUserProfile(profileName.trim(), profileSex!, parseInt(profileAge, 10));
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    await AsyncStorage.setItem(NOTIFICATION_HOUR_KEY, String(selectedHour));

    if (notifGranted) {
      await scheduleDailyCheckinNotification(selectedHour, 0);
    }

    if (openCheckin) {
      router.replace('/(tabs)');
      // Small delay so the tab navigator mounts before we push a modal
      setTimeout(() => router.push('/checkin'), 50);
    } else {
      router.replace('/(tabs)');
    }
  };

  const handlePermitNotif = async () => {
    const status = await requestNotificationPermissions();
    setNotifGranted(status.status === 'granted');
    next();
  };

  const handlePermitMic = async () => {
    await requestVoicePermissions();
    next();
  };

  // ── render helpers ──────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (currentStep) {
      // ── Step 0: Welcome ──────────────────────────────────────────────────────
      case STEP_WELCOME:
        return (
          <SlideShell>
            <Text style={s.icon}>👋</Text>
            <Text style={s.title}>Bienvenido a{'\n'}MigraineTrack</Text>
            <Text style={s.body}>
              Esta app te ayuda a registrar tus síntomas, anticipar episodios y gestionar
              tus migrañas con datos personalizados.
            </Text>
            <PrimaryButton label="Empezar" onPress={next} tint={tint} />
          </SlideShell>
        );

      // ── Step 1: Profile ──────────────────────────────────────────────────────
      case STEP_PROFILE:
        return (
          <SlideShell>
            <Text style={s.icon}>👤</Text>
            <Text style={s.title}>Cuéntanos sobre ti</Text>
            <TextInput
              style={[
                s.input,
                {
                  backgroundColor: colorScheme === 'dark' ? '#333' : '#f5f5f5',
                  color: colorScheme === 'dark' ? '#fff' : '#000',
                },
              ]}
              placeholder="Nombre"
              placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
              autoCapitalize="words"
              value={profileName}
              onChangeText={setProfileName}
            />
            <Text style={s.fieldLabel}>Sexo</Text>
            <View style={s.chipRow}>
              {(['male', 'female'] as const).map((val) => (
                <Pressable
                  key={val}
                  style={[
                    s.chip,
                    profileSex === val && { backgroundColor: tint },
                  ]}
                  onPress={() => setProfileSex(val)}
                >
                  <Text
                    style={[
                      s.chipText,
                      profileSex === val && {
                        color: colorScheme === 'dark' ? '#000' : '#fff',
                        opacity: 1,
                      },
                    ]}
                  >
                    {val === 'male' ? 'Hombre' : 'Mujer'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[
                s.input,
                {
                  backgroundColor: colorScheme === 'dark' ? '#333' : '#f5f5f5',
                  color: colorScheme === 'dark' ? '#fff' : '#000',
                },
              ]}
              placeholder="Edad"
              placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
              keyboardType="number-pad"
              value={profileAge}
              onChangeText={setProfileAge}
              maxLength={3}
            />
            {profileError ? (
              <Text style={s.errorText}>{profileError}</Text>
            ) : null}
            <PrimaryButton label="Continuar" onPress={handleProfileNext} tint={tint} />
          </SlideShell>
        );

      // ── Step 2: Check-ins ────────────────────────────────────────────────────
      case STEP_SLIDE_CHECKINS:
        return (
          <SlideShell>
            <Text style={s.icon}>📋</Text>
            <Text style={s.title}>Check-ins diarios</Text>
            <Text style={s.body}>
              Cada día registras cómo te sientes. El check-in toma menos de 2 minutos y
              te pregunta sobre dolor, síntomas y medicación.
            </Text>
            <PrimaryButton label="Siguiente" onPress={next} tint={tint} />
          </SlideShell>
        );

      // ── Step 3: Resumen e informe ──────────────────────────────────────────────────
      case STEP_SLIDE_RIESGO:
        return (
          <SlideShell>
            <Text style={s.icon}>📊</Text>
            <Text style={s.title}>Resumen e informe</Text>
            <Text style={s.body}>
              La app resume los síntomas que registras y prepara un informe para compartir
              con tu médico.
              {'\n\n'}
              No es un diagnóstico y no predice cuándo tendrás dolor de cabeza.
            </Text>
            <PrimaryButton label="Siguiente" onPress={next} tint={tint} />
          </SlideShell>
        );

      // ── Step 3: Crisis & voz ─────────────────────────────────────────────────
      case STEP_SLIDE_CRISIS:
        return (
          <SlideShell>
            <Text style={s.icon}>🎙️</Text>
            <Text style={s.title}>Crisis y modo voz</Text>
            <Text style={s.body}>
              Durante una crisis puedes registrar sin mirar la pantalla usando solo tu
              voz. La app te hace las preguntas en voz alta y tú respondes hablando.
            </Text>
            <PrimaryButton label="Siguiente" onPress={next} tint={tint} />
          </SlideShell>
        );

      // ── Step 4: Notification time ────────────────────────────────────────────
      case STEP_NOTIF_TIME:
        return (
          <SlideShell>
            <Text style={s.icon}>⏰</Text>
            <Text style={s.title}>¿A qué hora prefieres tu recordatorio?</Text>
            <Text style={s.body}>
              Te enviaremos una notificación diaria para que no olvides tu check-in.
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipRow}
            >
              {PRESET_HOURS.map((h) => (
                <Pressable
                  key={h}
                  style={[
                    s.chip,
                    selectedHour === h && { backgroundColor: tint },
                  ]}
                  onPress={() => setSelectedHour(h)}
                >
                  <Text
                    style={[
                      s.chipText,
                      selectedHour === h && { color: colorScheme === 'dark' ? '#000' : '#fff', opacity: 1 },
                    ]}
                  >
                    {formatHour(h)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <PrimaryButton label="Continuar" onPress={next} tint={tint} />
          </SlideShell>
        );

      // ── Step 5a: Notifications permission ───────────────────────────────────
      case STEP_PERM_NOTIF:
        return (
          <SlideShell>
            <Text style={s.icon}>🔔</Text>
            <Text style={s.title}>Permitir notificaciones</Text>
            <Text style={s.body}>
              Para recordarte tu check-in diario a las {formatHour(selectedHour)}.
              {'\n\n'}
              Puedes cambiar esto en cualquier momento desde la configuración del sistema.
            </Text>
            <PrimaryButton label="Permitir" onPress={handlePermitNotif} tint={tint} />
            <GhostButton label="Ahora no" onPress={next} />
          </SlideShell>
        );

      // ── Step 5b: Microphone permission ──────────────────────────────────────
      case STEP_PERM_MIC:
        return (
          <SlideShell>
            <Text style={s.icon}>🎤</Text>
            <Text style={s.title}>Permitir micrófono</Text>
            <Text style={s.body}>
              Para registrar crisis por voz sin mirar la pantalla. El micrófono solo se
              usa cuando tú inicias el modo voz — nunca en segundo plano.
            </Text>
            <PrimaryButton label="Permitir" onPress={handlePermitMic} tint={tint} />
            <GhostButton label="Ahora no" onPress={next} />
          </SlideShell>
        );

      // ── Step 6: First check-in ───────────────────────────────────────────────
      case STEP_FIRST_CHECKIN:
        return (
          <SlideShell>
            <Text style={s.icon}>✅</Text>
            <Text style={s.title}>¡Todo listo!</Text>
            <Text style={s.body}>
              Ya estás configurado. ¿Quieres hacer tu primer check-in ahora?
            </Text>
            <PrimaryButton
              label="Sí, hacer check-in"
              onPress={() => finish(true)}
              tint={tint}
            />
            <GhostButton label="Más tarde" onPress={() => finish(false)} />
          </SlideShell>
        );

      default:
        return null;
    }
  };

  return (
    <View style={s.screen}>
      <ProgressDots current={currentStep} total={TOTAL_STEPS} tint={tint} colorScheme={colorScheme} />
      <Animated.View style={[s.content, { opacity: fadeAnim }]}>
        {renderStep()}
      </Animated.View>
    </View>
  );
}

// ─── small reusable components ────────────────────────────────────────────────

function SlideShell({ children }: { children: React.ReactNode }) {
  return <View style={s.slide}>{children}</View>;
}

function PrimaryButton({
  label,
  onPress,
  tint,
}: {
  label: string;
  onPress: () => void;
  tint: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.btn, { backgroundColor: tint }, pressed && s.btnPressed]}
      onPress={onPress}
    >
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [s.ghost, pressed && s.btnPressed]} onPress={onPress}>
      <Text style={s.ghostText}>{label}</Text>
    </Pressable>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 60,
  },
  content: {
    flex: 1,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 64,
    marginBottom: 24,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 36,
  },
  body: {
    fontSize: 16,
    opacity: 0.75,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  input: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  fieldLabel: {
    alignSelf: 'flex-start',
    fontSize: 14,
    opacity: 0.65,
    marginBottom: 8,
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 4,
    marginBottom: 32,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C7C7CC',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.8,
  },
  btn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  btnPressed: {
    opacity: 0.8,
  },
  btnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  ghost: {
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
  },
  ghostText: {
    fontSize: 15,
    opacity: 0.65,
  },
});
