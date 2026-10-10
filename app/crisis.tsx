import FontAwesome from '@expo/vector-icons/FontAwesome';
import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { AnswerValue, getUserSex, saveCrisisEpisode } from '@/utils/storage';

// Question types
type QuestionType = 'yesno' | 'slider' | 'slider_labeled' | 'multiple_choice' | 'checkbox' | 'yesno_with_text' | 'datetime_picker' | 'checkbox_nested';

interface QuestionOption {
  value: string;
  label: string;
  hasTextInput?: boolean; // If true, show text input when selected
  exclusive?: boolean; // If true, selecting this clears other selections
  subOptions?: QuestionOption[]; // Nested options (for checkbox_nested)
}

interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: QuestionOption[];
  sliderMin?: number;
  sliderMax?: number;
  sliderLabels?: { range: [number, number]; label: string }[];
}

// Crisis-specific questions
export const CRISIS_QUESTIONS: Question[] = [
  // 1. Detalles del Inicio y Severidad
  {
    id: 'crisis_pain_start',
    text: '¿Cuándo comenzó el dolor?',
    type: 'datetime_picker',
  },
  {
    id: 'crisis_intensity',
    text: '¿Cuál es la intensidad del dolor ahora?',
    type: 'slider_labeled',
    sliderMin: 0,
    sliderMax: 10,
    sliderLabels: [
      { range: [0, 3], label: 'Leve' },
      { range: [4, 7], label: 'Moderado' },
      { range: [8, 10], label: 'Severo' },
    ],
  },
  // 2. Características del Dolor
  {
    id: 'crisis_pain_characteristics',
    text: '¿Cómo sientes el dolor? (Marca todas las que apliquen)',
    type: 'checkbox',
    options: [
      { value: 'pulsatil', label: 'Siento latidos, pulsaciones o pum-pum en la cabeza (Pulsátil)' },
      { value: 'unilateral', label: 'El dolor está solo en un lado de la cabeza (Unilateral)' },
      { value: 'agravamiento_actividad', label: 'El dolor empeora al moverme, caminar o agacharme (Agravamiento por actividad física)' },
      { value: 'ninguna', label: 'Ninguna de las anteriores', exclusive: true },
    ],
  },
  {
    id: 'crisis_aura',
    text: '¿Tuviste aura antes o durante el dolor? (Luces, líneas, manchas en la visión, hormigueo, etc.)',
    type: 'checkbox',
    options: [
      { value: 'luces', label: 'Luces' },
      { value: 'lineas', label: 'Líneas' },
      { value: 'manchas', label: 'Manchas' },
      { value: 'hormigueo', label: 'Hormigueo' },
      { value: 'otro_aura', label: 'Otro (especifique)', hasTextInput: true },
    ],
  },
  {
    id: 'crisis_symptoms',
    text: '¿Tienes alguno de estos síntomas ahora?',
    type: 'checkbox',
    options: [
      { value: 'luz_ruido', label: 'Me molesta mucho la luz Y el ruido' },
      { value: 'nauseas', label: 'Tengo náuseas o ganas de vomitar' },
      { value: 'ninguno', label: 'Ninguno', exclusive: true },
    ],
  },
  // 3. Contexto y Tratamiento
  {
    id: 'crisis_triggers',
    text: '¿Identificas algún desencadenante? (Marca todos los que apliquen)',
    type: 'checkbox',
    options: [
      { value: 'estres', label: 'Estrés' },
      { value: 'falta_sueno', label: 'Falta de sueño o mal descanso' },
      { value: 'clima', label: 'Cambios de clima o presión' },
      { value: 'comida', label: 'Algún alimento o bebida' },
      { value: 'menstruacion', label: 'Menstruación' },
      { value: 'pantallas', label: 'Pantallas o luz intensa' },
      { value: 'otro', label: 'Otra opción (especifique)', hasTextInput: true },
      { value: 'ninguno', label: 'No identifico ninguno', exclusive: true },
    ],
  },
  {
    id: 'crisis_medication',
    text: '¿Has tomado alguna medicación para este dolor?',
    type: 'checkbox_nested',
    options: [
      { 
        value: 'si', 
        label: 'Sí',
        subOptions: [
          { value: 'ibuprofeno', label: 'Ibuprofeno' },
          { value: 'acetaminofen', label: 'Acetaminofen' },
          { value: 'aspirina', label: 'Aspirina' },
          { value: 'otra_medicacion', label: 'Otra opción (especifique)', hasTextInput: true },
        ],
      },
      { value: 'no', label: 'No', exclusive: true },
    ],
  },
  {
    id: 'crisis_healthcare_visit',
    text: '¿Ha usted acudido a algún centro de salud?',
    type: 'yesno_with_text',
  },
];

// Default values for each question type
function getDefaultAnswer(question: Question): AnswerValue | null {
  switch (question.type) {
    case 'yesno':
      return null;
    case 'yesno_with_text':
      return '';
    case 'slider':
    case 'slider_labeled':
      const min = question.sliderMin ?? 0;
      const max = question.sliderMax ?? 10;
      return Math.round((min + max) / 2);
    case 'multiple_choice':
      return '';
    case 'checkbox':
      return [];
    case 'datetime_picker':
      return ''; // Empty string = no selection
    case 'checkbox_nested':
      return []; // Empty array = no selection
    default:
      return '';
  }
}

// Validation function
function isAnswerValid(question: Question, answer: AnswerValue | null | undefined): boolean {
  if (answer === null || answer === undefined) return false;

  switch (question.type) {
    case 'yesno':
      return typeof answer === 'boolean';
    case 'yesno_with_text':
      return answer !== '';
    case 'slider':
    case 'slider_labeled':
      return typeof answer === 'number';
    case 'multiple_choice':
      return answer !== '';
    case 'checkbox':
      return Array.isArray(answer) && answer.length > 0;
    case 'datetime_picker':
      return answer !== '';
    case 'checkbox_nested':
      return Array.isArray(answer) && answer.length > 0;
    default:
      return true;
  }
}

// Dark mode colors for crisis mode
const DARK_COLORS = {
  background: '#1a1a1a',
  surface: '#2a2a2a',
  text: '#ffffff',
  textSecondary: '#a0a0a0',
  accent: '#e74c3c', // Red accent for crisis
  accentLight: 'rgba(231, 76, 60, 0.2)',
  border: 'rgba(255, 255, 255, 0.2)',
};

// Yes/No Button Component
interface YesNoButtonsProps {
  value: boolean | null;
  onChange: (value: boolean) => void;
}

function YesNoButtons({ value, onChange }: YesNoButtonsProps) {
  const isNo = value === false;
  const isYes = value === true;

  return (
    <View style={styles.yesNoContainer}>
      <Pressable
        onPress={() => onChange(false)}
        style={[
          styles.yesNoButton,
          isNo && { backgroundColor: DARK_COLORS.accent },
        ]}
      >
        <Text style={[
          styles.yesNoText,
          isNo && { color: '#fff' },
        ]}>
          No
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange(true)}
        style={[
          styles.yesNoButton,
          isYes && { backgroundColor: DARK_COLORS.accent },
        ]}
      >
        <Text style={[
          styles.yesNoText,
          isYes && { color: '#fff' },
        ]}>
          Sí
        </Text>
      </Pressable>
    </View>
  );
}

// Yes/No with Text Input Component
interface YesNoWithTextProps {
  value: string;
  onChange: (value: string) => void;
}

function YesNoWithText({ value, onChange }: YesNoWithTextProps) {
  const isNo = value === 'no';
  const isYes = value !== 'no' && value !== '';
  const medicationText = isYes && value !== 'yes' ? value : '';

  return (
    <View style={styles.yesNoWithTextContainer}>
      <View style={styles.yesNoContainer}>
        <Pressable
          onPress={() => onChange('no')}
          style={[
            styles.yesNoButton,
            isNo && { backgroundColor: DARK_COLORS.accent },
          ]}
        >
          <Text style={[
            styles.yesNoText,
            isNo && { color: '#fff' },
          ]}>
            No
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange('yes')}
          style={[
            styles.yesNoButton,
            isYes && { backgroundColor: DARK_COLORS.accent },
          ]}
        >
          <Text style={[
            styles.yesNoText,
            isYes && { color: '#fff' },
          ]}>
            Sí
          </Text>
        </Pressable>
      </View>
      {isYes && (
        <TextInput
          style={styles.textInput}
          placeholder="¿Cuál?"
          placeholderTextColor={DARK_COLORS.textSecondary}
          value={medicationText}
          onChangeText={(text) => onChange(text || 'yes')}
        />
      )}
    </View>
  );
}

// Labeled Slider Component
interface LabeledSliderProps {
  value: number | null;
  onChange: (value: number) => void;
  min: number;
  max: number;
  labels?: { range: [number, number]; label: string }[];
}

function LabeledSlider({ value, onChange, min, max, labels }: LabeledSliderProps) {
  const hasValue = value !== null;
  const displayValue = value ?? Math.round((min + max) / 2);

  const getCurrentLabel = () => {
    if (!labels || !hasValue) return null;
    for (const { range, label } of labels) {
      if (displayValue >= range[0] && displayValue <= range[1]) {
        return label;
      }
    }
    return null;
  };

  const currentLabel = getCurrentLabel();

  return (
    <View style={styles.sliderContainer}>
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>{min}</Text>
        <View style={styles.sliderValueContainer}>
          {hasValue ? (
            <>
              <Text style={styles.sliderValue}>{displayValue}</Text>
              {currentLabel && (
                <Text style={[styles.sliderRangeLabel, { color: DARK_COLORS.accent }]}>
                  {currentLabel}
                </Text>
              )}
            </>
          ) : (
            <Text style={[styles.sliderValue, { opacity: 0.4 }]}>—</Text>
          )}
        </View>
        <Text style={styles.sliderLabel}>{max}</Text>
      </View>
      {labels && (
        <View style={styles.rangeLabelsContainer}>
          {labels.map((item, index) => (
            <Text key={index} style={styles.rangeLabelText}>
              {item.range[0]}-{item.range[1]}: {item.label}
            </Text>
          ))}
        </View>
      )}
      <Slider
        style={[styles.slider, !hasValue && { opacity: 0.5 }]}
        minimumValue={min}
        maximumValue={max}
        value={displayValue}
        onValueChange={(v) => onChange(Math.round(v))}
        minimumTrackTintColor={hasValue ? DARK_COLORS.accent : '#555'}
        maximumTrackTintColor="#555"
        thumbTintColor={hasValue ? DARK_COLORS.accent : '#888'}
      />
      {!hasValue && (
        <Text style={styles.sliderHint}>Desliza para seleccionar</Text>
      )}
    </View>
  );
}

// Multiple Choice Component
interface MultipleChoiceProps {
  options: QuestionOption[];
  value: string;
  onChange: (value: string) => void;
}

function MultipleChoice({ options, value, onChange }: MultipleChoiceProps) {
  return (
    <View style={styles.multipleChoiceContainer}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => onChange(option.value)}
          style={[
            styles.multipleChoiceOption,
            value === option.value && { backgroundColor: DARK_COLORS.accent, borderColor: DARK_COLORS.accent },
          ]}
        >
          <Text style={[
            styles.multipleChoiceText,
            value === option.value && { color: '#fff' },
          ]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// DateTime Picker Component
interface DateTimePickerInputProps {
  value: string;
  onChange: (value: string) => void;
}

function DateTimePickerInput({ value, onChange }: DateTimePickerInputProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(value ? new Date(value) : new Date());
  
  const handleDateChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (date) {
      setSelectedDate(date);
      if (Platform.OS === 'android') {
        setShowTimePicker(true);
      }
    }
  };

  const handleTimeChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (date) {
      const newDate = new Date(selectedDate);
      newDate.setHours(date.getHours());
      newDate.setMinutes(date.getMinutes());
      setSelectedDate(newDate);
      onChange(newDate.toISOString());
    }
  };

  const handleIOSConfirm = () => {
    onChange(selectedDate.toISOString());
    setShowDatePicker(false);
  };

  const formatDateTime = (isoString: string): string => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const displayValue = value ? formatDateTime(value) : 'Selecciona fecha y hora';

  return (
    <View style={styles.dateTimeContainer}>
      <Pressable
        onPress={() => setShowDatePicker(true)}
        style={[
          styles.dateTimeButton,
          value && { backgroundColor: DARK_COLORS.accentLight, borderColor: DARK_COLORS.accent },
        ]}
      >
        <FontAwesome name="calendar" size={20} color={value ? DARK_COLORS.accent : DARK_COLORS.textSecondary} />
        <Text style={[
          styles.dateTimeText,
          value && { color: DARK_COLORS.text },
        ]}>
          {displayValue}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' && showDatePicker && (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>¿Cuándo comenzó el dolor?</Text>
              <DateTimePicker
                value={selectedDate}
                mode="datetime"
                display="spinner"
                onChange={(event, date) => date && setSelectedDate(date)}
                maximumDate={new Date()}
                locale="es"
              />
              <View style={styles.modalButtons}>
                <Pressable 
                  onPress={() => setShowDatePicker(false)}
                  style={[styles.modalButton, styles.modalButtonCancel]}
                >
                  <Text style={styles.modalButtonCancelText}>Cancelar</Text>
                </Pressable>
                <Pressable 
                  onPress={handleIOSConfirm}
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                >
                  <Text style={styles.modalButtonConfirmText}>Confirmar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
          maximumDate={new Date()}
        />
      )}

      {Platform.OS === 'android' && showTimePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}
    </View>
  );
}

// Checkbox Group Component with text input support
interface CheckboxGroupProps {
  options: QuestionOption[];
  value: string[];
  onChange: (value: string[]) => void;
  textInputs?: Record<string, string>;
  onTextInputChange?: (optionValue: string, text: string) => void;
}

function CheckboxGroup({ options, value, onChange, textInputs = {}, onTextInputChange }: CheckboxGroupProps) {
  const toggleOption = (option: QuestionOption) => {
    const optionValue = option.value;
    const isExclusive = option.exclusive;

    if (isExclusive) {
      // If selecting an exclusive option, clear all other selections
      if (value.includes(optionValue)) {
        onChange([]);
      } else {
        onChange([optionValue]);
      }
    } else {
      // If selecting a regular option, remove any exclusive options
      const exclusiveValues = options.filter(o => o.exclusive).map(o => o.value);
      let newValue = value.filter(v => !exclusiveValues.includes(v));

      if (newValue.includes(optionValue)) {
        newValue = newValue.filter(v => v !== optionValue);
      } else {
        newValue = [...newValue, optionValue];
      }
      onChange(newValue);
    }
  };

  return (
    <View style={styles.checkboxContainer}>
      {options.map((option) => {
        const isChecked = value.includes(option.value);
        return (
          <View key={option.value}>
            <Pressable
              onPress={() => toggleOption(option)}
              style={[
                styles.checkboxOption,
                isChecked && { backgroundColor: DARK_COLORS.accentLight, borderColor: DARK_COLORS.accent },
              ]}
            >
              <View style={[
                styles.checkbox,
                isChecked && { backgroundColor: DARK_COLORS.accent, borderColor: DARK_COLORS.accent },
              ]}>
                {isChecked && (
                  <FontAwesome name="check" size={12} color="#fff" />
                )}
              </View>
              <Text style={styles.checkboxText}>{option.label}</Text>
            </Pressable>
            {option.hasTextInput && isChecked && onTextInputChange && (
              <TextInput
                style={styles.checkboxTextInput}
                placeholder="Especifique..."
                placeholderTextColor={DARK_COLORS.textSecondary}
                value={textInputs[option.value] || ''}
                onChangeText={(text) => onTextInputChange(option.value, text)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

// Checkbox Nested Component for medication questions
interface CheckboxNestedProps {
  options: QuestionOption[];
  value: string[];
  onChange: (value: string[]) => void;
  textInputs?: Record<string, string>;
  onTextInputChange?: (optionValue: string, text: string) => void;
}

function CheckboxNested({ options, value, onChange, textInputs = {}, onTextInputChange }: CheckboxNestedProps) {
  // Check if any parent option with sub-options is selected
  const getSelectedParent = (): QuestionOption | null => {
    for (const option of options) {
      if (option.subOptions && value.some(v => v === option.value || option.subOptions?.some(sub => sub.value === v))) {
        return option;
      }
    }
    return null;
  };

  const selectedParent = getSelectedParent();

  const handleParentSelect = (option: QuestionOption) => {
    if (option.exclusive) {
      // Selecting exclusive option (like "No")
      onChange([option.value]);
    } else if (option.subOptions) {
      // Selecting parent with sub-options (like "Sí")
      // Clear exclusive options and set parent as selected
      onChange([option.value]);
    }
  };

  const handleSubOptionToggle = (subOption: QuestionOption) => {
    const parentOption = options.find(o => o.subOptions?.some(sub => sub.value === subOption.value));
    if (!parentOption) return;

    // Get current sub-option selections (excluding parent value)
    const currentSubSelections = value.filter(v => 
      v !== parentOption.value && parentOption.subOptions?.some(sub => sub.value === v)
    );

    let newSubSelections: string[];
    if (currentSubSelections.includes(subOption.value)) {
      newSubSelections = currentSubSelections.filter(v => v !== subOption.value);
    } else {
      newSubSelections = [...currentSubSelections, subOption.value];
    }

    // Always include parent value if there are sub-selections
    if (newSubSelections.length > 0) {
      onChange([parentOption.value, ...newSubSelections]);
    } else {
      onChange([parentOption.value]);
    }
  };
  
  return (
    <View style={styles.checkboxContainer}>
      {options.map((option) => {
        const isSelected = option.exclusive 
          ? value.includes(option.value)
          : selectedParent?.value === option.value;
        
        return (
          <View key={option.value}>
            <Pressable
              onPress={() => handleParentSelect(option)}
              style={[
                styles.checkboxOption,
                isSelected && { backgroundColor: DARK_COLORS.accentLight, borderColor: DARK_COLORS.accent },
              ]}
            >
              <View style={[
                styles.checkbox,
                isSelected && { backgroundColor: DARK_COLORS.accent, borderColor: DARK_COLORS.accent },
              ]}>
                {isSelected && (
                  <FontAwesome name="check" size={12} color="#fff" />
                )}
              </View>
              <Text style={styles.checkboxText}>{option.label}</Text>
            </Pressable>
            
            {/* Show sub-options when parent is selected */}
            {option.subOptions && isSelected && (
              <View style={styles.subOptionsContainer}>
                {option.subOptions.map((subOption) => {
                  const isSubChecked = value.includes(subOption.value);
                  return (
                    <View key={subOption.value}>
                      <Pressable
                        onPress={() => handleSubOptionToggle(subOption)}
                        style={[
                          styles.checkboxOption,
                          styles.subOption,
                          isSubChecked && { backgroundColor: DARK_COLORS.accentLight, borderColor: DARK_COLORS.accent },
                        ]}
                      >
                        <View style={[
                          styles.checkbox,
                          isSubChecked && { backgroundColor: DARK_COLORS.accent, borderColor: DARK_COLORS.accent },
                        ]}>
                          {isSubChecked && (
                            <FontAwesome name="check" size={12} color="#fff" />
                          )}
                        </View>
                        <Text style={styles.checkboxText}>{subOption.label}</Text>
                      </Pressable>
                      {subOption.hasTextInput && isSubChecked && onTextInputChange && (
                        <TextInput
                          style={[styles.checkboxTextInput, styles.subOptionTextInput]}
                          placeholder="Especifique..."
                          placeholderTextColor={DARK_COLORS.textSecondary}
                          value={textInputs[subOption.value] || ''}
                          onChangeText={(text) => onTextInputChange(subOption.value, text)}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function CrisisScreen() {
  const router = useRouter();
  const [userSex, setUserSex] = useState<'male' | 'female' | null>(null);
  useEffect(() => { getUserSex().then(setUserSex); }, []);

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Map<string, AnswerValue | null>>(() => {
    const initial = new Map<string, AnswerValue | null>();
    CRISIS_QUESTIONS.forEach(q => {
      initial.set(q.id, getDefaultAnswer(q));
    });
    return initial;
  });
  // Text inputs for checkbox options with hasTextInput
  const [textInputs, setTextInputs] = useState<Record<string, Record<string, string>>>({});

  const activeQuestions = useMemo(() => {
    if (userSex !== 'male') return CRISIS_QUESTIONS;
    return CRISIS_QUESTIONS.map(q => {
      if (q.id === 'crisis_triggers' && q.options) {
        return { ...q, options: q.options.filter(o => o.value !== 'menstruacion') };
      }
      return q;
    });
  }, [userSex]);

  const [saving, setSaving] = useState(false);
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === activeQuestions.length - 1;
  const currentQuestion = activeQuestions[currentStep];
  const currentAnswer = answers.get(currentQuestion.id) ?? getDefaultAnswer(currentQuestion);
  const isCurrentAnswerValid = isAnswerValid(currentQuestion, currentAnswer);

  const handleBack = () => {
    if (isFirstStep) {
      router.back();
    } else {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = async () => {
    // Ignore taps while a save is in flight
    if (!isCurrentAnswerValid || saving) {
      return;
    }

    if (isLastStep) {
      const questionTexts = activeQuestions.map(q => q.text);
      const answerValues = activeQuestions.map(q => {
        const answer = answers.get(q.id);
        if (answer === null) {
          return q.type === 'checkbox' ? [] : '';
        }
        return answer;
      }) as AnswerValue[];
      setSaving(true);
      try {
        await saveCrisisEpisode(answerValues, questionTexts);
      } catch {
        // Stay on the form with the answers intact; only leave once the save succeeded.
        setSaving(false);
        Alert.alert(
          'No se pudo guardar',
          'Tus respuestas siguen aquí. Revisa tu conexión e inténtalo de nuevo.',
        );
        return;
      }
      router.back();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const updateAnswer = (value: AnswerValue) => {
    setAnswers(prev => {
      const newAnswers = new Map(prev);
      newAnswers.set(currentQuestion.id, value);
      return newAnswers;
    });
  };

  const handleTextInputChange = (optionValue: string, text: string) => {
    setTextInputs(prev => ({
      ...prev,
      [currentQuestion.id]: {
        ...(prev[currentQuestion.id] || {}),
        [optionValue]: text,
      },
    }));
  };

  const currentTextInputs = textInputs[currentQuestion.id] || {};

  const renderQuestionInput = () => {
    switch (currentQuestion.type) {
      case 'yesno':
        return (
          <YesNoButtons
            value={currentAnswer as boolean | null}
            onChange={updateAnswer}
          />
        );

      case 'yesno_with_text':
        return (
          <YesNoWithText
            value={(currentAnswer as string) ?? ''}
            onChange={updateAnswer}
          />
        );

      case 'slider':
      case 'slider_labeled':
        return (
          <LabeledSlider
            value={currentAnswer as number | null}
            onChange={updateAnswer}
            min={currentQuestion.sliderMin ?? 0}
            max={currentQuestion.sliderMax ?? 10}
            labels={currentQuestion.sliderLabels}
          />
        );

      case 'multiple_choice':
        return (
          <MultipleChoice
            options={currentQuestion.options ?? []}
            value={(currentAnswer as string) ?? ''}
            onChange={updateAnswer}
          />
        );

      case 'checkbox':
        return (
          <CheckboxGroup
            options={currentQuestion.options ?? []}
            value={(currentAnswer as string[]) ?? []}
            onChange={updateAnswer}
            textInputs={currentTextInputs}
            onTextInputChange={handleTextInputChange}
          />
        );

      case 'datetime_picker':
        return (
          <DateTimePickerInput
            value={(currentAnswer as string) ?? ''}
            onChange={updateAnswer}
          />
        );

      case 'checkbox_nested':
        return (
          <CheckboxNested
            options={currentQuestion.options ?? []}
            value={(currentAnswer as string[]) ?? []}
            onChange={updateAnswer}
            textInputs={currentTextInputs}
            onTextInputChange={handleTextInputChange}
          />
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with Back button */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          {({ pressed }) => (
            <FontAwesome
              name="arrow-left"
              size={24}
              color={DARK_COLORS.text}
              style={{ opacity: pressed ? 0.5 : 1 }}
            />
          )}
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Modo Crisis</Text>
          <Text style={styles.stepIndicator}>
            {currentStep + 1} / {activeQuestions.length}
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Question Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.questionText}>{currentQuestion.text}</Text>
        {renderQuestionInput()}
      </ScrollView>

      {/* Footer with Next/End button */}
      <View style={styles.footer}>
        <Pressable
          onPress={handleNext}
          disabled={!isCurrentAnswerValid || saving}
          style={({ pressed }) => [
            styles.nextButton,
            pressed && isCurrentAnswerValid && styles.nextButtonPressed,
            (!isCurrentAnswerValid || saving) && styles.nextButtonDisabled,
          ]}
        >
          <Text style={[
            styles.nextButtonText,
            !isCurrentAnswerValid && styles.nextButtonTextDisabled,
          ]}>
            {saving ? 'Guardando…' : isLastStep ? 'Finalizar' : 'Siguiente'}
          </Text>
        </Pressable>
      </View>

      {/* Use light status bar for dark background */}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    backgroundColor: DARK_COLORS.background,
  },
  backButton: {
    padding: 10,
  },
  headerCenter: {
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: DARK_COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stepIndicator: {
    fontSize: 16,
    fontWeight: '600',
    color: DARK_COLORS.text,
    marginTop: 2,
  },
  placeholder: {
    width: 44,
  },
  scrollView: {
    flex: 1,
    backgroundColor: DARK_COLORS.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 20,
  },
  questionText: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 40,
    color: DARK_COLORS.text,
  },
  // Yes/No styles
  yesNoContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    backgroundColor: 'transparent',
  },
  yesNoButton: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: DARK_COLORS.border,
    minWidth: 100,
    alignItems: 'center',
    backgroundColor: DARK_COLORS.surface,
  },
  yesNoText: {
    fontSize: 18,
    fontWeight: '600',
    color: DARK_COLORS.text,
  },
  // Yes/No with Text styles
  yesNoWithTextContainer: {
    gap: 20,
    backgroundColor: 'transparent',
  },
  textInput: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: DARK_COLORS.text,
    borderColor: DARK_COLORS.accent,
    backgroundColor: DARK_COLORS.surface,
  },
  // Slider styles
  sliderContainer: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  sliderLabel: {
    fontSize: 14,
    opacity: 0.6,
    color: DARK_COLORS.text,
  },
  sliderValueContainer: {
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  sliderValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: DARK_COLORS.text,
  },
  sliderRangeLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  rangeLabelsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: 'transparent',
  },
  rangeLabelText: {
    fontSize: 12,
    opacity: 0.6,
    color: DARK_COLORS.text,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderHint: {
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.5,
    marginTop: 8,
    color: DARK_COLORS.text,
  },
  // Multiple Choice styles
  multipleChoiceContainer: {
    gap: 12,
    backgroundColor: 'transparent',
  },
  multipleChoiceOption: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: DARK_COLORS.border,
    alignItems: 'center',
    backgroundColor: DARK_COLORS.surface,
  },
  multipleChoiceText: {
    fontSize: 16,
    fontWeight: '500',
    color: DARK_COLORS.text,
  },
  // Checkbox styles
  checkboxContainer: {
    gap: 12,
    backgroundColor: 'transparent',
  },
  checkboxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: DARK_COLORS.border,
    gap: 12,
    backgroundColor: DARK_COLORS.surface,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: DARK_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxText: {
    fontSize: 14,
    flex: 1,
    color: DARK_COLORS.text,
  },
  checkboxTextInput: {
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    marginTop: 8,
    marginLeft: 36,
    color: DARK_COLORS.text,
    borderColor: DARK_COLORS.accent,
    backgroundColor: DARK_COLORS.surface,
  },
  subOptionsContainer: {
    marginLeft: 20,
    marginTop: 8,
  },
  subOption: {
    marginLeft: 0,
  },
  subOptionTextInput: {
    marginLeft: 56,
  },
  // DateTime Picker styles
  dateTimeContainer: {
    gap: 12,
    backgroundColor: 'transparent',
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: DARK_COLORS.border,
    backgroundColor: DARK_COLORS.surface,
  },
  dateTimeText: {
    fontSize: 16,
    color: DARK_COLORS.textSecondary,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: DARK_COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    color: DARK_COLORS.text,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: DARK_COLORS.textSecondary,
  },
  modalButtonConfirm: {
    backgroundColor: DARK_COLORS.accent,
  },
  modalButtonConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Footer styles
  footer: {
    paddingHorizontal: 30,
    paddingBottom: 40,
    paddingTop: 20,
    backgroundColor: DARK_COLORS.background,
  },
  nextButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: DARK_COLORS.accent,
  },
  nextButtonPressed: {
    opacity: 0.8,
  },
  nextButtonDisabled: {
    opacity: 0.4,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  nextButtonTextDisabled: {
    opacity: 0.8,
  },
});

