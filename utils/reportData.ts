import { CheckIn } from './storage';

// ============================================================================
// Types
// ============================================================================

export interface MonthlyFrequency {
  label: string;
  headacheDays: number;
  crisisEpisodes: number;
}

export interface FrequencyStat {
  name: string;
  count: number;
  percentage: number;
}

export interface LifestyleComparison {
  metric: string;
  headacheDayAvg: number | null;
  headacheFreeDayAvg: number | null;
  unit: string;
}

export interface EpisodeLogEntry {
  date: string;
  intensity: number | null;
  duration: string | null;
  aura: string[];
  medications: string[];
  healthcareVisit: boolean | null;
}

export interface ReportData {
  periodStart: Date;
  periodEnd: Date;
  periodDays: number;
  totalCheckIns: number;

  totalHeadacheDays: number;
  totalCrisisEpisodes: number;
  headacheDaysPerMonth: number;
  isChronicPattern: boolean;
  avgDaysBetweenCrises: number | null;
  monthlyFrequency: MonthlyFrequency[];

  episodesWithHighMigraineScore: number;
  totalScoredEpisodes: number;
  migrainePercentage: number;
  auraEpisodes: number;
  totalCrisisForAura: number;
  painCharacteristics: FrequencyStat[];
  associatedSymptoms: FrequencyStat[];

  avgIntensity: number | null;
  maxIntensity: number;
  intensityDistribution: { mild: number; moderate: number; severe: number };
  avgActivityImpact: number | null;
  totalDisablingEpisodes: number;

  triggers: FrequencyStat[];
  totalEpisodesWithTriggerData: number;

  lifestyleComparison: LifestyleComparison[];

  medications: FrequencyStat[];
  totalMedicationDays: number;
  avgMedicationDaysPerMonth: number;
  medicationOveruseWarning: boolean;

  episodeLog: EpisodeLogEntry[];
}

// ============================================================================
// Label Maps
// ============================================================================

const MONTH_NAMES_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

const TRIGGER_LABELS: Record<string, string> = {
  estres: 'Estrés',
  falta_sueno: 'Falta de sueño',
  clima: 'Cambios de clima',
  comida: 'Alimentos / Bebida',
  menstruacion: 'Menstruación',
  pantallas: 'Pantallas / Luz intensa',
};

const MEDICATION_LABELS: Record<string, string> = {
  ibuprofeno: 'Ibuprofeno',
  acetaminofen: 'Acetaminofén',
  aspirina: 'Aspirina',
  otra_medicacion: 'Otra medicación',
};

const PAIN_CHAR_LABELS: Record<string, string> = {
  pulsatil: 'Pulsátil',
  unilateral: 'Unilateral',
  agravamiento_actividad: 'Agravamiento por actividad',
};

const SYMPTOM_LABELS: Record<string, string> = {
  luz_ruido: 'Fotofobia / Fonofobia',
  nauseas: 'Náuseas / Vómitos',
};

const AURA_LABELS: Record<string, string> = {
  luces: 'Luces',
  lineas: 'Líneas',
  manchas: 'Manchas',
  hormigueo: 'Hormigueo',
};

// ============================================================================
// Utilities
// ============================================================================

function toDateKey(isoString: string): string {
  return new Date(isoString).toISOString().split('T')[0];
}

function formatDateShort(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

function formatEpisodeDate(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function parseDurationHours(duration: string): number | null {
  if (duration === '<1_hora') return 0.5;
  const match = duration.match(/^(\d+)_horas?$/);
  return match ? parseInt(match[1], 10) : null;
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1));
}

function safeArray(value: unknown): string[] {
  return Array.isArray(value) ? value : [];
}

// ============================================================================
// Answer Mapper (handles both check-in and crisis question texts)
// ============================================================================

interface MappedAnswers {
  headache?: boolean;
  intensity?: number;
  duration?: string;
  painCharacteristics?: string[];
  aura?: string[];
  symptoms?: string[];
  activityImpact?: number;
  medication?: string[];
  painManagement?: string[];
  triggers?: string[];
  sleep?: number;
  stress?: number;
  alcohol?: number;
  caffeine?: number;
  healthcareVisit?: string;
  painStart?: string;
}

function mapAllAnswers(checkIn: CheckIn): MappedAnswers {
  const mapped: MappedAnswers = {};

  checkIn.questions.forEach((q, i) => {
    const a = checkIn.answers[i];

    if (q.includes('dolor de cabeza en las últimas')) mapped.headache = a as boolean;
    else if (q.includes('intensidad')) mapped.intensity = a as number;
    else if (q.includes('horas duró')) mapped.duration = a as string;
    else if (q.includes('sentiste el dolor') || q.includes('sientes el dolor'))
      mapped.painCharacteristics = a as string[];
    else if (q.includes('aura')) mapped.aura = a as string[];
    else if (q.includes('síntomas')) mapped.symptoms = a as string[];
    else if (q.includes('impidió realizar')) mapped.activityImpact = a as number;
    else if (q.includes('medicación')) mapped.medication = a as string[];
    else if (q.includes('medidas tomaste')) mapped.painManagement = a as string[];
    else if (q.includes('desencadenante')) mapped.triggers = a as string[];
    else if (q.includes('horas dormiste')) mapped.sleep = a as number;
    else if (q.includes('estresado')) mapped.stress = a as number;
    else if (q.includes('consumido alcohol')) mapped.alcohol = a as number;
    else if (q.includes('tazas de café')) mapped.caffeine = a as number;
    else if (q.includes('centro de salud')) mapped.healthcareVisit = a as string;
    else if (q.includes('comenzó el dolor')) mapped.painStart = a as string;
  });

  return mapped;
}

// ============================================================================
// ICHD-3 Migraine Score (works for both check-in and crisis entries)
// ============================================================================

function computeMigraineScore(answers: MappedAnswers, entry: CheckIn): number {
  let score = 0;

  if (entry.type === 'checkin' && answers.duration) {
    const hours = parseDurationHours(answers.duration);
    if (hours !== null && hours >= 4) score += 30;
  } else if (entry.type === 'crisis' && answers.painStart && entry.endDate) {
    const hours =
      (new Date(entry.endDate).getTime() - new Date(answers.painStart).getTime()) / 3_600_000;
    if (hours >= 4) score += 30;
  }

  const painChars = safeArray(answers.painCharacteristics);
  if (painChars.includes('unilateral')) score += 10;
  if (painChars.includes('pulsatil')) score += 10;
  if (painChars.includes('agravamiento_actividad')) score += 10;

  if (typeof answers.intensity === 'number' && answers.intensity >= 4) score += 20;

  const symptoms = safeArray(answers.symptoms);
  if (symptoms.includes('nauseas')) score += 10;
  if (symptoms.includes('luz_ruido')) score += 10;

  return Math.min(100, score);
}

// ============================================================================
// Report Data Generator
// ============================================================================

export function generateReportData(checkIns: CheckIn[], periodDays: number = 90): ReportData {
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - periodDays);
  periodStart.setHours(0, 0, 0, 0);

  const filtered = checkIns.filter(c => new Date(c.date) >= periodStart);

  const allMapped = filtered.map(c => ({ entry: c, answers: mapAllAnswers(c) }));
  const checkinMapped = allMapped.filter(m => m.entry.type === 'checkin');
  const crisisMapped = allMapped.filter(m => m.entry.type === 'crisis');

  // --- Headache / headache-free date sets ---
  const headacheDates = new Set<string>();

  checkinMapped.forEach(({ entry, answers }) => {
    if (answers.headache === true) headacheDates.add(toDateKey(entry.date));
  });
  crisisMapped.forEach(({ entry }) => {
    headacheDates.add(toDateKey(entry.date));
  });

  const headacheFreeDates = new Set<string>();
  checkinMapped.forEach(({ entry, answers }) => {
    const dk = toDateKey(entry.date);
    if (answers.headache === false && !headacheDates.has(dk)) headacheFreeDates.add(dk);
  });

  const totalHeadacheDays = headacheDates.size;
  const months = Math.max(1, periodDays / 30);
  const headacheDaysPerMonth = parseFloat((totalHeadacheDays / months).toFixed(1));

  // --- Monthly frequency ---
  const monthMap = new Map<string, { headacheDays: Set<string>; crisisEpisodes: number }>();
  const cursor = new Date(periodStart);
  cursor.setDate(1);
  while (cursor <= now) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
    if (!monthMap.has(key)) monthMap.set(key, { headacheDays: new Set(), crisisEpisodes: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  checkinMapped.forEach(({ entry, answers }) => {
    if (answers.headache === true) {
      const d = new Date(entry.date);
      monthMap.get(`${d.getFullYear()}-${d.getMonth()}`)?.headacheDays.add(toDateKey(entry.date));
    }
  });
  crisisMapped.forEach(({ entry }) => {
    const d = new Date(entry.date);
    const bucket = monthMap.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (bucket) {
      bucket.headacheDays.add(toDateKey(entry.date));
      bucket.crisisEpisodes++;
    }
  });

  const monthlyFrequency: MonthlyFrequency[] = [];
  for (const [key, data] of monthMap) {
    const [year, month] = key.split('-').map(Number);
    monthlyFrequency.push({
      label: `${MONTH_NAMES_SHORT[month]} ${year}`,
      headacheDays: data.headacheDays.size,
      crisisEpisodes: data.crisisEpisodes,
    });
  }

  // --- Avg days between crises ---
  let avgDaysBetweenCrises: number | null = null;
  if (crisisMapped.length >= 2) {
    const sorted = [...crisisMapped].sort(
      (a, b) => new Date(a.entry.date).getTime() - new Date(b.entry.date).getTime(),
    );
    let totalDiff = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalDiff +=
        (new Date(sorted[i].entry.date).getTime() - new Date(sorted[i - 1].entry.date).getTime()) /
        86_400_000;
    }
    avgDaysBetweenCrises = Math.round(totalDiff / (sorted.length - 1));
  }

  // --- Headache episodes (both check-in headache days + crisis entries) ---
  const headacheEpisodes = allMapped.filter(
    ({ entry, answers }) => entry.type === 'crisis' || answers.headache === true,
  );
  const totalEpisodes = headacheEpisodes.length;

  // --- Migraine characterization ---
  let highScoreCount = 0;
  const painCharCounts: Record<string, number> = {};
  const symptomCounts: Record<string, number> = {};

  headacheEpisodes.forEach(({ entry, answers }) => {
    if (computeMigraineScore(answers, entry) >= 70) highScoreCount++;

    safeArray(answers.painCharacteristics).forEach(pc => {
      if (pc !== 'ninguna' && pc !== 'otra') painCharCounts[pc] = (painCharCounts[pc] || 0) + 1;
    });
    safeArray(answers.symptoms).forEach(s => {
      if (s !== 'ninguno') symptomCounts[s] = (symptomCounts[s] || 0) + 1;
    });
  });

  // Aura is only captured in crisis entries
  let auraEpisodeCount = 0;
  crisisMapped.forEach(({ answers }) => {
    if (safeArray(answers.aura).length > 0) auraEpisodeCount++;
  });

  const toFreqStats = (counts: Record<string, number>, labels: Record<string, string>, total: number): FrequencyStat[] =>
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        name: labels[key] || key,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }));

  // --- Severity ---
  const intensities: number[] = [];
  const activityImpacts: number[] = [];
  let disablingCount = 0;

  headacheEpisodes.forEach(({ answers }) => {
    if (typeof answers.intensity === 'number') intensities.push(answers.intensity);
    if (typeof answers.activityImpact === 'number') {
      activityImpacts.push(answers.activityImpact);
      if (answers.activityImpact >= 6) disablingCount++;
    }
  });

  // --- Triggers ---
  const triggerCounts: Record<string, number> = {};
  let episodesWithTriggerData = 0;

  headacheEpisodes.forEach(({ answers }) => {
    const trigs = safeArray(answers.triggers);
    if (trigs.length > 0) {
      episodesWithTriggerData++;
      trigs.forEach(t => {
        if (t !== 'ninguno' && t !== 'otro') triggerCounts[t] = (triggerCounts[t] || 0) + 1;
      });
    }
  });

  // --- Lifestyle comparison ---
  const lsH = { sleep: [] as number[], stress: [] as number[], alcohol: [] as number[], caffeine: [] as number[] };
  const lsN = { sleep: [] as number[], stress: [] as number[], alcohol: [] as number[], caffeine: [] as number[] };

  checkinMapped.forEach(({ entry, answers }) => {
    const target = headacheDates.has(toDateKey(entry.date)) ? lsH : lsN;
    if (typeof answers.sleep === 'number') target.sleep.push(answers.sleep);
    if (typeof answers.stress === 'number') target.stress.push(answers.stress);
    if (typeof answers.alcohol === 'number') target.alcohol.push(answers.alcohol);
    if (typeof answers.caffeine === 'number') target.caffeine.push(answers.caffeine);
  });

  // --- Medication ---
  const medicationDates = new Set<string>();
  const medCounts: Record<string, number> = {};
  let medicatedEpisodes = 0;

  headacheEpisodes.forEach(({ entry, answers }) => {
    const meds = safeArray(answers.medication);
    if (meds.includes('si')) {
      medicationDates.add(toDateKey(entry.date));
      medicatedEpisodes++;
      meds.forEach(m => {
        if (m !== 'si' && m !== 'no') medCounts[m] = (medCounts[m] || 0) + 1;
      });
    }
  });

  const totalMedicationDays = medicationDates.size;
  const avgMedicationDaysPerMonth = parseFloat((totalMedicationDays / months).toFixed(1));

  // --- Episode log (crisis entries only) ---
  const episodeLog: EpisodeLogEntry[] = [...crisisMapped]
    .sort((a, b) => new Date(b.entry.date).getTime() - new Date(a.entry.date).getTime())
    .map(({ entry, answers }) => {
      let duration: string | null = null;
      if (answers.painStart && entry.endDate) {
        const h = Math.round(
          (new Date(entry.endDate).getTime() - new Date(answers.painStart).getTime()) / 3_600_000,
        );
        duration = `${h} hora${h !== 1 ? 's' : ''}`;
      }

      const meds: string[] = [];
      const entryMeds = safeArray(answers.medication);
      if (entryMeds.includes('si')) {
        entryMeds.forEach(m => {
          if (m !== 'si' && m !== 'no') meds.push(MEDICATION_LABELS[m] || m);
        });
      }

      const aura = safeArray(answers.aura)
        .filter(a => a !== 'otro_aura')
        .map(a => AURA_LABELS[a] || a);

      let healthcareVisit: boolean | null = null;
      if (answers.healthcareVisit !== undefined) {
        healthcareVisit = answers.healthcareVisit !== 'no' && answers.healthcareVisit !== '';
      }

      return {
        date: formatEpisodeDate(entry.date),
        intensity: answers.intensity ?? null,
        duration,
        aura,
        medications: meds,
        healthcareVisit,
      };
    });

  return {
    periodStart,
    periodEnd: now,
    periodDays,
    totalCheckIns: filtered.length,

    totalHeadacheDays,
    totalCrisisEpisodes: crisisMapped.length,
    headacheDaysPerMonth,
    isChronicPattern: headacheDaysPerMonth >= 15,
    avgDaysBetweenCrises,
    monthlyFrequency,

    episodesWithHighMigraineScore: highScoreCount,
    totalScoredEpisodes: totalEpisodes,
    migrainePercentage: totalEpisodes > 0 ? Math.round((highScoreCount / totalEpisodes) * 100) : 0,
    auraEpisodes: auraEpisodeCount,
    totalCrisisForAura: crisisMapped.length,
    painCharacteristics: toFreqStats(painCharCounts, PAIN_CHAR_LABELS, totalEpisodes),
    associatedSymptoms: toFreqStats(symptomCounts, SYMPTOM_LABELS, totalEpisodes),

    avgIntensity: avg(intensities),
    maxIntensity: intensities.length > 0 ? Math.max(...intensities) : 0,
    intensityDistribution: {
      mild: intensities.filter(i => i <= 3).length,
      moderate: intensities.filter(i => i >= 4 && i <= 7).length,
      severe: intensities.filter(i => i >= 8).length,
    },
    avgActivityImpact: avg(activityImpacts),
    totalDisablingEpisodes: disablingCount,

    triggers: toFreqStats(triggerCounts, TRIGGER_LABELS, episodesWithTriggerData),
    totalEpisodesWithTriggerData: episodesWithTriggerData,

    lifestyleComparison: [
      { metric: 'Sueño', headacheDayAvg: avg(lsH.sleep), headacheFreeDayAvg: avg(lsN.sleep), unit: 'h' },
      { metric: 'Estrés', headacheDayAvg: avg(lsH.stress), headacheFreeDayAvg: avg(lsN.stress), unit: '/10' },
      { metric: 'Alcohol', headacheDayAvg: avg(lsH.alcohol), headacheFreeDayAvg: avg(lsN.alcohol), unit: '/10' },
      { metric: 'Cafeína', headacheDayAvg: avg(lsH.caffeine), headacheFreeDayAvg: avg(lsN.caffeine), unit: 'tazas' },
    ],

    medications: toFreqStats(medCounts, MEDICATION_LABELS, medicatedEpisodes),
    totalMedicationDays,
    avgMedicationDaysPerMonth,
    medicationOveruseWarning: avgMedicationDaysPerMonth >= 10,

    episodeLog,
  };
}

// ============================================================================
// HTML Report Generator (for PDF export)
// ============================================================================

export function generateReportHTML(data: ReportData): string {
  const startDate = formatDateShort(data.periodStart);
  const endDate = formatDateShort(data.periodEnd);

  const frequencyRows = data.monthlyFrequency
    .map(m => `<tr><td>${m.label}</td><td>${m.headacheDays}</td><td>${m.crisisEpisodes}</td></tr>`)
    .join('');

  const barChart = (items: FrequencyStat[]) =>
    items
      .map(
        item =>
          `<div class="bar-row">
            <span class="bar-label">${item.name}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${item.percentage}%"></div></div>
            <span class="bar-value">${item.count} (${item.percentage}%)</span>
          </div>`,
      )
      .join('');

  const lifestyleRows = data.lifestyleComparison
    .map(
      l =>
        `<tr>
          <td>${l.metric}</td>
          <td>${l.headacheDayAvg !== null ? l.headacheDayAvg + ' ' + l.unit : '—'}</td>
          <td>${l.headacheFreeDayAvg !== null ? l.headacheFreeDayAvg + ' ' + l.unit : '—'}</td>
        </tr>`,
    )
    .join('');

  const episodeRows = data.episodeLog
    .map(
      e =>
        `<tr>
          <td>${e.date}</td>
          <td>${e.intensity !== null ? e.intensity + '/10' : '—'}</td>
          <td>${e.duration || '—'}</td>
          <td>${e.aura.length > 0 ? e.aura.join(', ') : 'No'}</td>
          <td>${e.medications.length > 0 ? e.medications.join(', ') : 'No'}</td>
          <td>${e.healthcareVisit === true ? 'Sí' : e.healthcareVisit === false ? 'No' : '—'}</td>
        </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;padding:32px 24px;max-width:800px;margin:0 auto}
h1{font-size:22px;text-align:center;margin-bottom:2px}
.subtitle{text-align:center;color:#666;font-size:13px;margin-bottom:24px}
h2{font-size:16px;color:#1565C0;border-bottom:2px solid #1565C0;padding-bottom:4px;margin-top:28px;margin-bottom:12px}
.summary-grid{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px}
.summary-card{flex:1;min-width:120px;border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center}
.summary-card .value{font-size:26px;font-weight:700}
.summary-card .label{font-size:11px;color:#666;margin-top:2px}
.badge{display:inline-block;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600}
.badge-chronic{background:#FFEBEE;color:#C62828}
.badge-episodic{background:#E8F5E9;color:#2E7D32}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}
th,td{padding:6px 10px;border:1px solid #ddd;text-align:left}
th{background:#f5f5f5;font-weight:600;font-size:12px}
.bar-row{display:flex;align-items:center;gap:8px;margin:5px 0}
.bar-label{min-width:160px;font-size:13px}
.bar-track{flex:1;height:14px;background:#eee;border-radius:7px;overflow:hidden}
.bar-fill{height:100%;background:#1565C0;border-radius:7px}
.bar-value{font-size:12px;color:#666;min-width:70px;text-align:right}
.intensity-grid{display:flex;gap:10px;margin:8px 0}
.intensity-card{flex:1;border-radius:8px;padding:8px;text-align:center}
.intensity-card .ic-value{font-size:22px;font-weight:700}
.intensity-card .ic-label{font-size:11px}
.mild{background:#E8F5E9;color:#2E7D32}
.moderate{background:#FFF8E1;color:#F57F17}
.severe{background:#FFEBEE;color:#C62828}
.warning{background:#FFF3E0;border-left:4px solid #FF9800;padding:10px 14px;margin:10px 0;border-radius:4px;font-size:13px}
.stat-row{display:flex;flex-wrap:wrap;gap:16px;margin:8px 0;font-size:13px}
.stat-item strong{font-size:18px}
.no-data{color:#999;font-size:13px;font-style:italic}
.disclaimer{margin-top:32px;padding:14px;background:#f5f5f5;border-radius:8px;font-size:10px;color:#888;text-align:center;line-height:1.4}
</style>
</head>
<body>

<h1>Informe Médico de Cefaleas</h1>
<p class="subtitle">Período: ${startDate} — ${endDate} (${data.periodDays} días)</p>

<h2>Resumen del Período</h2>
<div class="summary-grid">
  <div class="summary-card"><div class="value">${data.totalHeadacheDays}</div><div class="label">Días con cefalea</div></div>
  <div class="summary-card"><div class="value">${data.totalCrisisEpisodes}</div><div class="label">Episodios de crisis</div></div>
  <div class="summary-card"><div class="value">${data.headacheDaysPerMonth}</div><div class="label">Días cefalea / mes</div></div>
  <div class="summary-card"><div class="value">${data.avgDaysBetweenCrises ?? '—'}</div><div class="label">Días prom. entre crisis</div></div>
</div>
<p style="text-align:center;margin-top:8px">
  <span class="badge ${data.isChronicPattern ? 'badge-chronic' : 'badge-episodic'}">
    ${data.isChronicPattern ? 'Patrón Crónico (≥15 días/mes)' : 'Patrón Episódico (<15 días/mes)'}
  </span>
</p>

<h2>Frecuencia Mensual</h2>
${
  data.monthlyFrequency.length > 0
    ? `<table><thead><tr><th>Mes</th><th>Días con cefalea</th><th>Crisis</th></tr></thead><tbody>${frequencyRows}</tbody></table>`
    : '<p class="no-data">Sin datos suficientes</p>'
}

<h2>Características de Migraña</h2>
<div class="stat-row">
  <div class="stat-item"><strong>${data.migrainePercentage}%</strong> episodios con alta probabilidad de migraña (score ≥70)</div>
</div>
<div class="stat-row">
  <div class="stat-item"><strong>${data.auraEpisodes}</strong> de ${data.totalCrisisForAura} crisis con aura</div>
</div>
${
  data.painCharacteristics.length > 0
    ? `<h3 style="font-size:13px;margin-top:12px;margin-bottom:6px;color:#444">Características del dolor</h3>${barChart(data.painCharacteristics)}`
    : ''
}
${
  data.associatedSymptoms.length > 0
    ? `<h3 style="font-size:13px;margin-top:12px;margin-bottom:6px;color:#444">Síntomas asociados</h3>${barChart(data.associatedSymptoms)}`
    : ''
}

<h2>Gravedad e Impacto</h2>
<div class="stat-row">
  <div class="stat-item">Intensidad promedio: <strong>${data.avgIntensity !== null ? data.avgIntensity + '/10' : '—'}</strong></div>
  <div class="stat-item">Intensidad máxima: <strong>${data.maxIntensity > 0 ? data.maxIntensity + '/10' : '—'}</strong></div>
</div>
<div class="intensity-grid">
  <div class="intensity-card mild"><div class="ic-value">${data.intensityDistribution.mild}</div><div class="ic-label">Leve (0–3)</div></div>
  <div class="intensity-card moderate"><div class="ic-value">${data.intensityDistribution.moderate}</div><div class="ic-label">Moderado (4–7)</div></div>
  <div class="intensity-card severe"><div class="ic-value">${data.intensityDistribution.severe}</div><div class="ic-label">Severo (8–10)</div></div>
</div>
<div class="stat-row">
  <div class="stat-item">Impacto funcional promedio: <strong>${data.avgActivityImpact !== null ? data.avgActivityImpact + '/10' : '—'}</strong></div>
  <div class="stat-item">Episodios incapacitantes (≥6/10): <strong>${data.totalDisablingEpisodes}</strong></div>
</div>

<h2>Desencadenantes</h2>
${data.triggers.length > 0 ? barChart(data.triggers) : '<p class="no-data">Sin datos de desencadenantes</p>'}

<h2>Estilo de Vida</h2>
<table>
  <thead><tr><th>Factor</th><th>Días con cefalea</th><th>Días sin cefalea</th></tr></thead>
  <tbody>${lifestyleRows}</tbody>
</table>

<h2>Medicación</h2>
<div class="stat-row">
  <div class="stat-item">Días con medicación: <strong>${data.totalMedicationDays}</strong> (${data.avgMedicationDaysPerMonth} / mes)</div>
</div>
${
  data.medicationOveruseWarning
    ? '<div class="warning"><strong>Atención:</strong> El uso de analgésicos supera los 10 días/mes en promedio. Esto puede contribuir a cefalea por uso excesivo de medicación (MOH). Consulte a su médico.</div>'
    : ''
}
${data.medications.length > 0 ? barChart(data.medications) : '<p class="no-data">Sin datos de medicación</p>'}

${
  data.episodeLog.length > 0
    ? `<h2>Registro de Episodios de Crisis</h2>
<table>
  <thead><tr><th>Fecha</th><th>Intensidad</th><th>Duración</th><th>Aura</th><th>Medicación</th><th>Consulta</th></tr></thead>
  <tbody>${episodeRows}</tbody>
</table>`
    : ''
}

<div class="disclaimer">
  Esta información fue generada automáticamente a partir de los registros del paciente en la aplicación.
  No constituye un diagnóstico médico. La evaluación de migraña se basa en los criterios ICHD-3 (criterios B–D).
  Consulte a un profesional de salud para una evaluación completa.
</div>

</body>
</html>`;
}
