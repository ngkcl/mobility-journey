import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getSupabase } from '../../lib/supabase';
import {
  buildGreeting,
  buildNextSessionSummary,
  pickDailyTip,
  type NextSessionSummary,
} from '../../lib/homeSummary';
import { loadWorkoutSchedule } from '../../lib/workoutSchedule';
import { computeWorkoutStreak, type WorkoutHistoryItem } from '../../lib/workoutAnalytics';
import type { Workout, WorkoutTemplate } from '../../lib/types';

const DAILY_TIPS = [
  'Release tight tissues first, then activate the weaker side.',
  'Breathe into the ribcage you want to expand.',
  'Slow reps beat rushed reps for corrective work.',
  'Posture resets count even when the day feels busy.',
  'Stability comes from small reps done consistently.',
  'Check your shoulder line before your next set.',
  'Keep the ribs stacked over the pelvis during holds.',
];

const TITLE_FONT = Platform.select({
  ios: 'AvenirNext-DemiBold',
  android: 'serif',
  default: 'serif',
});

const BODY_FONT = Platform.select({
  ios: 'AvenirNext-Regular',
  android: 'sans-serif',
  default: 'sans-serif',
});

const getAccentForTime = (greeting: string) => {
  if (greeting.includes('morning')) return '#f59e0b';
  if (greeting.includes('afternoon')) return '#38bdf8';
  return '#a855f7';
};

export default function HomeScreen() {
  const router = useRouter();
  const [streak, setStreak] = useState(0);
  const [nextSession, setNextSession] = useState<NextSessionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const greeting = useMemo(() => buildGreeting(new Date()), []);
  const tip = useMemo(() => pickDailyTip(DAILY_TIPS, new Date()), []);
  const accent = useMemo(() => getAccentForTime(greeting), [greeting]);

  const loadSummary = async () => {
    const supabase = getSupabase();
    const [schedule, workoutsResult, templatesResult] = await Promise.all([
      loadWorkoutSchedule(),
      supabase
        .from('workouts')
        .select(
          'id, date, type, started_at, ended_at, duration_minutes, notes, energy_level_before, energy_level_after, pain_level_before, pain_level_after',
        )
        .order('date', { ascending: false })
        .limit(90),
      supabase
        .from('workout_templates')
        .select('id, name, type, exercises, estimated_duration_minutes, created_at'),
    ]);

    const workouts = (workoutsResult.data ?? []) as Workout[];
    const history: WorkoutHistoryItem[] = workouts.map((workout) => ({
      workout,
      exercises: [],
    }));

    const templates = (templatesResult.data ?? []) as WorkoutTemplate[];
    const templatesByName = templates.reduce((acc, template) => {
      acc[template.name] = template;
      return acc;
    }, {} as Record<string, WorkoutTemplate>);

    setStreak(computeWorkoutStreak(history));
    setNextSession(buildNextSessionSummary(new Date(), schedule, templatesByName));
    setIsLoading(false);
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSummary();
    setRefreshing(false);
  };

  const primaryCardAccent = nextSession?.sessionKey === 'gym' ? '#f97316' : accent;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />}
      >
        <View style={styles.heroCard}>
          <View style={[styles.heroGlow, { backgroundColor: accent }]} />
          <View style={styles.heroGlowAlt} />
          <Text style={styles.kicker}>Mobility Journey</Text>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.subtitle}>Your posture plan for today is ready.</Text>
          <View style={styles.streakRow}>
            <View style={[styles.streakBadge, { borderColor: accent }]}> 
              <Ionicons name="flame" size={16} color={accent} />
              <Text style={styles.streakText}>{streak} day streak</Text>
            </View>
            <View style={styles.streakBadgeMuted}>
              <Ionicons name="pulse" size={16} color="#38bdf8" />
              <Text style={styles.streakTextMuted}>Consistency focus</Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/workouts')}
          style={({ pressed, hovered }) => [
            styles.summaryCard,
            { borderColor: primaryCardAccent },
            pressed && styles.cardPressed,
            hovered && styles.cardHover,
          ]}
        >
          <View style={[styles.cardGlow, { backgroundColor: primaryCardAccent }]} />
          <View style={styles.cardGlowAlt} />
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.summaryLabel}>Today&apos;s Workout</Text>
              <Text style={styles.summaryTitle}>
                {nextSession?.label ?? (isLoading ? 'Loading plan...' : 'No session scheduled')}
              </Text>
            </View>
            <View style={[styles.badge, { borderColor: primaryCardAccent }]}> 
              <Ionicons name="time" size={14} color={primaryCardAccent} />
              <Text style={[styles.badgeText, { color: primaryCardAccent }]}>Next up</Text>
            </View>
          </View>

          <View style={styles.summaryDetails}>
            <View style={styles.detailPill}>
              <Ionicons name="sunny" size={16} color="#fbbf24" />
              <Text style={styles.detailText}>
                {nextSession?.timeLabel ?? '--'}
                {nextSession?.isTomorrow ? ' tomorrow' : ''}
              </Text>
            </View>
            <View style={styles.detailPill}>
              <Ionicons name="list" size={16} color="#38bdf8" />
              <Text style={styles.detailText}>
                {nextSession?.exerciseCount ?? 0} exercises
              </Text>
            </View>
            <View style={styles.detailPill}>
              <Ionicons name="timer" size={16} color="#a855f7" />
              <Text style={styles.detailText}>
                {nextSession?.estimatedMinutes ?? '--'} min
              </Text>
            </View>
          </View>

          <Text style={styles.summaryFooter}>Tap to start or review your session.</Text>
        </Pressable>

        <View style={styles.gridRow}>
          <Pressable
            onPress={() => router.push('/plan')}
            style={({ pressed, hovered }) => [
              styles.secondaryCard,
              pressed && styles.cardPressed,
              hovered && styles.cardHover,
            ]}
          >
            <View style={[styles.cardGlow, { backgroundColor: '#38bdf8' }]} />
            <Ionicons name="sparkles" size={22} color="#38bdf8" />
            <Text style={styles.secondaryTitle}>AI Daily Plan</Text>
            <Text style={styles.secondaryBody}>Review the AI-tailored balance plan.</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/metrics')}
            style={({ pressed, hovered }) => [
              styles.secondaryCard,
              pressed && styles.cardPressed,
              hovered && styles.cardHover,
            ]}
          >
            <View style={[styles.cardGlow, { backgroundColor: '#a855f7' }]} />
            <Ionicons name="trending-up" size={22} color="#a855f7" />
            <Text style={styles.secondaryTitle}>Metrics Check-in</Text>
            <Text style={styles.secondaryBody}>Log pain and posture scores.</Text>
          </Pressable>
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipGlow} />
          <Text style={styles.tipLabel}>Daily tip</Text>
          <Text style={styles.tipText}>{tip}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  heroCard: {
    backgroundColor: '#0f172a',
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
  },
  heroGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.2,
    top: -90,
    right: -60,
  },
  heroGlowAlt: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#38bdf8',
    opacity: 0.12,
    bottom: -80,
    left: -40,
  },
  kicker: {
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: BODY_FONT,
  },
  greeting: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
    fontFamily: TITLE_FONT,
  },
  subtitle: {
    color: '#cbd5f5',
    fontSize: 15,
    marginTop: 6,
    fontFamily: BODY_FONT,
  },
  streakRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(15,23,42,0.8)',
  },
  streakText: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 13,
    fontFamily: BODY_FONT,
  },
  streakBadgeMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.3)',
    backgroundColor: 'rgba(15,23,42,0.7)',
  },
  streakTextMuted: {
    color: '#e2e8f0',
    fontWeight: '500',
    fontSize: 13,
    fontFamily: BODY_FONT,
  },
  summaryCard: {
    backgroundColor: '#0b1120',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  cardGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.18,
    top: -80,
    right: -40,
  },
  cardGlowAlt: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#0ea5e9',
    opacity: 0.08,
    bottom: -70,
    left: -50,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryLabel: {
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: BODY_FONT,
  },
  summaryTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
    fontFamily: TITLE_FONT,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(15,23,42,0.7)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: BODY_FONT,
  },
  summaryDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  detailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
  },
  detailText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '500',
    fontFamily: BODY_FONT,
  },
  summaryFooter: {
    color: '#94a3b8',
    marginTop: 14,
    fontSize: 12,
    fontFamily: BODY_FONT,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  secondaryCard: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  secondaryTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    fontFamily: TITLE_FONT,
  },
  secondaryBody: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 6,
    fontFamily: BODY_FONT,
  },
  tipCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    overflow: 'hidden',
  },
  tipGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#22d3ee',
    opacity: 0.08,
    top: -60,
    right: -40,
  },
  tipLabel: {
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: BODY_FONT,
  },
  tipText: {
    color: '#e2e8f0',
    fontSize: 15,
    marginTop: 8,
    lineHeight: 21,
    fontFamily: BODY_FONT,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  cardHover: {
    transform: [{ scale: 1.01 }],
  },
});
