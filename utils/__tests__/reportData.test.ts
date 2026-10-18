import type { AnswerEntry, Answers, FormValue } from '../answers';
import type { Entry } from '../entries';
import { dataQualityNote, generateReportData, generateReportHTML } from '../reportData';

const answered = (value: FormValue, extra: Partial<AnswerEntry> = {}): AnswerEntry =>
  ({ status: 'answered', value, ...extra }) as AnswerEntry;

function dayKey(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function entry(kind: Entry['kind'], answers: Answers, overrides: Partial<Entry> = {}): Entry {
  return {
    id: Math.random().toString(36).slice(2),
    kind,
    date: new Date().toISOString(),
    dayKey: dayKey(1),
    answers,
    onsetPrecision: kind === 'crisis' ? 'exact' : null,
    endDate: null,
    endReported: false,
    legacyTimeZone: false,
    needsReview: false,
    ...overrides,
  };
}

describe('generateReportData', () => {
  it('keeps medication and pain-relief measures apart', () => {
    const report = generateReportData([
      entry('checkin', {
        q1_headache: answered(true),
        q5_2_medication: answered(['si', 'ibuprofeno']),
        q6_pain_management: answered(['dormir_descansar']),
      }),
    ]);
    expect(report.totalMedicationDays).toBe(1);
    expect(report.medications.map(m => m.name)).toEqual(['Ibuprofeno']);
  });

  it('counts a day once when it has a check-in and a crisis', () => {
    const report = generateReportData([
      entry('checkin', { q1_headache: answered(true) }),
      entry('crisis', { crisis_intensity: answered(7) }),
    ]);
    expect(report.totalHeadacheDays).toBe(1);
    expect(report.totalCrisisEpisodes).toBe(1);
  });

  it('reads crisis answers by their own question IDs', () => {
    const start = new Date(Date.now() - 30 * 3_600_000);
    const report = generateReportData([
      entry(
        'crisis',
        {
          crisis_intensity: answered(8),
          crisis_aura: answered(['luces']),
          crisis_medication: answered(['si', 'otra_medicacion'], { text: { otra_medicacion: 'naproxeno' } }),
          crisis_healthcare_visit: answered('yes', { text: { yes: 'Urgencias' } }),
        },
        { date: start.toISOString(), endDate: new Date(start.getTime() + 5 * 3_600_000).toISOString(), endReported: true },
      ),
    ]);
    expect(report.maxIntensity).toBe(8);
    expect(report.auraEpisodes).toBe(1);
    expect(report.episodeLog[0]).toMatchObject({
      intensity: 8,
      duration: '5 horas',
      aura: ['Luces'],
      medications: ['naproxeno'],
      healthcareVisit: true,
    });
  });

  it('shows no duration for a crisis closed automatically by an old build', () => {
    const start = new Date(Date.now() - 300 * 3_600_000);
    const report = generateReportData([
      entry('crisis', { crisis_intensity: answered(7) }, { date: start.toISOString(), endDate: new Date().toISOString() }),
    ]);
    expect(report.episodeLog[0].duration).toBeNull();
  });

  it('leaves out old slider defaults and says so', () => {
    const report = generateReportData([
      entry('checkin', {
        q1_headache: answered(true),
        q2_1_intensity: answered(5, { unverified: true } as Partial<AnswerEntry>),
        q_stress: answered(5, { unverified: true } as Partial<AnswerEntry>),
      }),
      entry('checkin', { q1_headache: answered(true), q2_1_intensity: answered(9) }, { dayKey: dayKey(2) }),
    ]);
    expect(report.avgIntensity).toBe(9);
    expect(report.excludedUnverifiedValues).toBe(2);
    expect(dataQualityNote(report)).toMatch(/Se excluyen 2 valores/);
  });

  it('notes records grouped by their UTC date', () => {
    const report = generateReportData([entry('checkin', { q1_headache: answered(false) }, { legacyTimeZone: true })]);
    expect(dataQualityNote(report)).toBe('1 registro antiguo no guardaba la zona horaria y se agrupa por su fecha en UTC.');
  });

  it('has no note for clean data', () => {
    expect(dataQualityNote(generateReportData([entry('checkin', { q1_headache: answered(false) })]))).toBeNull();
  });

  it('ignores entries before the period', () => {
    const report = generateReportData([entry('checkin', { q1_headache: answered(true) }, { dayKey: dayKey(40) })], 30);
    expect(report.totalCheckIns).toBe(0);
  });
});

describe('generateReportHTML', () => {
  it('escapes medication names typed by the user', () => {
    const start = new Date(Date.now() - 30 * 3_600_000);
    const html = generateReportHTML(
      generateReportData([
        entry(
          'crisis',
          { crisis_medication: answered(['si', 'otra_medicacion'], { text: { otra_medicacion: '<b>x</b>' } }) },
          { date: start.toISOString() },
        ),
      ]),
    );
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});
