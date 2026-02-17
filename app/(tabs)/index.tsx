import React, { useEffect, useMemo, useState } from 'react';
import { tapLight } from '../../lib/haptics';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getSupabase } from '../../lib/supabase';
import { shouldAutoGenerateReport, getOrGenerateReport } from '../../lib/weeklyReportStorage';
import {
  buildGreeting,
  buildNextSessionSummary,
  pickDailyTip,
  type NextSessionSummary,
} from '../../lib/homeSummary';
import { loadWorkoutSchedule } from '../../lib/workoutSchedule';
import { computeStreakStats, type WorkoutHistoryItem, type StreakStats } from '../../lib/workoutAnalytics';
import {
  colors,
  typography,
  spacing,
  radii,
  shared,
  getGreeting as getThemeGreeting,
  getDailyTip,
} from '@/lib/theme';
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

const getAccentForTime = (greeting: string) => {
  if (greeting.includes('morning')) return colors.morning;
  if (greeting.includes('afternoon')) return colors.midday;
  return colors.evening;
};

export default function HomeScreen() {
  const router = useRouter();
  const [streakStats, setStreakStats] = useState<StreakStats>({ currentStreak: 0, bestStreak: 0, totalWorkoutDays: 0, workoutDates: [] });
  const [nextSession, setNextSession] = useState<NextSessionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newReportReady, setNewReportReady] = useState(false);

  const greeting = useMemo(() => buildGreeting(new Date()), []);
  const tip = useMemo(() => getDailyTip(), []);
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

    setStreakStats(computeStreakStats(history));
    setNextSession(buildNextSessionSummary(new Date(), schedule, templatesByName));
    setIsLoading(false);
  };

  useEffect(() => {
    loadSummary();
    // WR-006: Auto-generate last week's report on app open (Mon/Tue)
    (async () => {
      try {
        const { should, weekStart } = await shouldAutoGenerateReport();
        if (should && weekStart) {
          await getOrGenerateReport(weekStart);
          setNewReportReady(true);
        }
      } catch (e) {
        // Silent fail — don't block home screen
        console.warn('Auto-report generation failed:', e);
      }
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSummary();
    setRefreshing(false);
  };

  const primaryCardAccent = nextSession?.sessionKey === 'gym' ? colors.rightSide : accent;

  return (
    <View style={shared.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
      >
        {/* Hero Card */}
        <View style={styles.heroCard}>
          <View style={[styles.heroGlow, { backgroundColor: accent }]} />
          <View style={styles.heroGlowAlt} />
          <Text style={styles.kicker}>Mobility Journey</Text>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.subtitle}>Your posture plan for today is ready.</Text>
          <View style={styles.streakRow}>
            <View style={[styles.streakBadge, { borderColor: accent }]}>
              <Ionicons name="flame" size={16} color={accent} />
              <Text style={styles.streakText}>{streakStats.currentStreak} day streak</Text>
            </View>
            {streakStats.bestStreak > 0 && (
              <View style={[styles.streakBadge, { borderColor: colors.warning }]}>
                <Ionicons name="trophy" size={16} color={colors.warning} />
                <Text style={styles.streakText}>Best: {streakStats.bestStreak}</Text>
              </View>
            )}
            {streakStats.totalWorkoutDays > 0 && (
              <View style={styles.streakBadgeMuted}>
                <Ionicons name="calendar" size={16} color={colors.midday} />
                <Text style={styles.streakTextMuted}>{streakStats.totalWorkoutDays} total days</Text>
              </View>
            )}
          </View>
        </View>

        {/* Today's Workout Card */}
        <Pressable
          onPress={() => { tapLight(); router.push('/workouts'); }}
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
              <Ionicons name="sunny" size={16} color={colors.morning} />
              <Text style={styles.detailText}>
                {nextSession?.timeLabel ?? '--'}
                {nextSession?.isTomorrow ? ' tomorrow' : ''}
              </Text>
            </View>
            <View style={styles.detailPill}>
              <Ionicons name="list" size={16} color={colors.midday} />
              <Text style={styles.detailText}>
                {nextSession?.exerciseCount ?? 0} exercises
              </Text>
            </View>
            <View style={styles.detailPill}>
              <Ionicons name="timer" size={16} color={colors.evening} />
              <Text style={styles.detailText}>
                {nextSession?.estimatedMinutes ?? '--'} min
              </Text>
            </View>
          </View>

          <Text style={styles.summaryFooter}>Tap to start or review your session.</Text>
        </Pressable>

        {/* Quick Action Grid */}
        <View style={styles.gridRow}>
          <Pressable
            onPress={() => router.push('/plan')}
            style={({ pressed, hovered }) => [
              styles.secondaryCard,
              pressed && styles.cardPressed,
              hovered && styles.cardHover,
            ]}
          >
            <View style={[styles.cardGlow, { backgroundColor: colors.midday }]} />
            <Ionicons name="sparkles" size={22} color={colors.midday} />
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
            <View style={[styles.cardGlow, { backgroundColor: colors.evening }]} />
            <Ionicons name="trending-up" size={22} color={colors.evening} />
            <Text style={styles.secondaryTitle}>Metrics Check-in</Text>
            <Text style={styles.secondaryBody}>Log pain and posture scores.</Text>
          </Pressable>
        </View>

        {/* New Report Banner */}
        {newReportReady && (
          <Pressable
            onPress={() => {
              setNewReportReady(false);
              router.push('/reports');
            }}
            style={({ pressed }) => [
              styles.reportBanner,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons name="document-text" size={20} color={colors.teal} />
            <Text style={styles.reportBannerText}>New weekly report available</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        )}

        {/* Daily Tip */}
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
  content: {
    padding: spacing.xl,
    paddingBottom: 120,
  },
  heroCard: {
    backgroundColor: colors.bgBase,
    borderRadius: radii['2xl'],
    padding: spacing.xl,
    marginBottom: spacing.lg + 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
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
    backgroundColor: colors.midday,
    opacity: 0.12,
    bottom: -80,
    left: -40,
  },
  kicker: {
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 2,
    ...typography.small,
  },
  greeting: {
    color: colors.textPrimary,
    ...typography.hero,
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
    marginTop: spacing.xs + 2,
  },
  streakRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: spacing.lg,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    backgroundColor: colors.bgOverlay,
  },
  streakText: {
    color: colors.textPrimary,
    ...typography.captionMedium,
  },
  streakBadgeMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.middayBorder,
    backgroundColor: colors.bgCardAlt,
  },
  streakTextMuted: {
    color: colors.textSecondary,
    ...typography.captionMedium,
  },
  summaryCard: {
    backgroundColor: colors.bgDeep,
    borderRadius: radii['2xl'],
    padding: spacing.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.lg + 2,
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
    backgroundColor: colors.info,
    opacity: 0.08,
    bottom: -70,
    left: -50,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryLabel: {
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    ...typography.tiny,
  },
  summaryTitle: {
    color: colors.textPrimary,
    ...typography.h2,
    marginTop: spacing.xs + 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.full,
    borderWidth: 1,
    backgroundColor: colors.bgCardAlt,
  },
  badgeText: {
    ...typography.tiny,
  },
  summaryDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: spacing.lg,
  },
  detailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md + 2,
    backgroundColor: colors.bgOverlay,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  detailText: {
    color: colors.textSecondary,
    ...typography.captionMedium,
  },
  summaryFooter: {
    color: colors.textTertiary,
    marginTop: spacing.md + 2,
    ...typography.small,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg + 2,
  },
  secondaryCard: {
    flex: 1,
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  secondaryTitle: {
    color: colors.textPrimary,
    ...typography.bodySemibold,
    marginTop: 10,
  },
  secondaryBody: {
    color: colors.textTertiary,
    ...typography.small,
    marginTop: spacing.xs + 2,
  },
  reportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing.md + 2,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.teal,
    gap: spacing.sm,
  },
  reportBannerText: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: '600',
  },
  tipCard: {
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing.lg + 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  tipGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.tealLight,
    opacity: 0.08,
    top: -60,
    right: -40,
  },
  tipLabel: {
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    ...typography.tiny,
  },
  tipText: {
    color: colors.textSecondary,
    ...typography.body,
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  cardHover: {
    transform: [{ scale: 1.01 }],
  },
});
