import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { loadProfileStats, type ProfileStats } from '@/lib/profileStats';
import { BADGE_DEFINITIONS, type BadgeType } from '@/lib/badges';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const screenWidth = Dimensions.get('window').width;

// ── Quick Link Config ────────────────────────────────────────────────────────

type QuickLink = {
  title: string;
  subtitle: string;
  icon: IoniconsName;
  iconColor: string;
  route: string;
};

const QUICK_LINKS: QuickLink[] = [
  {
    title: 'Progress Photos',
    subtitle: 'Visual tracking & comparisons',
    icon: 'camera',
    iconColor: colors.teal,
    route: '/photos',
  },
  {
    title: 'Exercise Library',
    subtitle: 'Browse & manage exercises',
    icon: 'barbell',
    iconColor: colors.info,
    route: '/exercises',
  },
  {
    title: 'Health & Recovery',
    subtitle: 'Sleep, HRV, and readiness',
    icon: 'heart',
    iconColor: colors.error,
    route: '/health',
  },
  {
    title: 'Charts & Analytics',
    subtitle: 'Deep dive into your data',
    icon: 'stats-chart',
    iconColor: colors.symmetry,
    route: '/charts',
  },
  {
    title: 'Program',
    subtitle: 'Base program & protocols',
    icon: 'calendar',
    iconColor: colors.morning,
    route: '/program',
  },
  {
    title: 'Metrics Log',
    subtitle: 'Daily check-ins',
    icon: 'pulse',
    iconColor: colors.success,
    route: '/metrics',
  },
];

// ── Helper ───────────────────────────────────────────────────────────────────

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllBadges, setShowAllBadges] = useState(false);

  const load = async () => {
    try {
      const data = await loadProfileStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load profile stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={shared.screen}>
        <View style={{ padding: spacing['3xl'] }}>
          <LoadingState label="Loading profile..." />
        </View>
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={shared.screen}>
        <EmptyState
          icon="person-outline"
          title="No data yet"
          description="Start your first workout or check-in to see your profile stats."
        />
      </View>
    );
  }

  const allBadgeTypes = Object.keys(BADGE_DEFINITIONS) as BadgeType[];
  const earnedTypes = new Set(stats.badges.map((b) => b.type));

  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealLight} />
      }
    >
      {/* ── Hero Card ─────────────────────────────────────────── */}
      <View style={s.heroCard}>
        <View style={s.heroIconWrap}>
          <Text style={s.heroIcon}>🧘</Text>
        </View>
        <Text style={s.heroTitle}>Mobility Journey</Text>
        {stats.firstActivityDate && (
          <Text style={s.heroSubtitle}>
            Day {stats.daysSinceStart} · Started{' '}
            {format(new Date(stats.firstActivityDate), 'MMM d, yyyy')}
          </Text>
        )}

        {/* Streak highlight */}
        <View style={s.streakRow}>
          <View style={s.streakBadge}>
            <Text style={s.streakEmoji}>🔥</Text>
            <Text style={s.streakNumber}>{stats.streakStats.currentStreak}</Text>
            <Text style={s.streakLabel}>day streak</Text>
          </View>
          <View style={s.streakBadge}>
            <Text style={s.streakEmoji}>🏆</Text>
            <Text style={s.streakNumber}>{stats.streakStats.bestStreak}</Text>
            <Text style={s.streakLabel}>best streak</Text>
          </View>
        </View>
      </View>

      {/* ── Stat Tiles ────────────────────────────────────────── */}
      <View style={s.statGrid}>
        <StatTile
          icon="fitness"
          color={colors.teal}
          label="Workouts"
          value={String(stats.totalWorkouts)}
        />
        <StatTile
          icon="time"
          color={colors.info}
          label="Active Time"
          value={formatMinutes(stats.totalWorkoutMinutes)}
        />
        <StatTile
          icon="layers"
          color={colors.symmetry}
          label="Sets Done"
          value={String(stats.totalSetsCompleted)}
        />
        <StatTile
          icon="checkmark-done"
          color={colors.success}
          label="Check-ins"
          value={String(stats.totalCheckIns)}
        />
      </View>

      {/* ── Current Metrics Snapshot ──────────────────────────── */}
      {(stats.latestPainLevel != null ||
        stats.latestPostureScore != null ||
        stats.latestSymmetryScore != null) && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Current Status</Text>
          <View style={s.metricsRow}>
            {stats.latestPainLevel != null && (
              <MetricPill
                label="Pain"
                value={stats.latestPainLevel}
                max={10}
                color={colors.pain}
                inverted
              />
            )}
            {stats.latestPostureScore != null && (
              <MetricPill
                label="Posture"
                value={stats.latestPostureScore}
                max={100}
                color={colors.posture}
              />
            )}
            {stats.latestSymmetryScore != null && (
              <MetricPill
                label="Symmetry"
                value={stats.latestSymmetryScore}
                max={100}
                color={colors.symmetry}
              />
            )}
          </View>
        </View>
      )}

      {/* ── Goals Progress ────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Goals</Text>
          <Pressable onPress={() => router.push('/goals')} style={s.seeAllBtn}>
            <Text style={s.seeAllText}>View All</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.tealLight} />
          </Pressable>
        </View>
        <View style={s.goalRow}>
          <GoalStat label="Active" value={stats.activeGoals} color={colors.teal} />
          <View style={s.goalDivider} />
          <GoalStat label="Completed" value={stats.completedGoals} color={colors.success} />
          <View style={s.goalDivider} />
          <GoalStat label="Total" value={stats.totalGoals} color={colors.textSecondary} />
        </View>
      </View>

      {/* ── Badges ────────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>
            Badges ({stats.totalBadgesEarned}/{stats.totalBadgesAvailable})
          </Text>
          {allBadgeTypes.length > 4 && (
            <Pressable onPress={() => setShowAllBadges((v) => !v)} style={s.seeAllBtn}>
              <Text style={s.seeAllText}>{showAllBadges ? 'Show Less' : 'Show All'}</Text>
            </Pressable>
          )}
        </View>
        <View style={s.badgeGrid}>
          {(showAllBadges ? allBadgeTypes : allBadgeTypes.slice(0, 4)).map((type) => {
            const def = BADGE_DEFINITIONS[type];
            const earned = earnedTypes.has(type);
            const badge = stats.badges.find((b) => b.type === type);
            return (
              <View key={type} style={[s.badgeCard, !earned && s.badgeCardLocked]}>
                <Text style={[s.badgeIcon, !earned && s.badgeIconLocked]}>
                  {def.icon}
                </Text>
                <Text
                  style={[s.badgeTitle, !earned && s.badgeTitleLocked]}
                  numberOfLines={1}
                >
                  {def.title}
                </Text>
                <Text
                  style={[s.badgeDesc, !earned && s.badgeDescLocked]}
                  numberOfLines={2}
                >
                  {earned
                    ? `Earned ${format(new Date(badge!.earned_at), 'MMM d')}`
                    : def.description}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ── Journey Milestones ────────────────────────────────── */}
      {stats.milestones.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Journey Milestones</Text>
          <View style={s.timeline}>
            {stats.milestones.slice(0, 6).map((m, i) => (
              <View key={i} style={s.timelineItem}>
                <View style={s.timelineDotCol}>
                  <View style={s.timelineDot}>
                    <Text style={s.timelineDotIcon}>{m.icon}</Text>
                  </View>
                  {i < Math.min(stats.milestones.length, 6) - 1 && (
                    <View style={s.timelineLine} />
                  )}
                </View>
                <View style={s.timelineContent}>
                  <Text style={s.timelineTitle}>{m.title}</Text>
                  <Text style={s.timelineSubtitle}>{m.subtitle}</Text>
                  <Text style={s.timelineDate}>
                    {format(new Date(m.date), 'MMM d, yyyy')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Quick Links ───────────────────────────────────────── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Explore</Text>
        {QUICK_LINKS.map((link) => (
          <Pressable
            key={link.route}
            onPress={() => router.push(link.route as any)}
            style={s.linkCard}
          >
            <View style={[s.linkIcon, { backgroundColor: `${link.iconColor}20` }]}>
              <Ionicons name={link.icon} size={20} color={link.iconColor} />
            </View>
            <View style={s.linkText}>
              <Text style={s.linkTitle}>{link.title}</Text>
              <Text style={s.linkSubtitle}>{link.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>

      {/* ── Photo count CTA ───────────────────────────────────── */}
      {stats.totalPhotos > 0 && (
        <View style={s.section}>
          <Pressable
            onPress={() => router.push('/photos')}
            style={s.photoCta}
          >
            <View style={s.photoCtaInner}>
              <Ionicons name="images" size={24} color={colors.tealLight} />
              <View style={{ marginLeft: spacing.md, flex: 1 }}>
                <Text style={s.photoCtaTitle}>
                  {stats.totalPhotos} Progress Photo{stats.totalPhotos !== 1 ? 's' : ''}
                </Text>
                <Text style={s.photoCtaSubtitle}>View your visual progress</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.tealLight} />
            </View>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

// ── Sub-Components ───────────────────────────────────────────────────────────

function StatTile({
  icon,
  color,
  label,
  value,
}: {
  icon: IoniconsName;
  color: string;
  label: string;
  value: string;
}) {
  return (
    <View style={s.statTile}>
      <View style={[s.statTileIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={s.statTileValue}>{value}</Text>
      <Text style={s.statTileLabel}>{label}</Text>
    </View>
  );
}

function MetricPill({
  label,
  value,
  max,
  color,
  inverted = false,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  inverted?: boolean;
}) {
  const pct = inverted
    ? ((max - value) / max) * 100
    : (value / max) * 100;

  return (
    <View style={s.metricPill}>
      <Text style={[s.metricPillLabel, { color }]}>{label}</Text>
      <Text style={s.metricPillValue}>
        {value}
        <Text style={s.metricPillMax}>/{max}</Text>
      </Text>
      <View style={s.metricBar}>
        <View
          style={[
            s.metricBarFill,
            { width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

function GoalStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={s.goalStat}>
      <Text style={[s.goalStatValue, { color }]}>{value}</Text>
      <Text style={s.goalStatLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Hero
  heroCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.tealDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroIcon: {
    fontSize: 32,
  },
  heroTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    ...typography.body,
    color: colors.textTertiary,
    marginBottom: spacing.lg,
  },
  streakRow: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  streakBadge: {
    alignItems: 'center',
  },
  streakEmoji: {
    fontSize: 20,
    marginBottom: spacing.xs,
  },
  streakNumber: {
    ...typography.h1,
    color: colors.textPrimary,
    lineHeight: 36,
  },
  streakLabel: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Stat Grid
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  statTile: {
    flex: 1,
    minWidth: (screenWidth - spacing.lg * 2 - spacing.sm * 3) / 4,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statTileIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statTileValue: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  statTileLabel: {
    ...typography.tiny,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  // Sections
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.md,
  },
  seeAllText: {
    ...typography.small,
    color: colors.tealLight,
  },

  // Current Metrics
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricPill: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricPillLabel: {
    ...typography.tiny,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  metricPillValue: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  metricPillMax: {
    ...typography.small,
    color: colors.textMuted,
  },
  metricBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgBase,
    overflow: 'hidden',
  },
  metricBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Goals
  goalRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  goalDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  goalStat: {
    flex: 1,
    alignItems: 'center',
  },
  goalStatValue: {
    ...typography.h2,
    lineHeight: 32,
  },
  goalStatLabel: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Badges
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badgeCard: {
    width: (screenWidth - spacing.lg * 2 - spacing.sm) / 2,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  badgeCardLocked: {
    borderColor: colors.border,
    opacity: 0.5,
  },
  badgeIcon: {
    fontSize: 28,
    marginBottom: spacing.sm,
  },
  badgeIconLocked: {
    opacity: 0.4,
  },
  badgeTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: 2,
  },
  badgeTitleLocked: {
    color: colors.textMuted,
  },
  badgeDesc: {
    ...typography.small,
    color: colors.textTertiary,
  },
  badgeDescLocked: {
    color: colors.textMuted,
  },

  // Timeline
  timeline: {
    paddingLeft: spacing.xs,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  timelineDotCol: {
    alignItems: 'center',
    width: 40,
  },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.tealDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotIcon: {
    fontSize: 16,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    minHeight: 20,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: spacing.md,
    paddingBottom: spacing.lg,
  },
  timelineTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  timelineSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timelineDate: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 4,
  },

  // Quick Links
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  linkTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  linkSubtitle: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Photo CTA
  photoCta: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  photoCtaInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoCtaTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  photoCtaSubtitle: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: 2,
  },
});
