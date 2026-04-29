/**
 * Generates docs/MigraineTrack_Guia_Medica.docx
 *
 * Spanish-language clinical overview of the MigraineTrack app, aimed at
 * medical professionals. Covers user flows, ICHD-3 migraine scoring,
 * tension-headache cumulative-load algorithm, reporting, and privacy.
 *
 * The `docx` package is intentionally NOT tracked in package.json. Install
 * it on demand before regenerating the document:
 *
 *   npm install --no-save docx
 *   node scripts/generate-medical-doc.js
 */

const fs = require('fs');
const path = require('path');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  PageNumber,
  Paragraph,
  Packer,
  ShadingType,
  StyleLevel,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');

// ---------------------------------------------------------------------------
// Layout constants (DXA: 1 inch = 1440)
// ---------------------------------------------------------------------------

const PAGE_WIDTH_DXA = 11906;          // A4
const PAGE_HEIGHT_DXA = 16838;         // A4
const MARGIN_DXA = 1440;
const CONTENT_WIDTH_DXA = PAGE_WIDTH_DXA - MARGIN_DXA * 2; // 9026

const COLOR_PRIMARY = '1565C0';
const COLOR_ACCENT = 'C62828';
const COLOR_MUTED = '666666';
const COLOR_TEXT = '1A1A1A';
const COLOR_TABLE_HEADER_BG = 'E3F2FD';
const COLOR_PLACEHOLDER_BG = 'F5F5F5';
const COLOR_PLACEHOLDER_BORDER = 'BDBDBD';
const COLOR_FORMULA_BG = 'FAFAFA';
const COLOR_NOTE_BG = 'FFF8E1';
const COLOR_NOTE_BORDER = 'F57F17';

// ---------------------------------------------------------------------------
// Paragraph / run helpers
// ---------------------------------------------------------------------------

function t(text, opts = {}) {
  return new TextRun({ text, ...opts });
}

function p(text, opts = {}) {
  const runs = Array.isArray(text) ? text : [t(text, opts.run || {})];
  return new Paragraph({
    children: runs,
    spacing: { before: 80, after: 120, line: 300 },
    alignment: opts.alignment,
    ...opts.paragraph,
  });
}

function h1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { before: 0, after: 240 },
  });
}

function h2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
  });
}

function h3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 100 },
  });
}

function bullet(text, level = 0) {
  const runs = Array.isArray(text) ? text : [t(text)];
  return new Paragraph({
    children: runs,
    numbering: { reference: 'bullet-list', level },
    spacing: { before: 40, after: 40, line: 280 },
  });
}

function numbered(text, level = 0) {
  const runs = Array.isArray(text) ? text : [t(text)];
  return new Paragraph({
    children: runs,
    numbering: { reference: 'ordered-list', level },
    spacing: { before: 40, after: 40, line: 280 },
  });
}

function spacer(size = 120) {
  return new Paragraph({ children: [t('')], spacing: { before: 0, after: size } });
}

// ---------------------------------------------------------------------------
// Callouts (formula box, note box, screenshot placeholder) — single-cell tables
// ---------------------------------------------------------------------------

function calloutBox({ children, fill = COLOR_FORMULA_BG, border = COLOR_PLACEHOLDER_BORDER, borderStyle = BorderStyle.SINGLE }) {
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH_DXA],
    borders: {
      top: { style: borderStyle, size: 6, color: border },
      bottom: { style: borderStyle, size: 6, color: border },
      left: { style: borderStyle, size: 6, color: border },
      right: { style: borderStyle, size: 6, color: border },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill },
            margins: { top: 160, bottom: 160, left: 240, right: 240 },
            children,
          }),
        ],
      }),
    ],
  });
}

function formula(expression, caption) {
  const children = [
    new Paragraph({
      children: [t(expression, { font: 'Consolas', size: 22, bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: caption ? 60 : 40 },
    }),
  ];
  if (caption) {
    children.push(
      new Paragraph({
        children: [t(caption, { italics: true, size: 18, color: COLOR_MUTED })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
      }),
    );
  }
  return calloutBox({ children, fill: COLOR_FORMULA_BG });
}

function noteBox(lines) {
  const children = lines.map((line, i) => {
    const runs = Array.isArray(line) ? line : [t(line)];
    return new Paragraph({
      children: runs,
      spacing: { before: i === 0 ? 0 : 60, after: 40, line: 280 },
    });
  });
  return calloutBox({ children, fill: COLOR_NOTE_BG, border: COLOR_NOTE_BORDER });
}

function screenshotPlaceholder(label, description) {
  const children = [
    new Paragraph({
      children: [t('[ Captura de pantalla ]', { bold: true, color: COLOR_MUTED, size: 20 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 80 },
    }),
    new Paragraph({
      children: [t(label, { bold: true, size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
    }),
    new Paragraph({
      children: [t(description, { italics: true, size: 18, color: COLOR_MUTED })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
    }),
  ];
  return calloutBox({
    children,
    fill: COLOR_PLACEHOLDER_BG,
    border: COLOR_PLACEHOLDER_BORDER,
    borderStyle: BorderStyle.DASHED,
  });
}

// ---------------------------------------------------------------------------
// Data tables
// ---------------------------------------------------------------------------

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLOR_TABLE_HEADER_BG },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [t(text, { bold: true, size: 20 })],
        spacing: { before: 0, after: 0 },
      }),
    ],
  });
}

function bodyCell(value, width) {
  const children = Array.isArray(value)
    ? value
    : [
        new Paragraph({
          children: [t(String(value), { size: 20 })],
          spacing: { before: 0, after: 0, line: 260 },
        }),
      ];
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children,
  });
}

/**
 * Simple data table.
 * @param headers array of header strings
 * @param rows    array of rows, each an array of strings or Paragraph[] arrays
 * @param widths  array of DXA widths summing to CONTENT_WIDTH_DXA
 */
function dataTable(headers, rows, widths) {
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'BDBDBD' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BDBDBD' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'BDBDBD' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'BDBDBD' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E0E0E0' },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'E0E0E0' },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => headerCell(h, widths[i])),
      }),
      ...rows.map(
        row =>
          new TableRow({
            children: row.map((cell, i) => bodyCell(cell, widths[i])),
          }),
      ),
    ],
  });
}

function bulletsCell(items) {
  return items.map(
    text =>
      new Paragraph({
        children: [t('• ' + text, { size: 20 })],
        spacing: { before: 20, after: 20, line: 260 },
      }),
  );
}

// ---------------------------------------------------------------------------
// Cover page
// ---------------------------------------------------------------------------

function coverPage() {
  return [
    new Paragraph({
      children: [t('')],
      spacing: { before: 2400, after: 0 },
    }),
    new Paragraph({
      children: [t('MigraineTrack', { bold: true, size: 60, color: COLOR_PRIMARY })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
    }),
    new Paragraph({
      children: [
        t('Guía clínica: funciones, flujos y algoritmos', {
          size: 32,
          color: COLOR_TEXT,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 400 },
    }),
    new Paragraph({
      children: [
        t(
          'Documento técnico-clínico para profesionales sanitarios. ' +
            'Describe los flujos de usuario, los algoritmos de evaluación de migraña y ' +
            'cefalea tipo tensión, y los informes disponibles para el clínico.',
          { italics: true, size: 22, color: COLOR_MUTED },
        ),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 1200 },
    }),
    new Paragraph({
      children: [t('Organización: Two Oceans In Health', { size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
    }),
    new Paragraph({
      children: [t('Versión del documento: 1.0', { size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
    }),
    new Paragraph({
      children: [t(`Fecha: ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}`, { size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 600 },
    }),
    noteBox([
      [
        t('Aviso clínico. ', { bold: true, color: COLOR_ACCENT }),
        t(
          'La información que genera la app es orientativa y no constituye un diagnóstico. ' +
            'La evaluación definitiva debe realizarla un profesional sanitario a la luz de la ' +
            'historia clínica y la exploración. Los criterios ICHD-3 implementados se limitan a ' +
            'los criterios B–D por evento; el criterio A (≥5 ataques) no se evalúa por registro individual.',
        ),
      ],
    ]),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ---------------------------------------------------------------------------
// Table of contents
// ---------------------------------------------------------------------------

function tocSection() {
  return [
    new Paragraph({
      text: 'Índice',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 0, after: 200 },
    }),
    new TableOfContents('Índice', {
      hyperlink: true,
      headingStyleRange: '1-3',
      stylesWithLevels: [
        new StyleLevel('Heading1', 1),
        new StyleLevel('Heading2', 2),
        new StyleLevel('Heading3', 3),
      ],
    }),
    new Paragraph({
      children: [
        t(
          'Si el índice aparece vacío al abrir el documento, haga clic derecho sobre él y seleccione “Actualizar campos”.',
          { italics: true, size: 18, color: COLOR_MUTED },
        ),
      ],
      spacing: { before: 200, after: 0 },
    }),
  ];
}

// ---------------------------------------------------------------------------
// 1. Resumen ejecutivo
// ---------------------------------------------------------------------------

function executiveSummary() {
  return [
    h1('1. Resumen ejecutivo'),
    p(
      'MigraineTrack es una aplicación móvil en español (iOS y Android) diseñada para ayudar ' +
        'a pacientes con cefaleas recurrentes a registrar síntomas, anticipar episodios y ' +
        'compartir informes estructurados con su equipo sanitario. La app combina dos ' +
        'herramientas clínicas:',
    ),
    bullet([
      t('Evaluación de migraña por episodio ', { bold: true }),
      t('basada en los criterios diagnósticos B–D de la ICHD-3, que produce un score 0–100 y una probabilidad de migraña.'),
    ]),
    bullet([
      t('Predicción de cefalea tipo tensión ', { bold: true }),
      t('mediante un modelo de carga acumulada (CL) con umbral personalizado que se ajusta con los datos del propio paciente.'),
    ]),
    p(
      'Además, la app incluye un modo crisis por voz para episodios con fotofobia, un diario visual ' +
        'de episodios, una biblioteca educativa, y un informe médico exportable en PDF para períodos ' +
        'de 30, 60 o 90 días. El backend está implementado con Supabase (PostgreSQL + Row Level Security).',
    ),
    h2('1.1 Público objetivo'),
    p(
      'Pacientes adolescentes y adultos con cefalea primaria recurrente (migraña episódica/crónica ' +
        'y cefalea tipo tensión), y los profesionales de atención primaria, neurología y ' +
        'medicina interna que les atienden.',
    ),
    h2('1.2 Beneficios clínicos esperados'),
    bullet('Registro estructurado y longitudinal de episodios, síntomas, desencadenantes, ' +
      'estilo de vida y medicación.'),
    bullet('Diferenciación automática entre episodios con alta probabilidad de migraña ' +
      '(ICHD-3 B–D) y cefaleas no migrañosas.'),
    bullet('Detección temprana de patrones crónicos (≥15 días/mes) y de posible ' +
      'cefalea por uso excesivo de medicación (MOH, ≥10 días/mes con analgésicos).'),
    bullet('Informe clínico estandarizado listo para la consulta.'),
  ];
}

// ---------------------------------------------------------------------------
// 2. Arquitectura funcional
// ---------------------------------------------------------------------------

function architecture() {
  return [
    h1('2. Arquitectura funcional'),
    p(
      'La aplicación se estructura en tres capas: (1) una capa de registro (check-in diario y ' +
        'registro de crisis), (2) una capa de análisis (algoritmos de migraña y cefalea tipo ' +
        'tensión, con actualización dinámica del umbral del paciente), y (3) una capa de ' +
        'presentación (pantalla de inicio, diario, informes y biblioteca).',
    ),
    h2('2.1 Diagrama funcional'),
    p(
      'El siguiente esquema resume el flujo de datos desde la entrada del paciente hasta el ' +
        'informe entregado al clínico.',
    ),
    calloutBox({
      fill: COLOR_FORMULA_BG,
      children: [
        new Paragraph({
          children: [t('Paciente', { bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 40, after: 40 },
        }),
        new Paragraph({
          children: [t('↓', { size: 24 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
        }),
        new Paragraph({
          children: [t('Check-in diario   /   Registro de crisis (visual o por voz)', { bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 40, after: 40 },
        }),
        new Paragraph({
          children: [t('↓', { size: 24 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
        }),
        new Paragraph({
          children: [t('Evaluación de migraña (ICHD-3 B–D)   →   score 0–100', { bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 40, after: 40 },
        }),
        new Paragraph({
          children: [t('↓', { size: 24 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
        }),
        new Paragraph({
          children: [t('¿Score ≥ 40 o mayHaveMigraine = true?', { bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 40, after: 40 },
        }),
        new Paragraph({
          children: [
            t('SÍ → se muestra riesgo de migraña y se silencia el modelo de tensión', { size: 20 }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 20 },
        }),
        new Paragraph({
          children: [
            t('NO → se calcula Carga Acumulada (CL) vs. umbral del paciente', { size: 20 }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 40 },
        }),
        new Paragraph({
          children: [t('↓', { size: 24 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
        }),
        new Paragraph({
          children: [t('Persistencia en Supabase (RLS por usuario)', { bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 40, after: 40 },
        }),
        new Paragraph({
          children: [t('↓', { size: 24 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
        }),
        new Paragraph({
          children: [t('Pantalla Inicio   /   Diario   /   Informe PDF al clínico', { bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 40, after: 40 },
        }),
      ],
    }),
    h2('2.2 Módulos principales'),
    dataTable(
      ['Módulo', 'Ruta en el código', 'Función clínica'],
      [
        ['Pantalla Inicio', 'app/(tabs)/index.tsx', 'Score de migraña, zona de riesgo y accesos rápidos.'],
        ['Check-in diario', 'app/checkin.tsx', 'Cuestionario corto con sección condicional de dolor.'],
        ['Registro de crisis (visual)', 'app/crisis.tsx', 'Formulario detallado durante un ataque activo.'],
        ['Registro de crisis (voz)', 'app/crisis-voice.tsx + utils/voiceCrisis.ts', 'Flujo manos libres para fotofobia intensa.'],
        ['Diario', 'app/(tabs)/two.tsx', 'Calendario y estadísticas de episodios.'],
        ['Biblioteca', 'app/(tabs)/biblioteca.tsx', 'Material educativo curado.'],
        ['Informe médico', 'app/report.tsx + utils/reportData.ts', 'Informe PDF de 30 / 60 / 90 días.'],
        ['Algoritmos', 'utils/storage.ts + utils/supabaseStorage.ts', 'Evaluación de migraña, carga de tensión y umbral dinámico.'],
      ],
      [Math.round(CONTENT_WIDTH_DXA * 0.22), Math.round(CONTENT_WIDTH_DXA * 0.33), CONTENT_WIDTH_DXA - Math.round(CONTENT_WIDTH_DXA * 0.22) - Math.round(CONTENT_WIDTH_DXA * 0.33)],
    ),
  ];
}

// ---------------------------------------------------------------------------
// 3. Flujos de usuario
// ---------------------------------------------------------------------------

function userFlows() {
  return [
    h1('3. Flujos de usuario'),
    p(
      'Esta sección describe los recorridos principales del paciente dentro de la aplicación. ' +
        'Cada flujo incluye un espacio reservado para la captura de pantalla correspondiente, ' +
        'que se añadirá al documento antes de su distribución.',
    ),

    // 3.1 Onboarding
    h2('3.1 Alta inicial (onboarding)'),
    p(
      'La primera vez que el paciente abre la app se le guía a través de 9 pasos. El objetivo ' +
        'es capturar datos mínimos demográficos, configurar los recordatorios y obtener permisos ' +
        'de notificaciones y micrófono antes del primer check-in.',
    ),
    numbered('Pantalla de bienvenida con descripción breve de la app.'),
    numbered('Perfil: sexo biológico y año de nacimiento (usados para ajustar preguntas, p. ej. menstruación).'),
    numbered('Slide educativo: qué es un check-in diario y por qué importa.'),
    numbered('Slide educativo: cómo interpreta la app el riesgo y la carga acumulada.'),
    numbered('Slide educativo: cuándo y cómo registrar una crisis activa.'),
    numbered('Selección de hora para la notificación diaria de check-in (7, 8, 9, 10, 12, 18 o 20 h, o personalizada).'),
    numbered('Permiso de notificaciones (recordatorio diario).'),
    numbered('Permiso de micrófono (modo voz opcional).'),
    numbered('Primer check-in guiado.'),
    p('Implementado en app/onboarding.tsx. La hora de notificación se persiste con AsyncStorage y se programa vía utils/notifications.ts.'),
    screenshotPlaceholder(
      'Onboarding – Bienvenida',
      'Primera pantalla del alta inicial con el logo y la propuesta de valor.',
    ),
    screenshotPlaceholder(
      'Onboarding – Configuración de perfil',
      'Selección de sexo biológico y año de nacimiento.',
    ),

    // 3.2 Check-in
    h2('3.2 Check-in diario'),
    p(
      'El check-in se diseñó para completarse en menos de 2 minutos. Se divide en tres bloques: ' +
        '(1) detección inicial (¿ha habido cefalea en las últimas 24 h?), (2) detalles del dolor (solo si la respuesta fue “Sí”), ' +
        'y (3) estado general (siempre, independientemente de si hubo dolor).',
    ),
    p(
      'Las preguntas completas del check-in se reproducen en la sección 4 de este documento. ' +
        'Las respuestas del bloque “Estado general” alimentan directamente el cálculo de la carga ' +
        'de tensión diaria (sección 6).',
    ),
    screenshotPlaceholder(
      'Check-in diario – Detalles del dolor',
      'Deslizadores de intensidad y duración con opciones de características del dolor.',
    ),
    screenshotPlaceholder(
      'Check-in diario – Estado general',
      'Deslizadores de sueño, estrés, alcohol y cafeína que se registran siempre.',
    ),

    // 3.3 Crisis visual
    h2('3.3 Registro de crisis – modo visual'),
    p(
      'Cuando el paciente pulsa “Me duele la cabeza” desde la pantalla de inicio, la app ofrece ' +
        'dos modos de registro. El modo visual es un formulario completo para registrar un episodio activo: ' +
        'hora de inicio, intensidad actual, características, presencia de aura, síntomas asociados, ' +
        'desencadenantes identificados, medicación tomada y si acudió a un centro sanitario.',
    ),
    p(
      'Cuando el episodio se resuelve, el paciente cierra la crisis; la app marca la hora de fin y ' +
        'calcula la duración para incluirla en los informes. Si, en el siguiente check-in diario, no se ' +
        'reporta cefalea, la carga acumulada (CL) se reinicia a 0 (ver sección 6).',
    ),
    screenshotPlaceholder(
      'Crisis – Modo visual',
      'Formulario detallado de crisis activa con campos clínicos organizados por secciones.',
    ),

    // 3.4 Crisis voz
    h2('3.4 Registro de crisis – modo voz'),
    p(
      'Durante una crisis con fotofobia o fonofobia, mirar una pantalla puede ser intolerable. El ' +
        'modo voz está pensado para ese escenario: la pantalla permanece casi negra, la app lee cada ' +
        'pregunta por TTS (Text-to-Speech), escucha la respuesta del paciente mediante reconocimiento ' +
        'de voz y confirma cada entrada con un patrón háptico distinto. El paciente puede completar ' +
        'el registro con los ojos cerrados.',
    ),
    bullet('Indicador visual mínimo: un único punto pulsante para quienes aún mantengan visión borrosa.'),
    bullet('Tres reintentos por pregunta; si no se reconoce la respuesta, se ofrece reformular la pregunta.'),
    bullet('Permisos de micrófono solicitados en el onboarding y verificados al entrar al modo.'),
    p('Implementado en app/crisis-voice.tsx apoyándose en utils/voiceCrisis.ts (funciones speak, listenForSpeech, parseAnswer, hapticConfirm).'),
    screenshotPlaceholder(
      'Crisis – Modo voz',
      'Pantalla oscura con punto pulsante que indica que la app está escuchando.',
    ),

    // 3.5 Pantalla inicio
    h2('3.5 Pantalla de inicio'),
    p(
      'La pantalla de inicio es el cuadro de mando del paciente. Muestra, en este orden: (a) el ' +
        'score de migraña del último check-in con su lista de razones cumplidas y no cumplidas; ' +
        '(b) si el score es bajo, la zona de riesgo de cefalea por tensión como porcentaje del umbral; ' +
        '(c) botones de acceso rápido a check-in, registro de crisis e informe; y (d) una alerta modal ' +
        'emergente cuando se cumplen condiciones clínicas de preocupación (ver sección 7).',
    ),
    screenshotPlaceholder(
      'Inicio – Score de migraña y zona de riesgo',
      'Círculo con el score, pill de estado y predicción de cefalea tipo tensión.',
    ),
    screenshotPlaceholder(
      'Inicio – Alerta de alta probabilidad de migraña',
      'Modal con icono de advertencia, razones clínicas y acceso directo al informe.',
    ),
    screenshotPlaceholder(
      'Inicio – Selector de modo de registro',
      'Modal “¿Cómo quieres registrar?” con las opciones Modo Visual y Modo Voz.',
    ),

    // 3.6 Diario
    h2('3.6 Diario'),
    p(
      'El diario presenta un calendario con los días marcados según el tipo de registro (check-in ' +
        'sin dolor, check-in con dolor, crisis registrada). Se acompaña de estadísticas mensuales: ' +
        'número de episodios, días desde el último episodio, promedio de días entre crisis y comparación ' +
        'con el mes anterior. El paciente puede pulsar un día para ver el detalle o borrar un registro ' +
        'erróneo.',
    ),
    screenshotPlaceholder(
      'Diario – Calendario de episodios',
      'Calendario mensual con marcadores y resumen estadístico debajo.',
    ),

    // 3.7 Biblioteca
    h2('3.7 Biblioteca educativa'),
    p(
      'Una biblioteca curada de recursos educativos, agrupados en cuatro categorías: General (qué es ' +
        'la migraña, tipos, señales de alarma), Relajación (respiración 4-7-8, meditación, yoga), ' +
        'Medicamentos (analgésicos, triptanes, tratamiento preventivo, MOH) y Tips prácticos. El contenido ' +
        'se consume como vídeo o artículo dentro de la app.',
    ),
    screenshotPlaceholder(
      'Biblioteca – Lista de recursos',
      'Categorías y tarjetas de recursos con indicación del tipo (vídeo o artículo).',
    ),

    // 3.8 Informe
    h2('3.8 Informe médico'),
    p(
      'Desde la pantalla de inicio el paciente accede al informe médico, que permite seleccionar ' +
        'un período (30, 60 o 90 días) y genera un PDF con las métricas clínicas descritas en la ' +
        'sección 8 de este documento. El PDF puede compartirse directamente desde el sistema operativo ' +
        '(correo, mensajería, AirDrop, etc.).',
    ),
    screenshotPlaceholder(
      'Informe – Resumen superior',
      'Cabecera del informe con período, días con cefalea, crisis y etiqueta episódico/crónico.',
    ),
    screenshotPlaceholder(
      'Informe – Gráficos y tabla mensual',
      'Distribución de intensidad, desencadenantes en barras y frecuencia mensual tabulada.',
    ),
    screenshotPlaceholder(
      'Informe – Registro detallado de episodios',
      'Tabla de crisis con fecha, intensidad, duración, aura, medicación y consulta médica.',
    ),
  ];
}

// ---------------------------------------------------------------------------
// 4. Preguntas capturadas
// ---------------------------------------------------------------------------

function capturedQuestions() {
  const w = [
    Math.round(CONTENT_WIDTH_DXA * 0.45),
    Math.round(CONTENT_WIDTH_DXA * 0.20),
    CONTENT_WIDTH_DXA - Math.round(CONTENT_WIDTH_DXA * 0.45) - Math.round(CONTENT_WIDTH_DXA * 0.20),
  ];

  return [
    h1('4. Preguntas capturadas'),
    p(
      'A continuación se reproducen las preguntas reales que la app plantea al paciente, tal y como ' +
        'se muestran en pantalla. Esto permite al clínico contrastar las respuestas con su propia ' +
        'anamnesis.',
    ),

    h2('4.1 Check-in diario'),
    h3('Detección inicial (siempre)'),
    dataTable(
      ['Pregunta', 'Tipo', 'Opciones / escala'],
      [
        ['¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?', 'Sí / No', '—'],
      ],
      w,
    ),

    h3('Detalles del dolor (solo si se respondió “Sí”)'),
    dataTable(
      ['Pregunta', 'Tipo', 'Opciones / escala'],
      [
        ['¿Cuál fue la intensidad máxima del dolor hoy?', 'Deslizador 0–10', '0–3 leve · 4–7 moderado · 8–10 severo'],
        ['¿Cuántas horas duró el dolor hoy?', 'Selector de tiempo', '<1, 1–24 h'],
        [
          '¿Cómo sentiste el dolor hoy?',
          'Selección múltiple',
          bulletsCell([
            'Pulsátil (latidos / pum-pum)',
            'Unilateral',
            'Agravamiento por actividad física',
            'Ninguna de las anteriores',
            'Otra (texto libre)',
          ]),
        ],
        [
          '¿Notaste alguno de estos síntomas junto con el dolor?',
          'Selección múltiple',
          bulletsCell([
            'Mucha molestia a la luz y/o al ruido (fotofobia / fonofobia)',
            'Náuseas o ganas de vomitar',
            'Ninguno',
          ]),
        ],
        ['¿El dolor te impidió realizar tus actividades normales hoy?', 'Deslizador 0–10', '0–1 no · 2–5 sí, un poco · 6–10 sí, totalmente'],
        [
          '¿Tomaste alguna medicación para el dolor hoy?',
          'Selección múltiple',
          bulletsCell([
            'Ibuprofeno',
            'Acetaminofén',
            'Aspirina',
            'Otra (texto libre)',
            'No',
          ]),
        ],
        [
          'Además de la medicación, ¿qué otras medidas tomaste para intentar aliviar tu dolor de cabeza hoy?',
          'Selección múltiple',
          bulletsCell([
            'Dormir o descansar',
            'Aislarse en un lugar oscuro/silencioso',
            'Compresas frías o calientes',
            'Ejercicios de relajación',
            'Remedios caseros (texto libre)',
            'Otro (texto libre)',
            'No hice nada más (exclusivo)',
          ]),
        ],
        [
          '¿Identificas algún desencadenante?',
          'Selección múltiple',
          bulletsCell([
            'Estrés',
            'Falta de sueño o mal descanso',
            'Cambios de clima o presión',
            'Alimento o bebida',
            'Menstruación',
            'Pantallas o luz intensa',
            'No identifico ninguno',
          ]),
        ],
      ],
      w,
    ),

    h3('Estado general (siempre)'),
    dataTable(
      ['Pregunta', 'Tipo', 'Opciones / escala'],
      [
        ['¿Qué tan bien dormiste anoche?', 'Deslizador 0–10', '0 muy mal · 10 excelente'],
        ['¿Qué tan estresado te sientes hoy?', 'Deslizador 0–10', '0 nada · 10 muy estresado'],
        ['¿Has consumido alcohol?', 'Deslizador 0–10', '0 nada · 1–5 habitual · 6–10 más de lo habitual'],
        ['¿Cómo ha sido tu consumo de cafeína (café, té, refrescos)?', 'Deslizador 0–10', '0 nada · 1–5 habitual · 6–10 más de lo habitual'],
      ],
      w,
    ),

    h2('4.2 Reporte de cefalea activa (crisis)'),
    h3('Inicio y severidad'),
    dataTable(
      ['Pregunta', 'Tipo', 'Opciones / escala'],
      [
        ['¿Cuándo comenzó el dolor?', 'Fecha y hora', '—'],
        ['¿Cuál es la intensidad del dolor ahora?', 'Deslizador 0–10', '0–3 leve · 4–7 moderado · 8–10 severo'],
      ],
      w,
    ),
    h3('Características del dolor'),
    dataTable(
      ['Pregunta', 'Tipo', 'Opciones / escala'],
      [
        [
          '¿Cómo sientes el dolor?',
          'Selección múltiple',
          bulletsCell(['Pulsátil', 'Unilateral', 'Agravamiento por actividad', 'Ninguna de las anteriores']),
        ],
        [
          '¿Tuviste aura antes o durante el dolor?',
          'Selección múltiple',
          bulletsCell(['Luces', 'Líneas', 'Manchas', 'Hormigueo', 'Otro (texto libre)']),
        ],
        [
          '¿Tienes alguno de estos síntomas ahora?',
          'Selección múltiple',
          bulletsCell(['Fotofobia y fonofobia', 'Náuseas o vómito', 'Ninguno']),
        ],
      ],
      w,
    ),
    h3('Contexto y tratamiento'),
    dataTable(
      ['Pregunta', 'Tipo', 'Opciones / escala'],
      [
        [
          '¿Identificas algún desencadenante?',
          'Selección múltiple',
          bulletsCell([
            'Estrés',
            'Falta de sueño',
            'Clima / presión',
            'Alimento / bebida',
            'Menstruación',
            'Pantallas / luz intensa',
            'Ninguno',
          ]),
        ],
        [
          '¿Has tomado alguna medicación para este dolor?',
          'Selección múltiple',
          bulletsCell(['Ibuprofeno', 'Acetaminofén', 'Aspirina', 'Otra (texto libre)', 'No']),
        ],
        [
          '¿Has acudido a algún centro de salud?',
          'Sí / No',
          'Si “Sí”: texto libre para especificar el centro.',
        ],
      ],
      w,
    ),
  ];
}

// ---------------------------------------------------------------------------
// 5. Algoritmo de migraña (ICHD-3)
// ---------------------------------------------------------------------------

function migraineAlgorithm() {
  const w = [
    Math.round(CONTENT_WIDTH_DXA * 0.35),
    Math.round(CONTENT_WIDTH_DXA * 0.20),
    CONTENT_WIDTH_DXA - Math.round(CONTENT_WIDTH_DXA * 0.35) - Math.round(CONTENT_WIDTH_DXA * 0.20),
  ];

  return [
    h1('5. Algoritmo de evaluación de migraña (ICHD-3)'),
    p(
      'La evaluación se basa en los criterios diagnósticos B–D de la Clasificación Internacional ' +
        'de Cefaleas, 3.ª edición (ICHD-3) para migraña sin aura. El criterio A —haber tenido al ' +
        'menos 5 ataques— no se evalúa por registro individual, dado que requiere historia clínica; ' +
        'se implementa como una aproximación probabilística mediante un score 0–100.',
    ),
    p('La función principal es evaluateMigraine() definida en utils/storage.ts.'),

    h2('5.1 Puntos asignados'),
    dataTable(
      ['Criterio (ICHD-3)', 'Puntos', 'Cómo se evalúa en la app'],
      [
        ['B. Duración 4–72 h', '30', 'Respuesta “4–12 horas” o “Todo el día” en la pregunta de duración.'],
        ['C1. Localización unilateral', '10', 'Marca “Unilateral” en características del dolor.'],
        ['C2. Carácter pulsátil', '10', 'Marca “Pulsátil” en características del dolor.'],
        ['C3. Intensidad moderada-severa', '20', 'Intensidad ≥ 4/10.'],
        ['C4. Empeora con actividad física rutinaria', '10', 'Marca “Agravamiento por actividad”.'],
        ['D1. Náuseas o vómitos', '10', 'Marca “Náuseas o ganas de vomitar” en síntomas asociados.'],
        ['D2. Fotofobia y fonofobia', '10', 'Marca “Mucha molestia a la luz y/o al ruido” (agrupa ambos).'],
      ],
      w,
    ),
    p(
      'El score final se limita a 0–100. Se clasifica el riesgo como: ',
    ),
    bullet([t('Bajo ', { bold: true }), t('si score < 40.')]),
    bullet([t('Moderado ', { bold: true }), t('si 40 ≤ score < 70.')]),
    bullet([t('Alto ', { bold: true }), t('si score ≥ 70.')]),

    h2('5.2 Decisión “mayHaveMigraine”'),
    p(
      'Además del score, la app calcula una bandera booleana estricta que se considera positiva ' +
        'cuando se cumplen simultáneamente los tres grupos de criterios:',
    ),
    numbered('Criterio B: duración ≥ 4 h.'),
    numbered('Criterio C: al menos 2 de las 4 características del dolor (unilateral, pulsátil, intensidad moderada-severa, agravamiento por actividad).'),
    numbered('Criterio D: al menos 1 síntoma asociado (náuseas o fotofobia/fonofobia).'),
    p(
      'Cuando mayHaveMigraine = true, la app trata el episodio como migraña probable y oculta el ' +
        'modelo de predicción de cefalea tipo tensión (ver sección 6.4).',
    ),

    h2('5.3 Ejemplo clínico'),
    p(
      'Paciente que refiere en el check-in de hoy: cefalea de 6 horas de duración, unilateral, ' +
        'pulsátil, intensidad 7/10, agravamiento con actividad, con náuseas y molestia a la luz/ruido.',
    ),
    formula(
      '30 + 10 + 10 + 20 + 10 + 10 + 10 = 100',
      'Duración (30) + unilateral (10) + pulsátil (10) + intensidad ≥4 (20) + ' +
        'agravamiento (10) + náuseas (10) + foto/fonofobia (10).',
    ),
    p('Resultado: score = 100, riskLevel = alto, mayHaveMigraine = true, modelo de tensión silenciado.'),
  ];
}

// ---------------------------------------------------------------------------
// 6. Algoritmo de carga acumulada (tensión)
// ---------------------------------------------------------------------------

function tensionAlgorithm() {
  const wVars = [
    Math.round(CONTENT_WIDTH_DXA * 0.22),
    Math.round(CONTENT_WIDTH_DXA * 0.13),
    Math.round(CONTENT_WIDTH_DXA * 0.13),
    CONTENT_WIDTH_DXA - Math.round(CONTENT_WIDTH_DXA * 0.22) - Math.round(CONTENT_WIDTH_DXA * 0.13) * 2,
  ];
  const wWeights = [
    Math.round(CONTENT_WIDTH_DXA * 0.22),
    Math.round(CONTENT_WIDTH_DXA * 0.12),
    Math.round(CONTENT_WIDTH_DXA * 0.14),
    CONTENT_WIDTH_DXA - Math.round(CONTENT_WIDTH_DXA * 0.22) - Math.round(CONTENT_WIDTH_DXA * 0.12) - Math.round(CONTENT_WIDTH_DXA * 0.14),
  ];
  const wZones = [
    Math.round(CONTENT_WIDTH_DXA * 0.25),
    Math.round(CONTENT_WIDTH_DXA * 0.25),
    CONTENT_WIDTH_DXA - Math.round(CONTENT_WIDTH_DXA * 0.25) * 2,
  ];

  return [
    h1('6. Algoritmo de riesgo de cefalea tipo tensión'),
    p(
      'Las cefaleas tipo tensión suelen ser acumulativas: se producen cuando la suma de factores de ' +
        'riesgo (sueño deficiente, estrés, alcohol y desviación en el consumo de cafeína) supera un ' +
        'umbral personal. La app modela este fenómeno con dos variables —Carga de Tensión diaria (TL) y ' +
        'Carga Acumulada (CL)— y un umbral por paciente (U) que se ajusta con los datos del propio ' +
        'usuario.',
    ),

    h2('6.1 Variables de entrada'),
    dataTable(
      ['Variable', 'Símbolo', 'Escala', 'Descripción'],
      [
        ['Calidad del sueño', 'Sq', '0–10', '10 = excelente descanso; 0 = muy poco descanso.'],
        ['Nivel de estrés', 'St', '0–10', '0 = sin estrés; 10 = estrés muy alto.'],
        ['Consumo de alcohol', 'A', '0–10', '0 = nada; 1–5 = habitual; 6–10 = por encima de lo habitual.'],
        ['Desviación de cafeína', 'C', '0–10', '0 = abstinencia; 1–5 = habitual; 6–10 = exceso (curva en “U”).'],
      ],
      wVars,
    ),
    p('Si alguna variable no está disponible, la app utiliza valores por defecto (sueño = 6 h, estrés = 5, alcohol = 0, cafeína = 2 tazas, escaladas internamente).'),

    h2('6.2 Carga de Tensión diaria (TL)'),
    p('La calidad del sueño se invierte (un sueño de 10 representa riesgo 0) y se combinan los cuatro factores con pesos clínicos:'),
    formula(
      'TL = 0.3 × InvSueño + 0.4 × Estrés + 0.15 × Alcohol + 0.15 × Cafeína',
      'InvSueño = 10 − Sq. Los pesos priorizan estrés (40 %) y sueño (30 %), que son los principales desencadenantes descritos en la literatura.',
    ),
    dataTable(
      ['Factor', 'Peso', 'Porcentaje', 'Justificación clínica'],
      [
        ['Estrés', '0.4', '40 %', 'Desencadenante primario de cefalea tipo tensión.'],
        ['Sueño', '0.3', '30 %', 'La falta de descanso contribuye de forma significativa al riesgo.'],
        ['Cafeína', '0.15', '15 %', 'Tanto la abstinencia como el exceso pueden desencadenar cefalea.'],
        ['Alcohol', '0.15', '15 %', 'El consumo excesivo es un desencadenante conocido.'],
      ],
      wWeights,
    ),
    p(
      'La función calculateDailyTensionLoad() vive en utils/storage.ts. Los pesos son heurísticos y ' +
        'podrán ajustarse en el futuro mediante aprendizaje automático supervisado con los propios ' +
        'datos del paciente.',
    ),

    h2('6.3 Carga Acumulada (CL) y factor de decaimiento'),
    p('La CL representa la tensión acumulada a lo largo del tiempo. Cada día, parte de la CL del día anterior se mantiene (aún no se ha recuperado el organismo) y parte se disipa:'),
    formula(
      'CL_hoy = TL_hoy + DecayFactor × CL_ayer',
      'DecayFactor = 0.5 → la mitad de la carga de ayer se conserva, la otra mitad se disipa.',
    ),
    p(
      'La CL se calcula y persiste en cada check-in mediante calculateAndSaveCumulativeLoad() en ' +
        'utils/supabaseStorage.ts, guardándose por fecha (YYYY-MM-DD) para poder reconstruir el historial.',
    ),
    p(
      'Cuando una cefalea se resuelve —esto es, el check-in actual reporta “No” tras un check-in con ' +
        'cefalea— la CL se reinicia a 0 mediante resetCumulativeLoad(), reflejando la recuperación del ' +
        'paciente. Esta lógica está en checkAndResetCLIfHeadacheResolved() en utils/storage.ts.',
    ),

    h2('6.4 Umbral personalizado (U) y aprendizaje'),
    p(
      'El umbral es el valor de CL en el que ese paciente en concreto suele empezar a tener cefalea. ' +
        'Inicialmente se utiliza un valor por defecto de 75. Cada vez que el paciente reporta una ' +
        'cefalea que el algoritmo de migraña no clasifica como migraña probable (score < 40 y ' +
        'mayHaveMigraine = false), la app registra la CL de ese día como nuevo punto de entrenamiento y ' +
        'recalcula el umbral como el promedio de todos los puntos almacenados.',
    ),
    p('Implementación: getUserThreshold() y updateUserThreshold() en utils/supabaseStorage.ts; la tabla de entrenamiento es threshold_data.'),

    h2('6.5 Zonas de riesgo y predicción'),
    p('Cada día se calcula el porcentaje CL / U × 100 y se clasifica en una de tres zonas:'),
    dataTable(
      ['Zona', 'Condición', 'Predicción mostrada al paciente'],
      [
        ['Zona segura', 'CL < 50 % del umbral', 'Riesgo bajo de dolor de cabeza en las próximas 48 horas.'],
        ['Zona de precaución', '50 % ≤ CL < 80 %', 'Riesgo moderado. Si continúa el estrés o mal sueño, es probable dolor de cabeza en 24-48 horas.'],
        ['Zona de peligro', 'CL ≥ 80 %', 'Riesgo alto. Es probable dolor de cabeza en 12-24 horas sin intervención.'],
      ],
      wZones,
    ),
    p('La evaluación completa se expone en evaluateHeadacheRisk() y calculateHeadacheRisk() en utils/storage.ts. Si el algoritmo de migraña devuelve score ≥ 40 o mayHaveMigraine = true, calculateHeadacheRisk() retorna null y la sección de riesgo de tensión queda oculta en la pantalla de inicio.'),

    h2('6.6 Ejemplo numérico completo'),
    p('Paciente con umbral personal de 70 (ajustado con datos históricos) y CL de ayer = 45. Check-in de hoy:'),
    bullet('Sueño: 2/10 (muy poco descanso).'),
    bullet('Estrés: 8/10 (muy alto).'),
    bullet('Alcohol: 0/10 (sin consumo).'),
    bullet('Cafeína: 1/10 (casi abstinencia).'),
    p('Paso 1 — Carga de Tensión diaria:'),
    formula('InvSueño = 10 − 2 = 8'),
    formula('TL = 0.3×8 + 0.4×8 + 0.15×0 + 0.15×1 = 2.4 + 3.2 + 0 + 0.15 = 5.75'),
    p('Paso 2 — Carga Acumulada:'),
    formula('CL_hoy = 5.75 + 0.5 × 45 = 5.75 + 22.5 = 28.25'),
    p('Paso 3 — Porcentaje y zona:'),
    formula('(28.25 / 70) × 100 ≈ 40.4 %  →  Zona segura (<50 %)'),
    p('Resultado que ve el paciente: “Riesgo bajo de dolor de cabeza en las próximas 48 horas”, con detalle de las razones (sueño escaso, estrés alto y abstinencia de cafeína contribuyen al riesgo; alcohol no contribuye).'),

    h2('6.7 Constantes de referencia'),
    dataTable(
      ['Constante', 'Valor', 'Descripción'],
      [
        ['DEFAULT_THRESHOLD', '75', 'Umbral inicial antes de disponer de datos históricos.'],
        ['DECAY_FACTOR', '0.5', 'Proporción de CL que persiste del día anterior.'],
        ['HEADACHE_WEIGHTS.sleep', '0.30', 'Peso del factor sueño.'],
        ['HEADACHE_WEIGHTS.stress', '0.40', 'Peso del factor estrés.'],
        ['HEADACHE_WEIGHTS.alcohol', '0.15', 'Peso del factor alcohol.'],
        ['HEADACHE_WEIGHTS.caffeine', '0.15', 'Peso del factor cafeína.'],
      ],
      [
        Math.round(CONTENT_WIDTH_DXA * 0.32),
        Math.round(CONTENT_WIDTH_DXA * 0.15),
        CONTENT_WIDTH_DXA - Math.round(CONTENT_WIDTH_DXA * 0.32) - Math.round(CONTENT_WIDTH_DXA * 0.15),
      ],
    ),
  ];
}

// ---------------------------------------------------------------------------
// 7. Alerta de alta probabilidad de migraña
// ---------------------------------------------------------------------------

function alertLogic() {
  const w = [
    Math.round(CONTENT_WIDTH_DXA * 0.08),
    Math.round(CONTENT_WIDTH_DXA * 0.32),
    CONTENT_WIDTH_DXA - Math.round(CONTENT_WIDTH_DXA * 0.08) - Math.round(CONTENT_WIDTH_DXA * 0.32),
  ];

  return [
    h1('7. Alerta de alta probabilidad de migraña'),
    p(
      'Cuando los datos del paciente sugieren migraña clínicamente relevante, la app muestra en la ' +
        'pantalla de inicio un modal que recomienda explícitamente consultar con un médico y ofrece ' +
        'acceso directo al informe PDF. El modal se oculta durante 24 horas tras cualquier descarte ' +
        'del paciente (cooldown) para evitar sobrecarga cognitiva.',
    ),
    h2('7.1 Condiciones disparadoras (basta con cumplir una)'),
    dataTable(
      ['#', 'Condición', 'Implementación'],
      [
        ['1', 'El último check-in cumple los criterios ICHD-3 B–D (mayHaveMigraine = true).', 'evaluateMigraine() sobre el check-in más reciente.'],
        ['2', 'Existe un episodio de crisis activo (sin endDate).', 'Inspección de los registros tipo “crisis”.'],
        ['3', 'Patrón crónico: ≥ 15 días con cefalea por mes en los últimos 90 días.', 'Conteo de fechas únicas con cefalea en la ventana de 90 días.'],
        ['4', '> 50 % de los episodios recientes (≥ 3) obtienen score ≥ 70.', 'Score por episodio mediante evaluateMigraine() o la variante scoreCrisisEntry().'],
      ],
      w,
    ),
    p('Si ninguna condición se cumple, shouldShowMigraineAlert() devuelve null y el modal no se muestra. Si se cumple una o varias, el modal lista las razones literales que el paciente puede comunicar a su médico.'),
    h2('7.2 Cooldown'),
    p(
      'Al cerrar el modal se almacena la marca de tiempo en AsyncStorage (migraine_alert_dismissed_at). ' +
        'La función isMigraineAlertCooldownExpired() comprueba que hayan transcurrido al menos 24 horas ' +
        'antes de volver a mostrarlo. Implementación en utils/storage.ts.',
    ),
    noteBox([
      [
        t('Importancia clínica. ', { bold: true, color: COLOR_ACCENT }),
        t(
          'Las condiciones 3 y 4 permiten detectar patrones que el paciente podría no percibir como ' +
            'preocupantes día a día (migraña crónica, alta recurrencia de episodios graves), lo que ' +
            'favorece la derivación temprana.',
        ),
      ],
    ]),
  ];
}

// ---------------------------------------------------------------------------
// 8. Informe médico (reporting)
// ---------------------------------------------------------------------------

function reporting() {
  const wSections = [
    Math.round(CONTENT_WIDTH_DXA * 0.30),
    CONTENT_WIDTH_DXA - Math.round(CONTENT_WIDTH_DXA * 0.30),
  ];

  return [
    h1('8. Informe médico'),
    p(
      'El informe médico es el entregable principal del paciente al clínico. Se genera a demanda ' +
        'desde la pantalla de inicio, se exporta como PDF mediante expo-print y se comparte a través ' +
        'del sistema operativo con expo-sharing. El cálculo de métricas está centralizado en ' +
        'generateReportData() y el render HTML en generateReportHTML() (utils/reportData.ts).',
    ),
    h2('8.1 Períodos disponibles'),
    p('El paciente puede seleccionar uno de tres períodos. El análisis siempre usa el momento actual como fin del período y cuenta hacia atrás los días seleccionados.'),
    bullet('Últimos 30 días — útil para controles estrechos o tras un ajuste terapéutico.'),
    bullet('Últimos 60 días — visión intermedia.'),
    bullet('Últimos 90 días — ventana habitual para valoración de migraña episódica vs. crónica.'),

    h2('8.2 Secciones del informe'),
    dataTable(
      ['Sección', 'Contenido y uso clínico'],
      [
        [
          'Resumen del período',
          bulletsCell([
            'Días totales con cefalea y número de episodios tipo “crisis”.',
            'Días con cefalea por mes (proyectado: días ÷ meses del período).',
            'Promedio de días entre crisis.',
            'Etiqueta episódico (< 15 días/mes) o crónico (≥ 15 días/mes).',
          ]),
        ],
        [
          'Frecuencia mensual',
          'Tabla mes a mes con número de días con cefalea y número de crisis registradas, útil para identificar estacionalidad o tendencia.',
        ],
        [
          'Caracterización de migraña',
          bulletsCell([
            'Porcentaje de episodios con score ≥ 70 (alta probabilidad de migraña).',
            'Número de episodios con aura (solo se captura en crisis).',
            'Distribución de características del dolor (pulsátil, unilateral, agravamiento).',
            'Distribución de síntomas asociados (foto/fonofobia, náuseas).',
          ]),
        ],
        [
          'Gravedad e impacto funcional',
          bulletsCell([
            'Intensidad media y máxima (escala 0–10).',
            'Distribución por bandas: Leve (0–3), Moderado (4–7), Severo (8–10).',
            'Impacto sobre actividades habituales (0–10) y episodios incapacitantes (≥ 6/10).',
          ]),
        ],
        [
          'Desencadenantes',
          'Frecuencia relativa de cada desencadenante declarado (estrés, falta de sueño, clima, alimento/bebida, menstruación, pantallas/luz).',
        ],
        [
          'Estilo de vida',
          'Comparativa de sueño, estrés, alcohol y cafeína en días con cefalea vs. sin cefalea, a partir de los check-ins diarios.',
        ],
        [
          'Medicación',
          bulletsCell([
            'Lista de fármacos y días en que se usaron.',
            'Días con medicación totales y promedio por mes.',
            'Aviso de uso excesivo: si el promedio ≥ 10 días/mes se muestra una advertencia por posible cefalea por uso excesivo de medicación (MOH).',
          ]),
        ],
        [
          'Registro detallado de episodios de crisis',
          'Tabla con fecha, intensidad, duración, aura, medicación y consulta médica; ordenada de más reciente a más antigua.',
        ],
      ],
      wSections,
    ),

    h2('8.3 Flujo de exportación a PDF'),
    numbered('El paciente elige período y pulsa “Generar informe” en app/report.tsx.'),
    numbered('generateReportData(checkIns, periodDays) agrega las métricas.'),
    numbered('generateReportHTML(data) produce un HTML autocontenido (CSS inline).'),
    numbered('expo-print.printToFileAsync() convierte el HTML en PDF.'),
    numbered('expo-sharing abre el diálogo nativo del sistema para compartirlo con el clínico.'),
    noteBox([
      [
        t('Alerta MOH. ', { bold: true, color: COLOR_ACCENT }),
        t(
          'El umbral de 10 días/mes de uso de analgésicos se inspira en los criterios ICHD-3 de ' +
            'cefalea por uso excesivo de medicación. Cuando se dispara, el PDF incluye un aviso ' +
            'visible sugiriendo consultar al médico, pero la app no realiza diagnóstico.',
        ),
      ],
    ]),
  ];
}

// ---------------------------------------------------------------------------
// 9. Persistencia, privacidad, diseño, limitaciones, glosario
// ---------------------------------------------------------------------------

function backmatter() {
  const wGlossary = [
    Math.round(CONTENT_WIDTH_DXA * 0.22),
    CONTENT_WIDTH_DXA - Math.round(CONTENT_WIDTH_DXA * 0.22),
  ];

  return [
    h1('9. Persistencia y privacidad'),
    p(
      'Los datos del paciente se almacenan en un backend Supabase (PostgreSQL gestionado) con ' +
        'autenticación por correo electrónico y contraseña, y flujo de recuperación “forgot / reset ' +
        'password”. Las políticas Row Level Security (RLS) garantizan que cada usuario sólo puede ' +
        'leer y escribir sus propios registros.',
    ),
    h2('9.1 Tablas principales'),
    bullet('check-ins — registros diarios (tipo “checkin” y “crisis”) con preguntas y respuestas serializadas.'),
    bullet('user_settings.headache_threshold — umbral personalizado del paciente.'),
    bullet('threshold_data — puntos de CL en días con cefalea no-migrañosa usados para recalcular el umbral.'),
    bullet('Histórico diario de CL indexado por fecha (YYYY-MM-DD) para reconstruir la trayectoria.'),
    h2('9.2 Notificaciones locales'),
    p('Los recordatorios de check-in se programan con expo-notifications a la hora elegida durante el onboarding. La lógica está en utils/notifications.ts. No se envían datos a servidores externos para mostrar la notificación.'),

    h1('10. Diseño accesible'),
    bullet('Modo claro y modo oscuro automáticos según el sistema.'),
    bullet('Modo voz para fotofobia/fonofobia: TTS + reconocimiento + hápticos, pantalla casi negra.'),
    bullet('Tap targets grandes y etiquetas claras para reducir esfuerzo visual durante una crisis.'),
    bullet('Color de acento azul para navegación general y rojo reservado a acciones de crisis.'),
    bullet('Mensajes en español, redactados para pacientes sin formación clínica.'),

    h1('11. Limitaciones clínicas'),
    bullet('No es diagnóstico. Las salidas son orientativas; la interpretación corresponde al clínico.'),
    bullet('Criterio A de la ICHD-3 (≥5 ataques) no se evalúa por registro individual; se infiere de forma implícita cuando hay suficiente histórico.'),
    bullet('Los pesos del modelo de tensión (0.30/0.40/0.15/0.15) son heurísticos y podrían no aplicar a todos los pacientes; se prevé ajuste por aprendizaje automático.'),
    bullet('El umbral personal requiere varios días con cefalea no-migrañosa antes de estabilizarse; en las primeras semanas el valor por defecto (75) puede sobre- o infra-estimar el riesgo.'),
    bullet('La diferenciación migraña / tensión se basa en las respuestas del propio paciente; un interrogatorio clínico puede aportar información adicional.'),

    h1('12. Glosario'),
    dataTable(
      ['Término', 'Definición'],
      [
        ['ICHD-3', 'International Classification of Headache Disorders, 3.ª edición.'],
        ['MOH', 'Medication Overuse Headache: cefalea por uso excesivo de medicación (≥ 10 días/mes con analgésicos simples o combinados).'],
        ['TL', 'Tension Load / Carga de Tensión diaria. Cuantifica los factores de riesgo del día.'],
        ['CL', 'Cumulative Load / Carga Acumulada. TL del día más un residuo del día anterior.'],
        ['DecayFactor', 'Factor de decaimiento (0.5). Proporción de CL que persiste de un día al siguiente.'],
        ['Aura', 'Síntomas neurológicos reversibles (visuales, sensitivos, del lenguaje) que pueden preceder o acompañar a la migraña.'],
        ['Fotofobia', 'Hipersensibilidad o molestia a la luz.'],
        ['Fonofobia', 'Hipersensibilidad o molestia al ruido.'],
        ['RLS', 'Row Level Security: política de acceso por fila que aísla los datos de cada paciente en la base de datos.'],
      ],
      wGlossary,
    ),
  ];
}

// ---------------------------------------------------------------------------
// Document assembly
// ---------------------------------------------------------------------------

function buildChildren() {
  return [
    ...coverPage(),
    ...tocSection(),
    ...executiveSummary(),
    ...architecture(),
    ...userFlows(),
    ...capturedQuestions(),
    ...migraineAlgorithm(),
    ...tensionAlgorithm(),
    ...alertLogic(),
    ...reporting(),
    ...backmatter(),
  ];
}

function buildDocument() {
  return new Document({
    creator: 'MigraineTrack',
    title: 'MigraineTrack — Guía clínica',
    description: 'Documento técnico-clínico para profesionales sanitarios.',
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
          paragraph: { spacing: { line: 300 } },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 36, bold: true, color: COLOR_PRIMARY, font: 'Calibri' },
          paragraph: {
            spacing: { before: 320, after: 200 },
            outlineLevel: 0,
          },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 28, bold: true, color: COLOR_PRIMARY, font: 'Calibri' },
          paragraph: {
            spacing: { before: 280, after: 140 },
            outlineLevel: 1,
          },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 24, bold: true, color: COLOR_TEXT, font: 'Calibri' },
          paragraph: {
            spacing: { before: 200, after: 100 },
            outlineLevel: 2,
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'bullet-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } },
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: '\u25E6',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 260 } } },
            },
          ],
        },
        {
          reference: 'ordered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } },
            },
            {
              level: 1,
              format: LevelFormat.LOWER_LETTER,
              text: '%2)',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_DXA, height: PAGE_HEIGHT_DXA },
            margin: {
              top: MARGIN_DXA,
              right: MARGIN_DXA,
              bottom: MARGIN_DXA,
              left: MARGIN_DXA,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  t('MigraineTrack — Guía clínica   ·   Página ', {
                    size: 18,
                    color: COLOR_MUTED,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    color: COLOR_MUTED,
                  }),
                  t(' de ', { size: 18, color: COLOR_MUTED }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                    color: COLOR_MUTED,
                  }),
                ],
              }),
            ],
          }),
        },
        children: buildChildren(),
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const outDir = path.resolve(__dirname, '..', 'docs');
  const outPath = path.join(outDir, 'MigraineTrack_Guia_Medica.docx');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const doc = buildDocument();
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated: ${outPath}  (${buffer.length.toLocaleString()} bytes)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
