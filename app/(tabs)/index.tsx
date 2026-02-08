import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const sections: { title: string; items: { label: string; icon: IconName; route: string; color: string }[] }[] = [
  {
    title: 'Quick Actions',
    items: [
      { label: 'Start Workout', icon: 'fitness', route: '/(tabs)/workouts', color: '#14b8a6' },
      { label: "Today's Plan", icon: 'sparkles', route: '/(tabs)/plan', color: '#a78bfa' },
      { label: 'Posture Check', icon: 'body', route: '/(tabs)/posture', color: '#22c55e' },
    ],
  },
  {
    title: 'Track & Log',
    items: [
      { label: 'Health & Recovery', icon: 'heart-circle', route: '/(tabs)/health', color: '#ef4444' },
      { label: 'Progress Photos', icon: 'camera', route: '/(tabs)/photos', color: '#3b82f6' },
      { label: 'Videos', icon: 'videocam', route: '/(tabs)/videos', color: '#f59e0b' },
      { label: 'Metrics', icon: 'pulse', route: '/(tabs)/metrics', color: '#94a3b8' },
    ],
  },
  {
    title: 'Program',
    items: [
      { label: 'Monthly Program', icon: 'calendar', route: '/(tabs)/program', color: '#14b8a6' },
      { label: 'Exercise Library', icon: 'barbell', route: '/(tabs)/exercises', color: '#f97316' },
    ],
  },
  {
    title: 'Review',
    items: [
      { label: 'Protocol', icon: 'checkbox', route: '/(tabs)/todos', color: '#06b6d4' },
      { label: 'Analysis', icon: 'document-text', route: '/(tabs)/analysis', color: '#8b5cf6' },
      { label: 'Camera Posture', icon: 'aperture', route: '/(tabs)/posture-camera', color: '#ec4899' },
    ],
  },
];

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>💪 Let's get after it</Text>
        <Text style={styles.subtitle}>Your posture & workout tracker</Text>
      </View>

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.grid}>
            {section.items.map((item) => (
              <Pressable
                key={item.label}
                style={styles.card}
                onPress={() => router.push(item.route as any)}
              >
                <View style={[styles.iconCircle, { backgroundColor: item.color + '22' }]}>
                  <Ionicons name={item.icon as any} size={24} color={item.color} />
                </View>
                <Text style={styles.cardLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 28,
    marginTop: 8,
  },
  greeting: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#94a3b8',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    width: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.5)',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
  },
});
