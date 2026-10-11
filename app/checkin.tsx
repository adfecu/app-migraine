import FontAwesome from '@expo/vector-icons/FontAwesome';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useGuardedSave } from '@/components/useGuardedSave';
import Colors from '@/constants/Colors';
import { AnswerValue, getUserSex, saveCheckIn } from '@/utils/storage';

// Question types
type QuestionType = 'yesno' | 'slider' | 'slider_labeled' | 'multiple_choice' | 'checkbox' | 'yesno_with_text' | 'time_picker' | 'checkbox_nested';

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
  conditional?: boolean; // If true, only shown when Q1 = Yes
  sliderMin?: number;
  sliderMax?: number;
  sliderLabels?: { range: [number, number]; label: string }[];
  helperText?: string; // Optional explanatory text shown below the question
}

export const QUESTIONS: Question[] = [
  // 1. Detección Inicial
  {
    id: 'q1_headache',
    text: '¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?',
    type: 'yesno',
    conditional: false,
  },
  // 2. Detalles del Dolor (Condicional)
  {
    id: 'q2_1_intensity',
    text: '¿Cuál fue la intensidad máxima del dolor hoy?',
    type: 'slider_labeled',
    conditional: true,
    sliderMin: 0,
    sliderMax: 10,
    sliderLabels: [
      { range: [0, 3], label: 'Leve' },
      { range: [4, 7], label: 'Moderado' },
      { range: [8, 10], label: 'Severo' },
    ],
  },
  {
    id: 'q2_2_duration',
    text: '¿Cuántas horas duró el dolor hoy?',
    type: 'time_picker',
    conditional: true,
    options: [
      { value: '<1_hora', label: '<1 hora' },
      { value: '1-24_horas', label: '1-24 horas' },
    ],
  },
  {
    id: 'q3_pain_characteristics',
    text: '¿Cómo sentiste el dolor hoy? (Marca todas las que apliquen)',
    type: 'checkbox',
    conditional: true,
    options: [
      { value: 'pulsatil', label: 'Sentí latidos, pulsaciones o pum-pum en la cabeza (Pulsátil)' },
      { value: 'unilateral', label: 'El dolor estaba solo en un lado de la cabeza (Unilateral)' },
      { value: 'agravamiento_actividad', label: 'El dolor empeoró al moverme, caminar o agacharme (Agravamiento por actividad física)' },
      { value: 'ninguna', label: 'Ninguna de las anteriores', exclusive: true },
      { value: 'otra', label: 'Otra opción (especifique)', hasTextInput: true },
    ],
  },
  {
    id: 'q4_symptoms',
    text: '¿Notaste alguno de estos síntomas junto con el dolor?',
    type: 'checkbox',
    conditional: true,
    options: [
      { value: 'luz_ruido', label: 'Me molestaba mucho la luz /o el ruido' },
      { value: 'nauseas', label: 'Tuve náuseas o ganas de vomitar' },
      { value: 'ninguno', label: 'Ninguno', exclusive: true },
    ],
  },
  {
    id: 'q5_1_activity_impact',
    text: '¿El dolor te impidió realizar tus actividades normales hoy (trabajo, estudio, casa)?',
    type: 'slider_labeled',
    conditional: true,
    sliderMin: 0,
    sliderMax: 10,
    sliderLabels: [
      { range: [0, 1], label: 'No' },
      { range: [2, 5], label: 'Sí, un poco' },
      { range: [6, 10], label: 'Sí, totalmente' },
    ],
  },
  {
    id: 'q5_2_medication',
    text: '¿Tomaste alguna medicación para el dolor hoy?',
    type: 'checkbox_nested',
    conditional: true,
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
    id: 'q6_pain_management',
    text: 'Además de la medicación (si aplica), ¿qué otras medidas tomaste hoy para intentar aliviar tu dolor de cabeza? (Selecciona todas las que apliquen)',
    type: 'checkbox',
    conditional: true,
    options: [
      { value: 'dormir_descansar', label: 'Dormir o descansar' },
      { value: 'aislarme', label: 'Aislarme en un lugar oscuro o silencioso (Disminuir la luz y el ruido)' },
      { value: 'compresas', label: 'Aplicar compresas (Frías o calientes)' },
      { value: 'relajacion', label: 'Ejercicios de relajación (Respiración, meditación, estiramientos suaves)' },
      { value: 'remedios_caseros', label: 'Remedios caseros (Por favor, especifica: ej. té de hierbas, aceites esenciales, cafeína, etc.)', hasTextInput: true },
      { value: 'otro', label: 'Otra opción (especifique)', hasTextInput: true },
      { value: 'nada_mas', label: 'No hice nada más', exclusive: true },
    ],
  },
  {
    id: 'q7_triggers',
    text: '¿Identificas algún desencadenante? (Marca todos los que apliquen)',
    type: 'checkbox',
    conditional: true,
    options: [
      { value: 'estres', label: 'Estrés' },
      { value: 'falta_sueno', label: 'Falta de sueño o mal descanso' },
      { value: 'clima', label: 'Cambios de clima o presión' },
      { value: 'comida', label: 'Algún alimento o bebida' },
      { value: 'menstruacion', label: 'Menstruación' },
      { value: 'pantallas', label: 'Pantallas o luz intensa' },
      { value: 'otro', label: 'Otro', hasTextInput: true },
      { value: 'ninguno', label: 'No identifico ninguno', exclusive: true },
    ],
  },
  // 3. Estado General (No Condicional)
  {
    id: 'q_sleep',
    text: '¿Cuántas horas dormiste anoche?',
    type: 'slider_labeled',
    conditional: false,
    sliderMin: 0,
    sliderMax: 12,
    sliderLabels: [
      { range: [0, 3], label: 'Muy poco' },
      { range: [4, 6], label: 'Poco' },
      { range: [7, 9], label: 'Normal' },
      { range: [10, 12], label: 'Mucho' },
    ],
  },
  {
    id: 'q_stress',
    text: '¿Qué tan estresado te sientes hoy?',
    type: 'slider_labeled',
    conditional: false,
    sliderMin: 0,
    sliderMax: 10,
    sliderLabels: [
      { range: [0, 3], label: 'Leve' },
      { range: [4, 7], label: 'Moderado' },
      { range: [8, 10], label: 'Severo' },
    ],
  },
  {
    id: 'q_alcohol',
    text: '¿Has consumido alcohol?',
    helperText: 'Piensa en tu consumo normal de cualquier bebida (cerveza, vino, licor).',
    type: 'slider_labeled',
    conditional: false,
    sliderMin: 0,
    sliderMax: 10,
    sliderLabels: [
      { range: [0, 0], label: 'Nada en absoluto' },
      { range: [1, 5], label: 'Mi consumo habitual' },
      { range: [6, 10], label: 'Mucho más de lo habitual' },
    ],
  },
  {
    id: 'q_caffeine',
    text: '¿Cuántas tazas de café tomaste?',
    type: 'slider_labeled',
    conditional: false,
    sliderMin: 0,
    sliderMax: 5,
    sliderLabels: [
      { range: [0, 0], label: 'Ninguna' },
      { range: [1, 3], label: 'Moderado' },
      { range: [4, 5], label: 'Alto' },
    ],
  },
];

// Default values for each question type - all start unselected
function getDefaultAnswer(question: Question): AnswerValue | null {
  switch (question.type) {
    case 'yesno':
      return null; // No preselection
    case 'yesno_with_text':
      return ''; // Empty string = no selection
    case 'slider':
    case 'slider_labeled':
      // No preselection: a value counts only once the user sets it.
      return null;
    case 'multiple_choice':
      return ''; // Empty string = no selection
    case 'checkbox':
      return [];
    case 'time_picker':
      return ''; // Empty string = no selection
    case 'checkbox_nested':
      return []; // Empty array = no selection
    default:
      return '';
  }
}

// Validation function to check if an answer is valid/complete
function isAnswerValid(question: Question, answer: AnswerValue | null | undefined): boolean {
  if (answer === null || answer === undefined) return false;
  
  switch (question.type) {
    case 'yesno':
      return typeof answer === 'boolean';
    case 'yesno_with_text':
      return answer !== ''; // Must have selected yes or no
    case 'slider':
    case 'slider_labeled':
      // '' means the user chose "Prefiero no responder".
      return typeof answer === 'number' || answer === '';
    case 'multiple_choice':
      return answer !== '';
    case 'checkbox':
      return Array.isArray(answer) && answer.length > 0;
    case 'time_picker':
      return answer !== '';
    case 'checkbox_nested':
      return Array.isArray(answer) && answer.length > 0;
    default:
      return true;
  }
}

// Yes/No Button Component
type ColorSchemeType = 'light' | 'dark' | null | undefined;

interface YesNoButtonsProps {
  value: boolean | null;
  onChange: (value: boolean) => void;
  colorScheme: ColorSchemeType;
}

function YesNoButtons({ value, onChange, colorScheme }: YesNoButtonsProps) {
  const tint = Colors[colorScheme ?? 'light'].tint;
  const isNo = value === false;
  const isYes = value === true;
  
  return (
    <View style={styles.yesNoContainer}>
      <Pressable
        onPress={() => onChange(false)}
        style={[
          styles.yesNoButton,
          isNo && { backgroundColor: tint },
        ]}
      >
        <Text style={[
          styles.yesNoText,
          isNo && { color: colorScheme === 'dark' ? '#000' : '#fff' },
        ]}>
          No
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange(true)}
        style={[
          styles.yesNoButton,
          isYes && { backgroundColor: tint },
        ]}
      >
        <Text style={[
          styles.yesNoText,
          isYes && { color: colorScheme === 'dark' ? '#000' : '#fff' },
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
  colorScheme: ColorSchemeType;
}

function YesNoWithText({ value, onChange, colorScheme }: YesNoWithTextProps) {
  const isNo = value === 'no';
  const isYes = value !== 'no' && value !== '';
  const medicationText = isYes && value !== 'yes' ? value : '';
  const tint = Colors[colorScheme ?? 'light'].tint;
  
  return (
    <View style={styles.yesNoWithTextContainer}>
      <View style={styles.yesNoContainer}>
        <Pressable
          onPress={() => onChange('no')}
          style={[
            styles.yesNoButton,
            isNo && { backgroundColor: tint },
          ]}
        >
          <Text style={[
            styles.yesNoText,
            isNo && { color: colorScheme === 'dark' ? '#000' : '#fff' },
          ]}>
            No
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange('yes')}
          style={[
            styles.yesNoButton,
            isYes && { backgroundColor: tint },
          ]}
        >
          <Text style={[
            styles.yesNoText,
            isYes && { color: colorScheme === 'dark' ? '#000' : '#fff' },
          ]}>
            Sí
          </Text>
        </Pressable>
      </View>
      {isYes && (
        <TextInput
          style={[
            styles.textInput,
            { 
              color: Colors[colorScheme ?? 'light'].text,
              borderColor: tint,
            },
          ]}
          placeholder="¿Cuál medicación?"
          placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
          value={medicationText}
          onChangeText={(text) => onChange(text || 'yes')}
        />
      )}
    </View>
  );
}

// Labeled Slider Component
interface LabeledSliderProps {
  /** null: untouched; '': explicitly skipped; number: chosen value */
  value: number | '' | null;
  onChange: (value: number | '') => void;
  min: number;
  max: number;
  labels?: { range: [number, number]; label: string }[];
  colorScheme: ColorSchemeType;
}

function LabeledSlider({ value, onChange, min, max, labels, colorScheme }: LabeledSliderProps) {
  const tint = Colors[colorScheme ?? 'light'].tint;
  const hasValue = typeof value === 'number';
  const skipped = value === '';
  // The thumb rests in the middle, but that position is not an answer until touched.
  const displayValue = hasValue ? value : Math.round((min + max) / 2);
  
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
                <Text style={[styles.sliderRangeLabel, { color: tint }]}>
                  {currentLabel}
                </Text>
              )}
            </>
          ) : (
            <Text style={[styles.sliderValue, { opacity: 0.4 }]}>{skipped ? 'Sin respuesta' : '—'}</Text>
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
        accessibilityLabel="Seleccionar valor"
        style={[styles.slider, !hasValue && { opacity: 0.5 }]}
        minimumValue={min}
        maximumValue={max}
        value={displayValue}
        onValueChange={(v) => onChange(Math.round(v))}
        // Touching the thumb without moving it selects the value shown.
        onSlidingStart={() => {
          if (!hasValue) onChange(displayValue);
        }}
        minimumTrackTintColor={hasValue ? tint : (colorScheme === 'dark' ? '#555' : '#ddd')}
        maximumTrackTintColor={colorScheme === 'dark' ? '#555' : '#ddd'}
        thumbTintColor={hasValue ? tint : (colorScheme === 'dark' ? '#888' : '#bbb')}
      />
      {!hasValue && !skipped && (
        <Text style={styles.sliderHint}>Desliza para seleccionar</Text>
      )}
      <Pressable accessibilityRole="button" onPress={() => onChange('')} style={styles.sliderSkip}>
        <Text style={[styles.sliderHint, skipped && { color: tint, fontWeight: '600' }]}>
          Prefiero no responder
        </Text>
      </Pressable>
    </View>
  );
}

// Multiple Choice Component
interface MultipleChoiceProps {
  options: QuestionOption[];
  value: string;
  onChange: (value: string) => void;
  colorScheme: ColorSchemeType;
}

function MultipleChoice({ options, value, onChange, colorScheme }: MultipleChoiceProps) {
  const tint = Colors[colorScheme ?? 'light'].tint;
  
  return (
    <View style={styles.multipleChoiceContainer}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => onChange(option.value)}
          style={[
            styles.multipleChoiceOption,
            value === option.value && { backgroundColor: tint, borderColor: tint },
          ]}
        >
          <Text style={[
            styles.multipleChoiceText,
            value === option.value && { color: colorScheme === 'dark' ? '#000' : '#fff' },
          ]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// Time Picker Component for duration questions
interface TimePickerProps {
  options: QuestionOption[];
  value: string;
  onChange: (value: string) => void;
  colorScheme: ColorSchemeType;
}

function TimePicker({ options, value, onChange, colorScheme }: TimePickerProps) {
  const tint = Colors[colorScheme ?? 'light'].tint;
  const [showPicker, setShowPicker] = useState(false);
  const [selectedHours, setSelectedHours] = useState(1);
  const [tempValue, setTempValue] = useState(value);
  
  // Parse current value to get hours if it's a number
  const parseHours = (val: string): number => {
    if (val === '<1_hora') return 0;
    const match = val.match(/^(\d+)_horas?$/);
    return match ? parseInt(match[1], 10) : 1;
  };

  const handleOptionSelect = (optionValue: string) => {
    if (optionValue === '1-24_horas') {
      setSelectedHours(parseHours(value) || 1);
      setShowPicker(true);
    } else {
      onChange(optionValue);
    }
  };

  const handlePickerConfirm = () => {
    onChange(`${selectedHours}_horas`);
    setShowPicker(false);
  };

  const getDisplayValue = (): string => {
    if (value === '<1_hora') return '<1 hora';
    if (value === '') return '';
    const hours = parseHours(value);
    if (hours > 0) return `${hours} hora${hours > 1 ? 's' : ''}`;
    return value;
  };
  
  return (
    <View style={styles.timePickerContainer}>
      {options.map((option) => {
        const isSelected = option.value === '<1_hora' 
          ? value === '<1_hora' 
          : value !== '' && value !== '<1_hora';
        return (
          <Pressable
            key={option.value}
            onPress={() => handleOptionSelect(option.value)}
            style={[
              styles.multipleChoiceOption,
              isSelected && { backgroundColor: tint, borderColor: tint },
            ]}
          >
            <Text style={[
              styles.multipleChoiceText,
              isSelected && { color: colorScheme === 'dark' ? '#000' : '#fff' },
            ]}>
              {option.value === '1-24_horas' && value !== '' && value !== '<1_hora' 
                ? getDisplayValue() 
                : option.label}
            </Text>
          </Pressable>
        );
      })}
      
      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
            <Text style={[styles.modalTitle, { color: Colors[colorScheme ?? 'light'].text }]}>
              Selecciona la duración
            </Text>
            <View style={styles.hoursPickerContainer}>
              <Pressable 
                onPress={() => setSelectedHours(Math.max(1, selectedHours - 1))}
                style={[styles.hourButton, { borderColor: tint }]}
              >
                <FontAwesome name="minus" size={20} color={tint} />
              </Pressable>
              <View style={styles.hoursDisplay}>
                <Text style={[styles.hoursValue, { color: Colors[colorScheme ?? 'light'].text }]}>
                  {selectedHours}
                </Text>
                <Text style={[styles.hoursLabel, { color: Colors[colorScheme ?? 'light'].text }]}>
                  hora{selectedHours > 1 ? 's' : ''}
                </Text>
              </View>
              <Pressable 
                onPress={() => setSelectedHours(Math.min(24, selectedHours + 1))}
                style={[styles.hourButton, { borderColor: tint }]}
              >
                <FontAwesome name="plus" size={20} color={tint} />
              </Pressable>
            </View>
            <View style={styles.modalButtons}>
              <Pressable 
                onPress={() => setShowPicker(false)}
                style={[styles.modalButton, styles.modalButtonCancel]}
              >
                <Text style={styles.modalButtonCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable 
                onPress={handlePickerConfirm}
                style={[styles.modalButton, { backgroundColor: tint }]}
              >
                <Text style={[styles.modalButtonText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>
                  Confirmar
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Checkbox Group Component with text input support
interface CheckboxGroupProps {
  options: QuestionOption[];
  value: string[];
  onChange: (value: string[]) => void;
  colorScheme: ColorSchemeType;
  textInputs?: Record<string, string>;
  onTextInputChange?: (optionValue: string, text: string) => void;
}

function CheckboxGroup({ options, value, onChange, colorScheme, textInputs = {}, onTextInputChange }: CheckboxGroupProps) {
  const tint = Colors[colorScheme ?? 'light'].tint;
  
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
                isChecked && { backgroundColor: `${tint}20`, borderColor: tint },
              ]}
            >
              <View style={[
                styles.checkbox,
                isChecked && { backgroundColor: tint, borderColor: tint },
              ]}>
                {isChecked && (
                  <FontAwesome name="check" size={12} color={colorScheme === 'dark' ? '#000' : '#fff'} />
                )}
              </View>
              <Text style={styles.checkboxText}>{option.label}</Text>
            </Pressable>
            {option.hasTextInput && isChecked && onTextInputChange && (
              <TextInput
                style={[
                  styles.checkboxTextInput,
                  { 
                    color: Colors[colorScheme ?? 'light'].text,
                    borderColor: tint,
                  },
                ]}
                placeholder="Especifique..."
                placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
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
  colorScheme: ColorSchemeType;
  textInputs?: Record<string, string>;
  onTextInputChange?: (optionValue: string, text: string) => void;
}

function CheckboxNested({ options, value, onChange, colorScheme, textInputs = {}, onTextInputChange }: CheckboxNestedProps) {
  const tint = Colors[colorScheme ?? 'light'].tint;
  
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
  const isNoSelected = value.includes('no');

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
                isSelected && { backgroundColor: `${tint}20`, borderColor: tint },
              ]}
            >
              <View style={[
                styles.checkbox,
                isSelected && { backgroundColor: tint, borderColor: tint },
              ]}>
                {isSelected && (
                  <FontAwesome name="check" size={12} color={colorScheme === 'dark' ? '#000' : '#fff'} />
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
                          isSubChecked && { backgroundColor: `${tint}20`, borderColor: tint },
                        ]}
                      >
                        <View style={[
                          styles.checkbox,
                          isSubChecked && { backgroundColor: tint, borderColor: tint },
                        ]}>
                          {isSubChecked && (
                            <FontAwesome name="check" size={12} color={colorScheme === 'dark' ? '#000' : '#fff'} />
                          )}
                        </View>
                        <Text style={styles.checkboxText}>{subOption.label}</Text>
                      </Pressable>
                      {subOption.hasTextInput && isSubChecked && onTextInputChange && (
                        <TextInput
                          style={[
                            styles.checkboxTextInput,
                            styles.subOptionTextInput,
                            { 
                              color: Colors[colorScheme ?? 'light'].text,
                              borderColor: tint,
                            },
                          ]}
                          placeholder="Especifique..."
                          placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
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

export default function CheckinScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [userSex, setUserSex] = useState<'male' | 'female' | null>(null);
  useEffect(() => { getUserSex().then(setUserSex); }, []);

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Map<string, AnswerValue | null>>(() => {
    const initial = new Map<string, AnswerValue | null>();
    QUESTIONS.forEach(q => {
      initial.set(q.id, getDefaultAnswer(q));
    });
    return initial;
  });
  // Text inputs for checkbox options with hasTextInput
  const [textInputs, setTextInputs] = useState<Record<string, Record<string, string>>>({});

  // Get the active questions based on Q1 answer
  const activeQuestions = useMemo(() => {
    const hadHeadache = answers.get('q1_headache') === true;
    return QUESTIONS
      .filter(q => !q.conditional || hadHeadache)
      .map(q => {
        if (userSex === 'male' && q.id === 'q7_triggers' && q.options) {
          return { ...q, options: q.options.filter(o => o.value !== 'menstruacion') };
        }
        return q;
      });
  }, [answers, userSex]);

  const { saving, save } = useGuardedSave();
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
    // Validate current answer before proceeding; ignore taps while a save is in flight
    if (!isCurrentAnswerValid || saving) {
      return;
    }
    
    if (isLastStep) {
      // Submit answers and close modal
      const questionTexts = activeQuestions.map(q => q.text);
      const answerValues = activeQuestions.map(q => {
        const answer = answers.get(q.id);
        // Convert null to appropriate default for storage
        if (answer === null) {
          return q.type === 'checkbox' ? [] : '';
        }
        return answer;
      }) as AnswerValue[];
      // Only leave once the save succeeded; on failure the answers stay on screen.
      if (await save(() => saveCheckIn(answerValues, questionTexts))) {
        router.back();
      }
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
            colorScheme={colorScheme}
          />
        );
      
      case 'yesno_with_text':
        return (
          <YesNoWithText
            value={(currentAnswer as string) ?? ''}
            onChange={updateAnswer}
            colorScheme={colorScheme}
          />
        );
      
      case 'slider':
      case 'slider_labeled':
        return (
          <LabeledSlider
            value={currentAnswer as number | '' | null}
            onChange={updateAnswer}
            min={currentQuestion.sliderMin ?? 0}
            max={currentQuestion.sliderMax ?? 10}
            labels={currentQuestion.sliderLabels}
            colorScheme={colorScheme}
          />
        );
      
      case 'multiple_choice':
        return (
          <MultipleChoice
            options={currentQuestion.options ?? []}
            value={(currentAnswer as string) ?? ''}
            onChange={updateAnswer}
            colorScheme={colorScheme}
          />
        );
      
      case 'checkbox':
        return (
          <CheckboxGroup
            options={currentQuestion.options ?? []}
            value={(currentAnswer as string[]) ?? []}
            onChange={updateAnswer}
            colorScheme={colorScheme}
            textInputs={currentTextInputs}
            onTextInputChange={handleTextInputChange}
          />
        );
      
      case 'time_picker':
        return (
          <TimePicker
            options={currentQuestion.options ?? []}
            value={(currentAnswer as string) ?? ''}
            onChange={updateAnswer}
            colorScheme={colorScheme}
          />
        );
      
      case 'checkbox_nested':
        return (
          <CheckboxNested
            options={currentQuestion.options ?? []}
            value={(currentAnswer as string[]) ?? []}
            onChange={updateAnswer}
            colorScheme={colorScheme}
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
              color={Colors[colorScheme ?? 'light'].text}
              style={{ opacity: pressed ? 0.5 : 1 }}
            />
          )}
        </Pressable>
        <Text style={styles.stepIndicator}>
          {currentStep + 1} / {activeQuestions.length}
        </Text>
        <View style={styles.placeholder} />
      </View>

      {/* Question Content */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.questionText}>{currentQuestion.text}</Text>
        {currentQuestion.helperText && (
          <Text style={[styles.helperText, { color: Colors[colorScheme ?? 'light'].text }]}>
            {currentQuestion.helperText}
          </Text>
        )}
        {renderQuestionInput()}
      </ScrollView>

      {/* Footer with Next/End button */}
      <View style={styles.footer}>
        <Pressable
          onPress={handleNext}
          disabled={!isCurrentAnswerValid || saving}
          style={({ pressed }) => [
            styles.nextButton,
            { backgroundColor: Colors[colorScheme ?? 'light'].tint },
            pressed && isCurrentAnswerValid && styles.nextButtonPressed,
            (!isCurrentAnswerValid || saving) && styles.nextButtonDisabled,
          ]}
        >
          <Text style={[
            styles.nextButtonText,
            { color: colorScheme === 'dark' ? '#000' : '#fff' },
            !isCurrentAnswerValid && styles.nextButtonTextDisabled,
          ]}>
            {saving ? 'Guardando…' : isLastStep ? 'Finalizar' : 'Siguiente'}
          </Text>
        </Pressable>
      </View>

      {/* Use a light status bar on iOS to account for the black space above the modal */}
      <StatusBar style={Platform.OS === 'ios' ? 'auto' : 'auto'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  backButton: {
    padding: 10,
  },
  stepIndicator: {
    fontSize: 16,
    fontWeight: '600',
  },
  placeholder: {
    width: 44, // Same as back button for centering
  },
  scrollView: {
    flex: 1,
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
  },
  helperText: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  // Yes/No styles
  yesNoContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  yesNoButton: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(128, 128, 128, 0.3)',
    minWidth: 100,
    alignItems: 'center',
  },
  yesNoText: {
    fontSize: 18,
    fontWeight: '600',
  },
  // Yes/No with Text styles
  yesNoWithTextContainer: {
    gap: 20,
  },
  textInput: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  // Slider styles
  sliderContainer: {
    width: '100%',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sliderLabel: {
    fontSize: 14,
    opacity: 0.6,
  },
  sliderValueContainer: {
    alignItems: 'center',
  },
  sliderValue: {
    fontSize: 32,
    fontWeight: 'bold',
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
  },
  rangeLabelText: {
    fontSize: 12,
    opacity: 0.6,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  // Multiple Choice styles
  multipleChoiceContainer: {
    gap: 12,
  },
  multipleChoiceOption: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(128, 128, 128, 0.3)',
    alignItems: 'center',
  },
  multipleChoiceText: {
    fontSize: 16,
    fontWeight: '500',
  },
  // Checkbox styles
  checkboxContainer: {
    gap: 12,
  },
  checkboxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(128, 128, 128, 0.3)',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(128, 128, 128, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxText: {
    fontSize: 14,
    flex: 1,
  },
  checkboxTextInput: {
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    marginTop: 8,
    marginLeft: 36,
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
  // Time Picker styles
  timePickerContainer: {
    gap: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  hoursPickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 32,
  },
  hourButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoursDisplay: {
    alignItems: 'center',
    minWidth: 80,
  },
  hoursValue: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  hoursLabel: {
    fontSize: 16,
    opacity: 0.7,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.7,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Footer styles
  footer: {
    paddingHorizontal: 30,
    paddingBottom: 40,
    paddingTop: 20,
  },
  nextButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
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
  },
  nextButtonTextDisabled: {
    opacity: 0.8,
  },
  sliderSkip: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  sliderHint: {
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.6,
    marginTop: 8,
  },
});
