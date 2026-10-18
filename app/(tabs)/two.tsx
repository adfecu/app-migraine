import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { QUESTIONS } from '@/app/checkin';
import { CRISIS_QUESTIONS } from '@/app/crisis';
import type { AnswerEntry, FormValue } from '@/utils/answers';
import { type Entry, newestFirst } from '@/utils/entries';
import { deleteRecord, loadEntries } from '@/utils/records';

// Risk level colors for episode comparison
const RISK_COLORS = {
  low: '#4CAF50',
  high: '#F44336',
};

// Episode statistics interface
interface EpisodeStats {
  episodesThisMonth: number;
  daysSinceLastEpisode: number | null;
  comparisonWithLastMonth: number | null;
  averageTimeBetweenCrises: number | null;
}

const DEFAULT_EPISODE_STATS: EpisodeStats = {
  episodesThisMonth: 0,
  daysSinceLastEpisode: null,
  comparisonWithLastMonth: null,
  averageTimeBetweenCrises: null,
};

function getCrisisEpisodes(entries: Entry[]): Entry[] {
  return entries.filter(entry => entry.kind === 'crisis');
}

function getEpisodesInMonth(episodes: Entry[], year: number, month: number): Entry[] {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  return episodes.filter(episode => episode.dayKey.startsWith(prefix));
}

/** Whole days between two YYYY-MM-DD dates. */
function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function calculateAverageTimeBetweenCrises(episodes: Entry[]): number | null {
  if (episodes.length < 2) return null;
  const sortedEpisodes = newestFirst(episodes).reverse();
  let totalDays = 0;
  for (let i = 1; i < sortedEpisodes.length; i++) {
    totalDays += daysBetween(sortedEpisodes[i - 1].dayKey, sortedEpisodes[i].dayKey);
  }
  return Math.round(totalDays / (sortedEpisodes.length - 1));
}

function calculateEpisodeStats(entries: Entry[]): EpisodeStats {
  const crisisEpisodes = getCrisisEpisodes(entries);
  if (crisisEpisodes.length === 0) return DEFAULT_EPISODE_STATS;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const episodesThisMonth = getEpisodesInMonth(crisisEpisodes, currentYear, currentMonth).length;

  const daysSinceLastEpisode = daysBetween(newestFirst(crisisEpisodes)[0].dayKey, todayKey());

  let lastMonthYear = currentYear;
  let lastMonth = currentMonth - 1;
  if (lastMonth < 0) {
    lastMonth = 11;
    lastMonthYear = currentYear - 1;
  }
  const episodesLastMonth = getEpisodesInMonth(crisisEpisodes, lastMonthYear, lastMonth).length;
  const comparisonWithLastMonth = episodesThisMonth - episodesLastMonth;

  const averageTimeBetweenCrises = calculateAverageTimeBetweenCrises(crisisEpisodes);

  return { episodesThisMonth, daysSinceLastEpisode, comparisonWithLastMonth, averageTimeBetweenCrises };
}

// Configure Spanish locale
LocaleConfig.locales['es'] = {
  monthNames: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ],
  monthNamesShort: [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ],
  dayNames: [
    'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
  ],
  dayNamesShort: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  today: 'Hoy'
};
LocaleConfig.defaultLocale = 'es';

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Format answer for display based on its type
function formatAnswer(answer: FormValue): string {
  if (answer === '') {
    return 'Sin respuesta';
  }
  if (typeof answer === 'boolean') {
    return answer ? 'Sí' : 'No';
  }
  if (typeof answer === 'number') {
    return answer.toString();
  }
  if (Array.isArray(answer)) {
    if (answer.length === 0) return 'Ninguna';
    // Map checkbox values to readable labels
    const labelMap: Record<string, string> = {
      'pulsatil': 'Pulsátil',
      'unilateral': 'Unilateral',
      'agravamiento_actividad': 'Agravamiento',
      'ninguna': 'Ninguna',
      'luz_ruido': 'Luz y ruido',
      'nauseas': 'Náuseas',
      'ninguno': 'Ninguno',
      // Trigger labels
      'estres': 'Estrés',
      'falta_sueno': 'Falta de sueño',
      'clima': 'Clima',
      'comida': 'Comida',
      'menstruacion': 'Menstruación',
      'pantallas': 'Pantallas',
      // Pain management labels
      'dormir_descansar': 'Descanso',
      'aislarme': 'Aislamiento',
      'compresas': 'Compresas',
      'relajacion': 'Relajación',
      'remedios_caseros': 'Remedios caseros',
      'otro': 'Otro',
      'nada_mas': 'Nada más',
      // Medication labels
      'si': 'Sí',
      'no': 'No',
      'ibuprofeno': 'Ibuprofeno',
      'acetaminofen': 'Acetaminofen',
      'aspirina': 'Aspirina',
      'otra_medicacion': 'Otra medicación',
      // Aura labels
      'luces': 'Luces',
      'lineas': 'Líneas',
      'manchas': 'Manchas',
      'hormigueo': 'Hormigueo',
      'otro_aura': 'Otro',
      'otra': 'Otra',
    };
    return answer.map(v => labelMap[v] || v).join(', ');
  }
  if (typeof answer === 'string') {
    // Check if it's an ISO date string
    if (answer.match(/^\d{4}-\d{2}-\d{2}T/)) {
      const date = new Date(answer);
      return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    // Check if it's a time duration (e.g., "5_horas")
    const hoursMatch = answer.match(/^(\d+)_horas?$/);
    if (hoursMatch) {
      const hours = parseInt(hoursMatch[1], 10);
      return `${hours} hora${hours > 1 ? 's' : ''}`;
    }
    // Map string values to readable labels
    const stringLabelMap: Record<string, string> = {
      'no': 'No',
      'yes': 'Sí',
      '<1_hora': '<1 hora',
      '1-4_horas': '1-4 horas',
      '4-12_horas': '4-12 horas',
      '1-24_horas': '1-24 horas',
      'todo_el_dia': 'Todo el día',
      'si_un_poco': 'Sí, un poco',
      'si_totalmente': 'Sí, totalmente',
      // Crisis time labels (legacy)
      '<30_min': 'Hace <30 min',
      '30-60_min': 'Hace 30-60 min',
      '1-2_horas': 'Hace 1-2 horas',
      '2-4_horas': 'Hace 2-4 horas',
      '>4_horas': 'Hace >4 horas',
    };
    // Check if it's a medication answer (starts with something other than predefined values)
    if (stringLabelMap[answer]) {
      return stringLabelMap[answer];
    }
    // It's likely a medication name or custom text
    return answer;
  }
  return String(answer);
}

// Get the display style for answer (badge vs text)
function getAnswerDisplayType(answer: FormValue): 'badge' | 'text' {
  if (typeof answer === 'number') {
    return 'badge';
  }
  if (typeof answer === 'boolean') {
    return 'badge';
  }
  if (typeof answer === 'string' && (answer === 'no' || answer === 'yes')) {
    return 'badge';
  }
  return 'text';
}

// Questions only found in converted records, whose meaning changed later.
const RETIRED_QUESTION_TEXT: Record<string, string> = {
  q_sleep_quality: '¿Qué tan bien dormiste anoche?',
  q_caffeine_intake: '¿Cómo ha sido tu consumo de cafeína (café, té, refrescos)?',
  q5_1_activity_impact_level: '¿El dolor te impidió realizar tus actividades normales hoy (trabajo, estudio, casa)?',
};

interface AnswerRow {
  question: string;
  text: string;
  badge: boolean;
}

function describeAnswer(answer: AnswerEntry): AnswerRow['text'] {
  if (answer.status === 'skipped') return 'Prefirió no responder';
  if (answer.status === 'unknown') return 'Sin respuesta';
  let text = formatAnswer(answer.value);
  for (const typed of Object.values(answer.text ?? {})) text += ` (${typed})`;
  if ((answer as { unverified?: boolean }).unverified) text += ' · sin verificar';
  return text;
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The entry's answers in the form's order, with the form's wording. */
function entryRows(entry: Entry): AnswerRow[] {
  const rows: AnswerRow[] = [];
  if (entry.kind === 'crisis') {
    rows.push({
      question: '¿Cuándo comenzó el dolor?',
      text:
        entry.onsetPrecision === 'unknown'
          ? 'Sin respuesta'
          : `${formatDateTime(entry.date)}${entry.onsetPrecision === 'approximate' ? ' (aprox.)' : ''}`,
      badge: false,
    });
    rows.push({
      question: '¿Cuándo terminó?',
      text: !entry.endDate
        ? 'En curso'
        : entry.endReported
          ? formatDateTime(entry.endDate)
          : `Sin registrar (cerrada por un check-in el ${formatDateTime(entry.endDate)})`,
      badge: false,
    });
  }
  const questions = entry.kind === 'crisis' ? CRISIS_QUESTIONS : QUESTIONS;
  const ordered: [string, string][] = [
    ...questions.map(q => [q.id, q.text] as [string, string]),
    ...Object.entries(RETIRED_QUESTION_TEXT),
  ];
  for (const [id, question] of ordered) {
    const answer = entry.answers[id];
    if (!answer) continue;
    rows.push({
      question,
      text: describeAnswer(answer),
      badge: answer.status === 'answered' && getAnswerDisplayType(answer.value) === 'badge',
    });
  }
  // Wording from old builds that could not be matched is shown as it was saved.
  const unmapped = (entry.answers as unknown as { legacy_unmapped?: { question: string; answer: FormValue }[] })
    .legacy_unmapped;
  for (const item of unmapped ?? []) {
    if (item.question) rows.push({ question: item.question, text: formatAnswer(item.answer), badge: false });
  }
  return rows;
}

interface DiaryEntryProps {
  checkIn: Entry;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

function DiaryEntry({ checkIn, index, isExpanded, onToggle, onDelete }: DiaryEntryProps) {
  const colorScheme = useColorScheme();
  const isCrisis = checkIn.kind === 'crisis';
  const entryLabel = isCrisis ? 'Crisis' : 'Check-in';
  
  return (
    <View style={[
      styles.entryContainer,
      isCrisis && styles.crisisEntryContainer,
    ]}>
      <Pressable onPress={onToggle} style={[
        styles.entryHeader,
        isCrisis && styles.crisisEntryHeader,
      ]}>
        <View style={styles.entryHeaderLeft}>
          <View style={styles.entryTitleRow}>
            <Text style={[
              styles.entryNumber,
              isCrisis && styles.crisisEntryNumber,
            ]}>
              {entryLabel} #{index + 1}
            </Text>
            {isCrisis && (
              <View style={styles.crisisBadge}>
                <Text style={styles.crisisBadgeText}>Crisis</Text>
              </View>
            )}
          </View>
          <Text style={styles.entryDate}>{formatDate(checkIn.date)}</Text>
        </View>
        <FontAwesome
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Colors[colorScheme ?? 'light'].text}
          style={{ opacity: 0.6 }}
        />
      </Pressable>
      
      {isExpanded && (
        <View style={styles.entryDetails}>
          {entryRows(checkIn).map((row, qIndex) => {
            const formattedAnswer = row.text;

            return (
              <View key={qIndex} style={styles.answerRow}>
                <Text style={styles.questionText}>{row.question}</Text>
                {row.badge ? (
                  <View style={[
                    styles.answerBadge,
                    { backgroundColor: Colors[colorScheme ?? 'light'].tint }
                  ]}>
                    <Text style={[
                      styles.answerBadgeText,
                      { color: colorScheme === 'dark' ? '#000' : '#fff' }
                    ]}>
                      {formattedAnswer}
                    </Text>
                  </View>
                ) : (
                  <View style={[
                    styles.answerTextContainer,
                    { borderColor: Colors[colorScheme ?? 'light'].tint }
                  ]}>
                    <Text style={[
                      styles.answerText,
                      { color: Colors[colorScheme ?? 'light'].tint }
                    ]}>
                      {formattedAnswer}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
          <Pressable 
            onPress={onDelete}
            style={styles.deleteButton}
          >
            <FontAwesome name="trash" size={16} color="#e74c3c" />
            <Text style={styles.deleteButtonText}>Eliminar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function DiarioScreen() {
  const colorScheme = useColorScheme();
  const [checkIns, setCheckIns] = useState<Entry[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [episodeStats, setEpisodeStats] = useState<EpisodeStats>(DEFAULT_EPISODE_STATS);
  const [loadError, setLoadError] = useState(false);

  const loadCheckIns = useCallback(async () => {
    try {
      const data = await loadEntries();
      setEpisodeStats(calculateEpisodeStats(data));
      setCheckIns(newestFirst(data));
      setLoadError(false);
    } catch {
      // Keep the last loaded entries; an empty diary would wrongly imply no records.
      setLoadError(true);
    }
  }, []);

  // The tabs can mount before the auth redirect; only read records once signed in.
  const { session } = useAuth();
  useFocusEffect(
    useCallback(() => {
      if (session) loadCheckIns();
    }, [session, loadCheckIns])
  );

  // Build markedDates object for the calendar
  const markedDates = useMemo(() => {
    const marks: Record<string, { 
      customStyles?: { 
        container?: object; 
        text?: object;
      };
    }> = {};
    
    // Collect dates by type
    const datesWithCheckIns = new Set<string>();
    const datesWithCrisis = new Set<string>();
    
    checkIns.forEach(entry => {
      const dateKey = entry.dayKey;
      if (entry.kind === 'crisis') {
        datesWithCrisis.add(dateKey);
      } else {
        datesWithCheckIns.add(dateKey);
      }
    });
    
    // Mark all days that have only check-ins with green background
    datesWithCheckIns.forEach(dateKey => {
      if (!datesWithCrisis.has(dateKey)) {
        const isSelected = selectedDate === dateKey;
        marks[dateKey] = {
          customStyles: {
            container: {
              backgroundColor: '#4CAF50',
              borderRadius: 16,
              borderWidth: isSelected ? 3 : 0,
              borderColor: Colors[colorScheme ?? 'light'].tint,
            },
            text: {
              color: '#fff',
              fontWeight: '600',
            },
          },
        };
      }
    });
    
    // Mark all days that have crisis episodes with red background (takes priority)
    datesWithCrisis.forEach(dateKey => {
      const isSelected = selectedDate === dateKey;
      marks[dateKey] = {
        customStyles: {
          container: {
            backgroundColor: '#F44336',
            borderRadius: 16,
            borderWidth: isSelected ? 3 : 0,
            borderColor: Colors[colorScheme ?? 'light'].tint,
          },
          text: {
            color: '#fff',
            fontWeight: '600',
          },
        },
      };
    });
    
    // Mark selected date if it doesn't have any entries
    const allDatesWithEntries = new Set([...datesWithCheckIns, ...datesWithCrisis]);
    if (selectedDate && !allDatesWithEntries.has(selectedDate)) {
      marks[selectedDate] = {
        customStyles: {
          container: {
            backgroundColor: Colors[colorScheme ?? 'light'].tint,
            borderRadius: 16,
          },
          text: {
            color: colorScheme === 'dark' ? '#000' : '#fff',
            fontWeight: '600',
          },
        },
      };
    }
    
    return marks;
  }, [checkIns, selectedDate, colorScheme]);

  // Filter check-ins by selected date
  const filteredCheckIns = useMemo(() => {
    if (!selectedDate) return [];
    return checkIns.filter(checkIn => checkIn.dayKey === selectedDate);
  }, [checkIns, selectedDate]);

  // Format selected date for display
  const formatSelectedDate = (dateString: string): string => {
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleDelete = (checkIn: Entry) => {
    const isCrisis = checkIn.kind === 'crisis';
    const entryType = isCrisis ? 'crisis' : 'check-in';
    Alert.alert(
      `Eliminar ${entryType}`,
      `¿Estás seguro de que quieres eliminar este ${entryType}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRecord(checkIn.kind, checkIn.id);
            } catch {
              Alert.alert('No se pudo eliminar', 'Revisa tu conexión e inténtalo de nuevo.');
              return;
            }
            const remaining = checkIns.filter(c => c.id !== checkIn.id);
            setCheckIns(remaining);
            setEpisodeStats(calculateEpisodeStats(remaining));
          },
        },
      ]
    );
  };

  const handleDayPress = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
  };

  // Calendar theme based on color scheme
  const calendarTheme = {
    backgroundColor: 'transparent',
    calendarBackground: 'transparent',
    textSectionTitleColor: Colors[colorScheme ?? 'light'].text,
    todayTextColor: Colors[colorScheme ?? 'light'].tint,
    dayTextColor: Colors[colorScheme ?? 'light'].text,
    textDisabledColor: colorScheme === 'dark' ? '#555' : '#d9e1e8',
    arrowColor: Colors[colorScheme ?? 'light'].tint,
    monthTextColor: Colors[colorScheme ?? 'light'].text,
    indicatorColor: Colors[colorScheme ?? 'light'].tint,
    textDayFontWeight: '400' as const,
    textMonthFontWeight: '600' as const,
    textDayHeaderFontWeight: '500' as const,
    textDayFontSize: 14,
    textMonthFontSize: 16,
    textDayHeaderFontSize: 12,
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {loadError && (
          <Pressable onPress={loadCheckIns} style={styles.loadErrorBanner}>
            <Text style={styles.loadErrorText}>
              No se pudieron cargar tus registros. Lo que ves puede no estar actualizado. Toca para reintentar.
            </Text>
          </Pressable>
        )}

        {/* Episode Summary */}
        <View style={styles.episodeSummaryContainer}>
          <Text style={styles.episodeSummaryTitle}>Resumen de Episodios</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{episodeStats.episodesThisMonth}</Text>
              <Text style={styles.statLabel}>Este mes</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {episodeStats.daysSinceLastEpisode !== null ? episodeStats.daysSinceLastEpisode : '-'}
              </Text>
              <Text style={styles.statLabel}>Días desde{'\n'}último episodio</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[
                styles.statValue,
                episodeStats.comparisonWithLastMonth !== null && episodeStats.comparisonWithLastMonth > 0
                  ? { color: RISK_COLORS.high }
                  : episodeStats.comparisonWithLastMonth !== null && episodeStats.comparisonWithLastMonth < 0
                    ? { color: RISK_COLORS.low }
                    : {}
              ]}>
                {episodeStats.comparisonWithLastMonth !== null
                  ? (episodeStats.comparisonWithLastMonth > 0
                      ? `+${episodeStats.comparisonWithLastMonth}`
                      : episodeStats.comparisonWithLastMonth === 0
                        ? 'Igual'
                        : episodeStats.comparisonWithLastMonth)
                  : '-'}
              </Text>
              <Text style={styles.statLabel}>vs. mes{'\n'}anterior</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {episodeStats.averageTimeBetweenCrises !== null ? episodeStats.averageTimeBetweenCrises : '-'}
              </Text>
              <Text style={styles.statLabel}>Días promedio{'\n'}entre crisis</Text>
            </View>
          </View>
        </View>

        {/* Calendar Section */}
        <View style={styles.calendarContainer}>
          <Calendar
            onDayPress={handleDayPress}
            markedDates={markedDates}
            markingType="custom"
            theme={calendarTheme}
            enableSwipeMonths={true}
            firstDay={1}
          />
        </View>

        {/* Check-ins Section */}
        {selectedDate ? (
          <View style={styles.checkInsSection}>
            <Text style={styles.sectionTitle}>
              {formatSelectedDate(selectedDate)}
            </Text>
            
            {filteredCheckIns.length === 0 ? (
              <View style={styles.noCheckInsContainer}>
                <FontAwesome name="calendar-o" size={32} color="#ccc" />
                <Text style={styles.noCheckInsText}>No check-ins</Text>
                <Text style={styles.noCheckInsSubtext}>
                  No hay registros para este día
                </Text>
              </View>
            ) : (
              filteredCheckIns.map((checkIn, index) => (
                <DiaryEntry
                  key={checkIn.id}
                  checkIn={checkIn}
                  index={index}
                  isExpanded={expandedIds.has(checkIn.id)}
                  onToggle={() => toggleExpanded(checkIn.id)}
                  onDelete={() => handleDelete(checkIn)}
                />
              ))
            )}
          </View>
        ) : (
          <View style={styles.selectDateContainer}>
            <FontAwesome name="hand-pointer-o" size={32} color="#ccc" />
            <Text style={styles.selectDateText}>
              Selecciona un día
            </Text>
            <Text style={styles.selectDateSubtext}>
              Toca un día del calendario para ver tus check-ins
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadErrorBanner: {
    borderWidth: 1,
    borderColor: '#FF9500',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  loadErrorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  episodeSummaryContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  episodeSummaryTitle: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 320,
  },
  statCard: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.3)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minWidth: 140,
    flex: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 4,
  },
  calendarContainer: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  checkInsSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    textTransform: 'capitalize',
  },
  noCheckInsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: 'rgba(128, 128, 128, 0.05)',
    borderRadius: 12,
  },
  noCheckInsText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    opacity: 0.6,
  },
  noCheckInsSubtext: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.4,
    textAlign: 'center',
  },
  selectDateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    margin: 16,
    backgroundColor: 'rgba(128, 128, 128, 0.05)',
    borderRadius: 12,
  },
  selectDateText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    opacity: 0.6,
  },
  selectDateSubtext: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.4,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    opacity: 0.6,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.4,
    textAlign: 'center',
  },
  entryContainer: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  entryHeaderLeft: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  entryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
  },
  entryNumber: {
    fontSize: 16,
    fontWeight: '600',
  },
  crisisEntryNumber: {
    color: '#c0392b',
  },
  crisisBadge: {
    backgroundColor: '#F44336',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  crisisBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  entryDate: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 2,
  },
  crisisEntryContainer: {
    borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.3)',
  },
  crisisEntryHeader: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
  },
  entryDetails: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: 'rgba(128, 128, 128, 0.05)',
  },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.1)',
    backgroundColor: 'transparent',
    gap: 12,
  },
  questionText: {
    flex: 1,
    fontSize: 14,
  },
  answerBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  answerBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  answerTextContainer: {
    maxWidth: '50%',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'transparent',
  },
  answerText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
  },
  deleteButtonText: {
    color: '#e74c3c',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});
