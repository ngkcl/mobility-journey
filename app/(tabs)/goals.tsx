import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { format, parseISO, differenceInDays } from 'date-fns';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';
import { tapLight, tapMedium } from '@/lib/haptics';
import {
  getGoals,
  computeGoalProgress,
  type Goal,
  type GoalType,
  type GoalStatus,
  type GoalProgressSummary,
} from '../../lib/goals';
import { type Badge, getBadges } from '../../lib/badges';
import EmptyState from '../../components/EmptyState';
import ErrorBoundary from '../../components/ErrorBoundary';
import { GoalCardSkeleton, StatsRowSkeleton } from '../../components/SkeletonLoader';
import SuggestedGoals from '../../components/SuggestedGoals';

// ── Goal type metadata ──────────────────────────────────────────────────────

type GoalTypeMeta = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  bgColor: string;
};

const GOAL_TYPE_META: Record<GoalType, GoalTypeMeta> = {
  pain_reduction: {
    icon: 'heart-outline',
    label: 'Pain',
    color: colors.pain,
    bgColor: colors.errorDim,
  },
  symmetry_improvement: {
    icon: 'git-compare-outline',
    label: 'Symmetry',
    color: colors.symmetry,
    bgColor: 'rgba(139, 92, 246, 0.15)',
  },
  posture_score: {
    icon: 'body-outline',
    label: 'Posture',
    color: colors.posture,
    bgColor: colors.tealDim,
  },
  workout_consistency: {
    icon: 'calendar-outline',
    label: 'Consistency',
    color: colors.info,
    bgColor: colors.infoDim,
  },
  workout_streak: {
    icon: 'flame-outline',
    label: 'Streak',
    color: colors.warning,
    bgColor: colors.warningDim,
  },
  custom: {
    icon: 'star-outline',
    label: 'Custom',
    color: colors.tealLight,
    bgColor: colors.tealDim,
  },
};

// ── Progress bar color logic ────────────────────────────────────────────────

const getProgressColor = (summary: GoalProgressSummary): string => {
  if (summary.percentComplete >= 100) return colors.success;
  if (summary.onTrack) return colors.success;
  // Slightly behind
  if (summary.percentComplete >= 40) return colors.warning;
  // Significantly behind
  return colors.error;
};

const getProgressBgColor = (summary: GoalProgressSummary): string => {
  if (summary.percentComplete >= 100) return colors.successDim;
  if (summary.onTrack) return colors.successDim;
  if (summary.percentComplete >= 40) return colors.warningDim;
  return colors.errorDim;
};

const getTrendEmoji = (trend: string): string => {
  switch (trend) {
    case 'improving':
      return '📈';
    case 'worsening':
      return '📉';
    default:
      return '➡️';
  }
};

// ── Goal Card Component ─────────────────────────────────────────────────────

function GoalCard({
  goal,
  onPress,
}: {
  goal: Goal;
  onPress: () => void;
}) {
  const meta = GOAL_TYPE_META[goal.type] || GOAL_TYPE_META.custom;
  const summary = computeGoalProgress(goal);
  const progressColor = getProgressColor(summary);
  const progressBg = getProgressBgColor(summary);

  const deadline = parseISO(goal.deadline);
  const daysRemaining = differenceInDays(deadline, new Date());
  const isOverdue = daysRemaining < 0;

  const daysLabel = isOverdue
    ? `${Math.abs(daysRemaining)}d overdue`
    : daysRemaining === 0
      ? 'Due today'
      : `${daysRemaining}d left`;

  return (
    <Pressable onPress={onPress} style={styles.goalCard}>
      {/* Header row: type badge + days remaining */}
      <View style={styles.cardHeader}>
        <View style={[styles.typeBadge, { backgroundColor: meta.bgColor }]}>
          <Ionicons name={meta.icon} size={14} color={meta.color} />
          <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text
          style={[
            styles.daysLabel,
            isOverdue && { color: colors.error },
          ]}
        >
          {daysLabel}
        </Text>
      </View>

      {/* Title */}
      <Text style={styles.goalTitle} numberOfLines={2}>
        {goal.title}
      </Text>

      {/* Progress bar */}
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBarBg, { backgroundColor: progressBg }]}>
          <View
            style={[
              styles.progressBarFill,
              {
                backgroundColor: progressColor,
                width: `${Math.min(100, summary.percentComplete)}%`,
              },
            ]}
          />
        </View>
        <Text style={[styles.progressPercent, { color: progressColor }]}>
          {Math.round(summary.percentComplete)}%
        </Text>
      </View>

      {/* Stats row: current vs target + trend */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Current</Text>
          <Text style={styles.statValue}>{goal.current_value}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Target</Text>
          <Text style={styles.statValue}>{goal.target_value}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Trend</Text>
          <Text style={styles.statValue}>{getTrendEmoji(summary.trend)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── Completed Goal Card (compact) ───────────────────────────────────────────

function CompletedGoalCard({ goal }: { goal: Goal }) {
  const meta = GOAL_TYPE_META[goal.type] || GOAL_TYPE_META.custom;
  const completedDate = goal.completed_at ? format(parseISO(goal.completed_at), 'MMM d') : '—';
  const statusEmoji = goal.status === 'completed' ? '✅' : '❌';

  return (
    <View style={styles.completedCard}>
      <View style={[styles.typeDot, { backgroundColor: meta.color }]} />
      <Text style={styles.completedTitle} numberOfLines={1}>
        {statusEmoji} {goal.title}
      </Text>
      <Text style={styles.completedDate}>{completedDate}</Text>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const router = useRouter();
  const [activeGoals, setActiveGoals] = useState<Goal[]>([]);
  const [completedGoals, setCompletedGoals] = useState<Goal[]>([]);
  const [failedGoals, setFailedGoals] = useState<Goal[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const loadGoals = useCallback(async () => {
    const [active, completed, failed, earnedBadges] = await Promise.all([
      getGoals('active'),
      getGoals('completed'),
      getGoals('failed'),
      getBadges(),
    ]);
    setActiveGoals(active);
    setCompletedGoals(completed);
    setFailedGoals(failed);
    setBadges(earnedBadges);
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await loadGoals();
      setIsLoading(false);
    })();
  }, [loadGoals]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadGoals();
    setRefreshing(false);
  }, [loadGoals]);

  const navigateToNewGoal = () => {
    tapMedium();
    router.push('/goals/new');
  };

  const navigateToGoalDetail = (goalId: string) => {
    tapLight();
    router.push(`/goals/${goalId}` as any);
  };

  // ── Loading state ──
  if (isLoading) {
    return (
      <View style={[shared.screen, { padding: spacing.lg, gap: spacing.lg }]}>
        <StatsRowSkeleton />
        <GoalCardSkeleton />
        <GoalCardSkeleton />
        <GoalCardSkeleton />
      </View>
    );
  }

  const finishedGoals = [...completedGoals, ...failedGoals];
  const hasAnyGoals = activeGoals.length > 0 || finishedGoals.length > 0;

  // ── Summary stats ──
  const totalActive = activeGoals.length;
  const onTrackCount = activeGoals.filter(
    (g) => computeGoalProgress(g).onTrack,
  ).length;
  const avgProgress =
    totalActive > 0
      ? Math.round(
          activeGoals.reduce((sum, g) => sum + computeGoalProgress(g).percentComplete, 0) /
            totalActive,
        )
      : 0;

  return (
    <ErrorBoundary screenName="Goals">
    <View style={shared.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.teal}
          />
        }
      >
        {/* ── Empty state ── */}
        {!hasAnyGoals && (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="flag-outline"
              title="No goals yet"
              description="Set measurable targets to track your progress — pain reduction, posture improvement, workout consistency, and more."
              actionLabel="Create Your First Goal"
              onAction={navigateToNewGoal}
            />
          </View>
        )}

        {/* ── Summary stats bar ── */}
        {totalActive > 0 && (
          <View style={styles.summaryBar}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{totalActive}</Text>
              <Text style={styles.summaryLabel}>Active</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                {onTrackCount}
              </Text>
              <Text style={styles.summaryLabel}>On Track</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.teal }]}>
                {avgProgress}%
              </Text>
              <Text style={styles.summaryLabel}>Avg Progress</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{completedGoals.length}</Text>
              <Text style={styles.summaryLabel}>Completed</Text>
            </View>
            {badges.length > 0 && (
              <>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: colors.warning }]}>
                    {badges.length}
                  </Text>
                  <Text style={styles.summaryLabel}>Badges</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* ── AI Suggestions ── */}
        <SuggestedGoals onGoalCreated={loadGoals} />

        {/* ── Active goals ── */}
        {activeGoals.length > 0 && (
          <View style={styles.section}>
            <View style={shared.sectionHeader}>
              <Text style={shared.sectionTitle}>Active Goals</Text>
              <Text style={styles.sectionCount}>{activeGoals.length}</Text>
            </View>
            <View style={styles.goalList}>
              {activeGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onPress={() => navigateToGoalDetail(goal.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Completed / Failed goals (collapsible) ── */}
        {finishedGoals.length > 0 && (
          <View style={styles.section}>
            <Pressable
              style={shared.sectionHeader}
              onPress={() => setShowCompleted(!showCompleted)}
            >
              <View style={shared.row}>
                <Text style={[shared.sectionTitle, { color: colors.textSecondary }]}>
                  Past Goals
                </Text>
                <Text style={styles.sectionCount}>{finishedGoals.length}</Text>
              </View>
              <Ionicons
                name={showCompleted ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textTertiary}
              />
            </Pressable>
            {showCompleted && (
              <View style={styles.completedList}>
                {finishedGoals.map((goal) => (
                  <CompletedGoalCard key={goal.id} goal={goal} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Bottom spacer for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── Floating Add Button ── */}
      {hasAnyGoals && (
        <Pressable style={styles.fab} onPress={navigateToNewGoal}>
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      )}
    </View>
    </ErrorBoundary>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  emptyContainer: {
    marginTop: spacing['3xl'],
  },

  // Summary bar
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  summaryLabel: {
    ...typography.tiny,
    color: colors.textTertiary,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },

  // Sections
  section: {
    marginBottom: spacing.xl,
  },
  sectionCount: {
    ...typography.captionMedium,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
    overflow: 'hidden',
  },

  // Goal card
  goalList: {
    gap: spacing.md,
  },
  goalCard: {
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  typeBadgeText: {
    ...typography.small,
    fontWeight: '600',
  },
  daysLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  goalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  // Progress bar
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  progressBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercent: {
    ...typography.captionMedium,
    minWidth: 36,
    textAlign: 'right',
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    ...typography.tiny,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },

  // Completed cards
  completedList: {
    gap: spacing.sm,
  },
  completedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgBase,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  typeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  completedTitle: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  completedDate: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
