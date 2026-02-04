import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

// Types
type ResourceType = 'video' | 'article';

interface Resource {
  id: string;
  title: string;
  type: ResourceType;
  description: string;
}

interface Category {
  id: string;
  name: string;
  resources: Resource[];
}

// Placeholder data
const CATEGORIES: Category[] = [
  {
    id: 'general',
    name: 'General',
    resources: [
      { id: 'g1', title: 'Qué es la migraña', type: 'video', description: 'Introducción completa a la migraña' },
      { id: 'g2', title: 'Síntomas comunes', type: 'article', description: 'Aprende a identificar los síntomas' },
      { id: 'g3', title: 'Causas y factores', type: 'video', description: 'Descubre qué provoca la migraña' },
      { id: 'g4', title: 'Tipos de migraña', type: 'article', description: 'Conoce las diferentes variantes' },
      { id: 'g5', title: 'Cuándo consultar', type: 'article', description: 'Señales de alerta importantes' },
    ],
  },
  {
    id: 'relajacion',
    name: 'Relajación',
    resources: [
      { id: 'r1', title: 'Respiración profunda', type: 'video', description: 'Técnica de 4-7-8 para calmar' },
      { id: 'r2', title: 'Meditación guiada', type: 'video', description: '10 minutos de paz mental' },
      { id: 'r3', title: 'Yoga para migraña', type: 'video', description: 'Posturas que alivian la tensión' },
      { id: 'r4', title: 'Técnicas de relajación', type: 'article', description: 'Métodos probados científicamente' },
      { id: 'r5', title: 'Mindfulness diario', type: 'article', description: 'Incorpora la atención plena' },
    ],
  },
  {
    id: 'medicamentos',
    name: 'Medicamentos',
    resources: [
      { id: 'm1', title: 'Analgésicos comunes', type: 'article', description: 'Guía de medicamentos básicos' },
      { id: 'm2', title: 'Triptanes explicados', type: 'video', description: 'Cómo funcionan los triptanes' },
      { id: 'm3', title: 'Prevención farmacológica', type: 'article', description: 'Opciones preventivas disponibles' },
      { id: 'm4', title: 'Efectos secundarios', type: 'article', description: 'Lo que debes saber' },
      { id: 'm5', title: 'Nuevos tratamientos', type: 'video', description: 'Avances recientes en medicina' },
    ],
  },
  {
    id: 'tips',
    name: 'Tips',
    resources: [
      { id: 't1', title: 'Diario de migrañas', type: 'article', description: 'Cómo llevar un registro efectivo' },
      { id: 't2', title: 'Alimentación saludable', type: 'video', description: 'Alimentos que ayudan y evitan' },
      { id: 't3', title: 'Rutina de sueño', type: 'article', description: 'Mejora tu descanso nocturno' },
      { id: 't4', title: 'Hidratación adecuada', type: 'video', description: 'Importancia del agua' },
      { id: 't5', title: 'Manejo del estrés', type: 'article', description: 'Estrategias para el día a día' },
    ],
  },
];

// Resource Card Component
function ResourceCard({ resource }: { resource: Resource }) {
  const isVideo = resource.type === 'video';

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardContent}>
        {/* Thumbnail placeholder */}
        <View style={styles.thumbnail} lightColor="#e8e8e8" darkColor="#2a2a2a">
          <FontAwesome
            name={isVideo ? 'play-circle' : 'file-text-o'}
            size={32}
            color={isVideo ? '#e74c3c' : '#3498db'}
          />
        </View>

        {/* Card info */}
        <View style={styles.cardInfo}>
          <View style={styles.typeRow}>
            <FontAwesome
              name={isVideo ? 'video-camera' : 'newspaper-o'}
              size={12}
              color={isVideo ? '#e74c3c' : '#3498db'}
            />
            <Text style={[styles.typeLabel, { color: isVideo ? '#e74c3c' : '#3498db' }]}>
              {isVideo ? 'Video' : 'Artículo'}
            </Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {resource.title}
          </Text>
          <Text style={styles.cardDescription} numberOfLines={2}>
            {resource.description}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// Category Section Component
function CategorySection({ category }: { category: Category }) {
  return (
    <View style={styles.categoryContainer}>
      <Text style={styles.categoryTitle}>{category.name}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContent}
      >
        {category.resources.map((resource) => (
          <ResourceCard key={resource.id} resource={resource} />
        ))}
      </ScrollView>
    </View>
  );
}

// Main Screen
export default function BibliotecaScreen() {
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerTitle}>Biblioteca</Text>
        <Text style={styles.headerSubtitle}>
          Videos y artículos sobre el manejo de la migraña
        </Text>

        {CATEGORIES.map((category) => (
          <CategorySection key={category.id} category={category} />
        ))}

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
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
    paddingTop: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  categoryContainer: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 20,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  carouselContent: {
    paddingHorizontal: 12,
  },
  card: {
    width: 180,
    marginHorizontal: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  cardContent: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnail: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  cardInfo: {
    padding: 12,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 18,
  },
  cardDescription: {
    fontSize: 12,
    opacity: 0.7,
    lineHeight: 16,
  },
  bottomSpacer: {
    height: 20,
  },
});















