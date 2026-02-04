import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { AnswerValue, CheckIn, deleteCheckIn, getAllCheckIns } from '@/utils/storage';

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

// Convert ISO date string to YYYY-MM-DD format
function toDateKey(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().split('T')[0];
}

// Format answer for display based on its type
function formatAnswer(answer: AnswerValue): string {
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
function getAnswerDisplayType(answer: AnswerValue): 'badge' | 'text' {
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

interface DiaryEntryProps {
  checkIn: CheckIn;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

function DiaryEntry({ checkIn, index, isExpanded, onToggle, onDelete }: DiaryEntryProps) {
  const colorScheme = useColorScheme();
  const isCrisis = checkIn.type === 'crisis';
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
          {checkIn.questions.map((question, qIndex) => {
            const answer = checkIn.answers[qIndex];
            const displayType = getAnswerDisplayType(answer);
            const formattedAnswer = formatAnswer(answer);
            
            return (
              <View key={qIndex} style={styles.answerRow}>
                <Text style={styles.questionText}>{question}</Text>
                {displayType === 'badge' ? (
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
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const loadCheckIns = async () => {
        const data = await getAllCheckIns();
        // Show newest first
        setCheckIns(data.reverse());
      };
      loadCheckIns();
    }, [])
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
      const dateKey = toDateKey(entry.date);
      if (entry.type === 'crisis') {
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
    return checkIns.filter(checkIn => toDateKey(checkIn.date) === selectedDate);
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

  const handleDelete = (checkIn: CheckIn) => {
    const isCrisis = checkIn.type === 'crisis';
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
            await deleteCheckIn(checkIn.id);
            setCheckIns(prev => prev.filter(c => c.id !== checkIn.id));
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
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
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
