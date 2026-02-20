import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View as RNView,
} from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { getAllCheckIns } from '@/utils/storage';
import {
  generateReportData,
  generateReportHTML,
  ReportData,
} from '@/utils/reportData';

type PeriodOption = 30 | 60 | 90;

export default function ReportScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const tint = Colors[colorScheme ?? 'light'].tint;
  const textColor = Colors[colorScheme ?? 'light'].text;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [period, setPeriod] = useState<PeriodOption>(90);

  const loadReport = useCallback(async (days: PeriodOption) => {
    setLoading(true);
    try {
      const checkIns = await getAllCheckIns();
      const report = generateReportData(checkIns, days);
      setData(report);
    } catch (e) {
      console.error('Error generating report:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport(period);
  }, [period, loadReport]);

  const handleShare = async () => {
    if (!data) return;
    setSharing(true);
    try {
      const html = generateReportHTML(data);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } catch (e) {
      console.error('Error sharing PDF:', e);
    } finally {
      setSharing(false);
    }
  };

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const borderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  // --- Section helper components ---

  const SectionTitle = ({ children }: { children: string }) => (
    <Text style={[styles.sectionTitle, { color: tint }]}>{children}</Text>
  );

  const Card = ({ children, style }: { children: React.ReactNode; style?: object }) => (
    <RNView style={[styles.card, { backgroundColor: cardBg, borderColor }, style]}>
      {children}
    </RNView>
  );

  const StatBox = ({ value, label, color }: { value: string | number; label: string; color?: string }) => (
    <RNView style={[styles.statBox, { borderColor }]}>
      <Text style={[styles.statValue, color ? { color } : undefined]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </RNView>
  );

  const BarRow = ({ name, percentage, count }: { name: string; percentage: number; count: number }) => (
    <RNView style={styles.barRow}>
      <Text style={styles.barLabel}>{name}</Text>
      <RNView style={styles.barTrack}>
        <RNView style={[styles.barFill, { width: `${percentage}%`, backgroundColor: tint }]} />
      </RNView>
      <Text style={styles.barValue}>{count} ({percentage}%)</Text>
    </RNView>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <RNView style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <FontAwesome name="arrow-left" size={20} color={textColor} />
        </Pressable>
        <Text style={styles.headerTitle}>Informe Médico</Text>
        <Pressable
          onPress={handleShare}
          disabled={!data || loading || sharing}
          style={[styles.headerButton, (!data || loading || sharing) && { opacity: 0.3 }]}
        >
          {sharing ? (
            <ActivityIndicator size="small" color={tint} />
          ) : (
            <FontAwesome name="share-square-o" size={20} color={tint} />
          )}
        </Pressable>
      </RNView>

      {/* Period picker */}
      <RNView style={styles.periodRow}>
        {([30, 60, 90] as PeriodOption[]).map(opt => (
          <Pressable
            key={opt}
            onPress={() => setPeriod(opt)}
            style={[
              styles.periodChip,
              { borderColor: tint },
              period === opt && { backgroundColor: tint },
            ]}
          >
            <Text
              style={[
                styles.periodChipText,
                { color: period === opt ? (isDark ? '#000' : '#fff') : tint },
              ]}
            >
              {opt} días
            </Text>
          </Pressable>
        ))}
      </RNView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tint} />
          <Text style={styles.loadingText}>Generando informe...</Text>
        </View>
      ) : !data || data.totalCheckIns === 0 ? (
        <View style={styles.centered}>
          <FontAwesome name="file-text-o" size={48} color={isDark ? '#666' : '#888'} />
          <Text style={styles.emptyTitle}>Sin datos</Text>
          <Text style={styles.emptySubtitle}>
            No hay registros en los últimos {period} días. Haz check-ins diarios para generar tu informe.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* --- SUMMARY --- */}
          <SectionTitle>Resumen del Período</SectionTitle>
          <RNView style={styles.statsGrid}>
            <StatBox value={data.totalHeadacheDays} label="Días con cefalea" />
            <StatBox value={data.totalCrisisEpisodes} label="Crisis" />
            <StatBox value={data.headacheDaysPerMonth} label="Días cefalea / mes" />
            <StatBox
              value={data.avgDaysBetweenCrises ?? '—'}
              label="Días prom. entre crisis"
            />
          </RNView>
          <RNView style={styles.badgeRow}>
            <RNView
              style={[
                styles.badge,
                data.isChronicPattern
                  ? { backgroundColor: isDark ? 'rgba(198,40,40,0.3)' : '#FFEBEE' }
                  : { backgroundColor: isDark ? 'rgba(46,125,50,0.3)' : '#E8F5E9' },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: data.isChronicPattern
                      ? (isDark ? '#ef9a9a' : '#C62828')
                      : (isDark ? '#a5d6a7' : '#2E7D32') },
                ]}
              >
                {data.isChronicPattern
                  ? 'Patrón Crónico (≥15 días/mes)'
                  : 'Patrón Episódico (<15 días/mes)'}
              </Text>
            </RNView>
          </RNView>

          {/* --- FREQUENCY --- */}
          {data.monthlyFrequency.length > 0 && (
            <>
              <SectionTitle>Frecuencia Mensual</SectionTitle>
              <Card>
                <RNView style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, { flex: 1 }]}>Mes</Text>
                  <Text style={[styles.tableHeaderText, { width: 70, textAlign: 'center' }]}>Cefalea</Text>
                  <Text style={[styles.tableHeaderText, { width: 60, textAlign: 'center' }]}>Crisis</Text>
                </RNView>
                {data.monthlyFrequency.map((m, i) => (
                  <RNView
                    key={i}
                    style={[
                      styles.tableRow,
                      i < data.monthlyFrequency.length - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor },
                    ]}
                  >
                    <Text style={[styles.tableCell, { flex: 1 }]}>{m.label}</Text>
                    <Text style={[styles.tableCell, { width: 70, textAlign: 'center' }]}>{m.headacheDays}</Text>
                    <Text style={[styles.tableCell, { width: 60, textAlign: 'center' }]}>{m.crisisEpisodes}</Text>
                  </RNView>
                ))}
              </Card>
            </>
          )}

          {/* --- MIGRAINE --- */}
          <SectionTitle>Características de Migraña</SectionTitle>
          <Card>
            <Text style={styles.cardStat}>
              <Text style={styles.cardStatBold}>{data.migrainePercentage}%</Text> episodios con
              alta probabilidad de migraña
            </Text>
            <Text style={[styles.cardStat, { marginTop: 6 }]}>
              <Text style={styles.cardStatBold}>{data.auraEpisodes}</Text> de{' '}
              {data.totalCrisisForAura} crisis con aura
            </Text>
          </Card>
          {data.painCharacteristics.length > 0 && (
            <Card style={{ marginTop: 8 }}>
              <Text style={styles.cardSubtitle}>Características del dolor</Text>
              {data.painCharacteristics.map((p, i) => (
                <BarRow key={i} name={p.name} percentage={p.percentage} count={p.count} />
              ))}
            </Card>
          )}
          {data.associatedSymptoms.length > 0 && (
            <Card style={{ marginTop: 8 }}>
              <Text style={styles.cardSubtitle}>Síntomas asociados</Text>
              {data.associatedSymptoms.map((s, i) => (
                <BarRow key={i} name={s.name} percentage={s.percentage} count={s.count} />
              ))}
            </Card>
          )}

          {/* --- SEVERITY --- */}
          <SectionTitle>Gravedad e Impacto</SectionTitle>
          <RNView style={styles.statsGrid}>
            <StatBox
              value={data.avgIntensity !== null ? `${data.avgIntensity}` : '—'}
              label="Intensidad promedio"
            />
            <StatBox
              value={data.maxIntensity > 0 ? `${data.maxIntensity}` : '—'}
              label="Intensidad máxima"
            />
          </RNView>
          <RNView style={styles.intensityRow}>
            <RNView style={[styles.intensityCard, { backgroundColor: isDark ? 'rgba(46,125,50,0.2)' : '#E8F5E9' }]}>
              <Text style={[styles.intensityValue, { color: isDark ? '#66BB6A' : '#2E7D32' }]}>
                {data.intensityDistribution.mild}
              </Text>
              <Text style={[styles.intensityLabel, { color: isDark ? '#66BB6A' : '#2E7D32' }]}>Leve</Text>
            </RNView>
            <RNView style={[styles.intensityCard, { backgroundColor: isDark ? 'rgba(245,127,23,0.2)' : '#FFF8E1' }]}>
              <Text style={[styles.intensityValue, { color: isDark ? '#FFA726' : '#F57F17' }]}>
                {data.intensityDistribution.moderate}
              </Text>
              <Text style={[styles.intensityLabel, { color: isDark ? '#FFA726' : '#F57F17' }]}>Moderado</Text>
            </RNView>
            <RNView style={[styles.intensityCard, { backgroundColor: isDark ? 'rgba(198,40,40,0.2)' : '#FFEBEE' }]}>
              <Text style={[styles.intensityValue, { color: isDark ? '#EF5350' : '#C62828' }]}>
                {data.intensityDistribution.severe}
              </Text>
              <Text style={[styles.intensityLabel, { color: isDark ? '#EF5350' : '#C62828' }]}>Severo</Text>
            </RNView>
          </RNView>
          <RNView style={styles.statsGrid}>
            <StatBox
              value={data.avgActivityImpact !== null ? `${data.avgActivityImpact}` : '—'}
              label="Impacto funcional prom."
            />
            <StatBox
              value={data.totalDisablingEpisodes}
              label="Episodios incapacitantes"
              color="#C62828"
            />
          </RNView>

          {/* --- TRIGGERS --- */}
          <SectionTitle>Desencadenantes</SectionTitle>
          {data.triggers.length > 0 ? (
            <Card>
              {data.triggers.map((t, i) => (
                <BarRow key={i} name={t.name} percentage={t.percentage} count={t.count} />
              ))}
            </Card>
          ) : (
            <Text style={styles.noData}>Sin datos de desencadenantes</Text>
          )}

          {/* --- LIFESTYLE --- */}
          <SectionTitle>Estilo de Vida</SectionTitle>
          <Card>
            <RNView style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Factor</Text>
              <Text style={[styles.tableHeaderText, { width: 80, textAlign: 'center' }]}>
                Con cefalea
              </Text>
              <Text style={[styles.tableHeaderText, { width: 80, textAlign: 'center' }]}>
                Sin cefalea
              </Text>
            </RNView>
            {data.lifestyleComparison.map((l, i) => (
              <RNView
                key={i}
                style={[
                  styles.tableRow,
                  i < data.lifestyleComparison.length - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor },
                ]}
              >
                <Text style={[styles.tableCell, { flex: 1 }]}>{l.metric}</Text>
                <Text style={[styles.tableCell, { width: 80, textAlign: 'center' }]}>
                  {l.headacheDayAvg !== null ? `${l.headacheDayAvg} ${l.unit}` : '—'}
                </Text>
                <Text style={[styles.tableCell, { width: 80, textAlign: 'center' }]}>
                  {l.headacheFreeDayAvg !== null ? `${l.headacheFreeDayAvg} ${l.unit}` : '—'}
                </Text>
              </RNView>
            ))}
          </Card>

          {/* --- MEDICATION --- */}
          <SectionTitle>Medicación</SectionTitle>
          <Card>
            <Text style={styles.cardStat}>
              Días con medicación:{' '}
              <Text style={styles.cardStatBold}>{data.totalMedicationDays}</Text> (
              {data.avgMedicationDaysPerMonth} / mes)
            </Text>
          </Card>
          {data.medicationOveruseWarning && (
            <RNView style={[
              styles.warningCard,
              { backgroundColor: isDark ? 'rgba(255,152,0,0.15)' : '#FFF3E0' },
            ]}>
              <Text style={[styles.warningText, { color: isDark ? '#ffb74d' : '#5D4037' }]}>
                <Text style={{ fontWeight: '700' }}>Atención: </Text>El uso de analgésicos supera
                los 10 días/mes en promedio. Esto puede contribuir a cefalea por uso excesivo de
                medicación (MOH).
              </Text>
            </RNView>
          )}
          {data.medications.length > 0 && (
            <Card style={{ marginTop: 8 }}>
              {data.medications.map((m, i) => (
                <BarRow key={i} name={m.name} percentage={m.percentage} count={m.count} />
              ))}
            </Card>
          )}

          {/* --- EPISODE LOG --- */}
          {data.episodeLog.length > 0 && (
            <>
              <SectionTitle>Registro de Crisis</SectionTitle>
              {data.episodeLog.map((e, i) => (
                <Card key={i} style={{ marginBottom: 8 }}>
                  <Text style={styles.episodeDate}>{e.date}</Text>
                  <RNView style={styles.episodeRow}>
                    <Text style={styles.episodeField}>Intensidad</Text>
                    <Text style={styles.episodeValue}>
                      {e.intensity !== null ? `${e.intensity}/10` : '—'}
                    </Text>
                  </RNView>
                  <RNView style={styles.episodeRow}>
                    <Text style={styles.episodeField}>Duración</Text>
                    <Text style={styles.episodeValue}>{e.duration || '—'}</Text>
                  </RNView>
                  <RNView style={styles.episodeRow}>
                    <Text style={styles.episodeField}>Aura</Text>
                    <Text style={styles.episodeValue}>
                      {e.aura.length > 0 ? e.aura.join(', ') : 'No'}
                    </Text>
                  </RNView>
                  <RNView style={styles.episodeRow}>
                    <Text style={styles.episodeField}>Medicación</Text>
                    <Text style={styles.episodeValue}>
                      {e.medications.length > 0 ? e.medications.join(', ') : 'No'}
                    </Text>
                  </RNView>
                  <RNView style={styles.episodeRow}>
                    <Text style={styles.episodeField}>Consulta</Text>
                    <Text style={styles.episodeValue}>
                      {e.healthcareVisit === true ? 'Sí' : e.healthcareVisit === false ? 'No' : '—'}
                    </Text>
                  </RNView>
                </Card>
              ))}
            </>
          )}

          {/* Disclaimer */}
          <Text style={styles.disclaimer}>
            Esta información fue generada automáticamente y no constituye un diagnóstico médico. La
            evaluación de migraña se basa en los criterios ICHD-3. Consulte a un profesional de
            salud para una evaluación completa.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  periodChip: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  periodChipText: { fontSize: 13, fontWeight: '600' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: { marginTop: 12, fontSize: 14, opacity: 0.6 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16, opacity: 0.6 },
  emptySubtitle: {
    fontSize: 14,
    opacity: 0.55,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 260,
  },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 11, opacity: 0.6, textAlign: 'center', marginTop: 2 },
  badgeRow: { alignItems: 'center', marginTop: 4, marginBottom: 8 },
  badge: { paddingVertical: 4, paddingHorizontal: 14, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  cardSubtitle: { fontSize: 13, fontWeight: '600', marginBottom: 6, opacity: 0.7 },
  cardStat: { fontSize: 13 },
  cardStatBold: { fontWeight: '700', fontSize: 17 },
  tableHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(128,128,128,0.2)' },
  tableHeaderText: { fontSize: 12, fontWeight: '600', opacity: 0.6 },
  tableRow: { flexDirection: 'row', paddingVertical: 6 },
  tableCell: { fontSize: 13 },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 3,
  },
  barLabel: { width: 120, fontSize: 12 },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: 'rgba(128,128,128,0.15)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 5 },
  barValue: { width: 65, fontSize: 11, opacity: 0.6, textAlign: 'right' },
  intensityRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  intensityCard: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  intensityValue: { fontSize: 22, fontWeight: '700' },
  intensityLabel: { fontSize: 11, marginTop: 2 },
  warningCard: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
    borderRadius: 6,
    padding: 12,
    marginVertical: 8,
  },
  warningText: { fontSize: 13 },
  episodeDate: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  episodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  episodeField: { fontSize: 12, opacity: 0.6 },
  episodeValue: { fontSize: 12, fontWeight: '500' },
  noData: { fontSize: 13, opacity: 0.55, fontStyle: 'italic' },
  disclaimer: {
    marginTop: 24,
    fontSize: 11,
    opacity: 0.55,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 12,
  },
});
