import FontAwesome from '@expo/vector-icons/FontAwesome';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useGuardedSave } from '@/components/useGuardedSave';
import Colors from '@/constants/Colors';
import { endEpisode, EpisodeRecord, getEpisode, getOngoingEpisode, RecordError } from '@/utils/records';

function formatDateTime(date: Date): string {
  return date.toLocaleString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Records when an ongoing crisis ended. Opened from the dashboard, after a
 * no-headache check-in, or when a new crisis is started while one is ongoing.
 */
export default function EndEpisodeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme ?? 'light'].tint;
  const textColor = Colors[colorScheme ?? 'light'].text;
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [episode, setEpisode] = useState<EpisodeRecord | null>(null);
  const [endedAt, setEndedAt] = useState(() => new Date());
  const { saving, save } = useGuardedSave();

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      setEpisode(id ? await getEpisode(id) : await getOngoingEpisode());
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onsetAt = episode?.onset_at ? new Date(episode.onset_at) : null;
  const earliest = onsetAt ?? (episode ? new Date(episode.recorded_at) : undefined);

  const pickOnAndroid = () => {
    DateTimePickerAndroid.open({
      value: endedAt,
      mode: 'date',
      minimumDate: earliest,
      maximumDate: new Date(),
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onChange: (timeEvent, time) => {
            if (timeEvent.type !== 'set' || !time) return;
            const picked = new Date(date);
            picked.setHours(time.getHours(), time.getMinutes(), 0, 0);
            setEndedAt(picked);
          },
        });
      },
    });
  };

  const handleSave = async () => {
    if (!episode || saving) return;
    const now = new Date();
    if (endedAt > now) {
      Alert.alert('Hora no válida', 'La hora de fin no puede estar en el futuro.');
      return;
    }
    if (earliest && endedAt < earliest) {
      Alert.alert('Hora no válida', 'La crisis no puede terminar antes de haber empezado.');
      return;
    }
    const ok = await save(
      async () => {
        await endEpisode(episode.id, endedAt.toISOString());
      },
      (error) => {
        if (!(error instanceof RecordError)) return false;
        if (error.code === 'episode_already_ended' || error.code === 'not_found') {
          Alert.alert('Crisis ya cerrada', 'Esta crisis ya no está en curso.', [
            { text: 'OK', onPress: () => router.back() },
          ]);
          return true;
        }
        if (error.code === 'invalid_end_time') {
          Alert.alert('Hora no válida', 'Revisa la hora de fin: no puede ser anterior al inicio ni futura.');
          return true;
        }
        return false;
      },
    );
    if (ok) router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Volver">
          {({ pressed }) => (
            <FontAwesome name="arrow-left" size={24} color={textColor} style={{ opacity: pressed ? 0.5 : 1 }} />
          )}
        </Pressable>
      </View>

      {loadState === 'loading' && <ActivityIndicator style={styles.centered} />}

      {loadState === 'error' && (
        <View style={styles.centered}>
          <Text style={styles.message}>No se pudo cargar la crisis. Revisa tu conexión.</Text>
          <Pressable onPress={load} style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Text style={[styles.action, { color: tint }]}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      {loadState === 'ready' && (!episode || episode.ended_at) && (
        <View style={styles.centered}>
          <Text style={styles.message}>No tienes una crisis en curso.</Text>
        </View>
      )}

      {loadState === 'ready' && episode && !episode.ended_at && (
        <View style={styles.content}>
          <Text style={styles.title}>¿Cuándo terminó la crisis?</Text>
          <Text style={styles.subtitle}>
            {onsetAt
              ? `Empezó el ${formatDateTime(onsetAt)}.`
              : `Registrada el ${formatDateTime(new Date(episode.recorded_at))}.`}
          </Text>

          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={endedAt}
              mode="datetime"
              display="inline"
              minimumDate={earliest}
              maximumDate={new Date()}
              onChange={(_, date) => date && setEndedAt(date)}
              locale="es-ES"
              accentColor={tint}
            />
          ) : (
            <Pressable onPress={pickOnAndroid} style={styles.androidPicker}>
              <FontAwesome name="calendar" size={18} color={textColor} />
              <Text style={styles.androidPickerText}>{formatDateTime(endedAt)}</Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [styles.saveButton, { backgroundColor: tint }, (pressed || saving) && { opacity: 0.6 }]}
          >
            <Text style={styles.saveText}>{saving ? 'Guardando…' : 'Guardar hora de fin'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 10 },
  backButton: { padding: 8, alignSelf: 'flex-start' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  content: { flex: 1, paddingHorizontal: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 16, opacity: 0.7 },
  message: { fontSize: 16, textAlign: 'center' },
  action: { fontSize: 16, fontWeight: '600' },
  androidPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  androidPickerText: { fontSize: 16 },
  saveButton: { marginTop: 'auto', marginBottom: 40, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
