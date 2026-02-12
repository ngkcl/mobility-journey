import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO, differenceInDays } from 'date-fns';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';
import {
  type Goal,
  type GoalProgress,
  type GoalProgressSummary,
  type GoalType,
  getGoals,
  getGoalProgress,
  updateGoal,
  deleteGoal,
  computeGoalProgress,
} from '../../lib/goals';
import { type Badge, getBadges, checkAndAwardBadges, BADGE_DEFINITIONS } from '../../lib/badges';
import { shouldCelebrate, type CelebrationEvent } from '../../lib/celebrations';
import GoalCelebration from '../../components/GoalCelebration';

// ── Goal type metadata (same as dashboard) ──────────────────────────────────

const GOAL_TYPE_META: Record<GoalType, { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; bgColor: string }> = {
  pain_reduction: { icon: 'heart-outline', label: 'Pain Reduction', color: colors.pain, bgColor: colors.errorDim },
  symmetry_improvement: { icon: 'git-compare-outline', label: 'Symmetry', color: colors.symmetry, bgColor: 'rgba(139, 92, 246, 0.15)' },
  posture_score: { icon: 'body-outline', label: 'Posture Score', color: colors.posture, bgColor: colors.tealDim },
  workout_consistency: { icon: 'calendar-outline', label: 'Consistency', color: colors.info, bgColor: colors.infoDim },
  workout_streak: { icon: 'flame-outline', label: 'Streak', color: colors.warning, bgColor: colors.warningDim },
  custom: { icon: 'star-outline', label: 'Custom', color: colors.tealLight, bgColor: colors.tealDim },
};

const STATUS_LABELS: Record<string, { label: string; color: string; bgColor: string }> = {
  active: { label: 'Active', color: colors.teal, bgColor: colors.tealDim },
  completed: { label: 'Completed', color: colors.success, bgColor: colors.successDim },
  failed: { label: 'Failed', color: colors.error, bgColor: colors.errorDim },
  paused: { label: 'Paused', color: colors.warning, bgColor: colors.warningDim },
};

// ── Progress Ring Component ─────────────────────────────────────────────────

function ProgressRing({ percent, color, size = 120 }: { percent: number; color: string; size?: number }) {
  // Simple circular indicator using View borders
  const clampedPct = Math.min(100, Math.max(0, percent));
  return (
    <View style={[styles.ringOuter, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.ringProgress, { width: size - 8, height: size - 8, borderRadius: (size - 8) / 2, borderColor: color }]}>
        <View style={[styles.ringInner, { width: size - 20, height: size - 20, borderRadius: (size - 20) / 2 }]}>
          <Text style={[styles.ringPercent, { color }]}>{Math.round(clampedPct)}%</Text>
          <Text style={styles.ringLabel}>complete</Text>
        </View>
      </View>
    </View>
  );
}

// ── Milestone Item ──────────────────────────────────────────────────────────

function MilestoneItem({ label, reached, date }: { label: string; reached: boolean; date?: string }) {
  return (
    <View style={styles.milestoneRow}>
      <Ionicons
        name={reached ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
        color={reached ? colors.success : colors.textTertiary}
      />
      <Text style={[styles.milestoneLabel, reached && { color: colors.textPrimary }]}>
        {label}
      </Text>
      {date && <Text style={styles.milestoneDate}>{date}</Text>}
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [history, setHistory] = useState<GoalProgress[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [celebrationEvent, setCelebrationEvent] = useState<CelebrationEvent | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  const loadGoal = useCallback(async () => {
    if (!id) return;
    // Fetch all goals and find ours (no single-goal endpoint)
    const allGoals = await getGoals();
    const found = allGoals.find((g) => g.id === id) ?? null;
    setGoal(found);

    if (found) {
      const progress = await getGoalProgress(found.id);
      setHistory(progress);
    }

    // Load badges
    const earnedBadges = await getBadges();
    setBadges(earnedBadges);
  }, [id]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await loadGoal();
      setIsLoading(false);
    })();
  }, [loadGoal]);

  const handlePause = async () => {
    if (!goal) return;
    const newStatus = goal.status === 'paused' ? 'active' : 'paused';
    const updated = await updateGoal(goal.id, { status: newStatus });
    if (updated) setGoal(updated);
  };

  const handleDelete = () => {
    if (!goal) return;
    Alert.alert('Delete Goal', `Are you sure you want to delete "${goal.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteGoal(goal.id);
          router.back();
        },
      },
    ]);
  };

  const handleMarkComplete = async () => {
    if (!goal) return;
    const updated = await updateGoal(goal.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
    if (updated) {
      setGoal(updated);

      // Trigger celebration
      const event = shouldCelebrate(updated);
      if (event) {
        setCelebrationEvent(event);
        setShowCelebration(true);
      }

      // Check and award badges
      const allCompleted = await getGoals('completed');
      const newBadges = await checkAndAwardBadges(allCompleted);
      if (newBadges.length > 0) {
        setBadges((prev) => [...newBadges, ...prev]);
      }
    }
  };

  if (isLoading) {
    return (
      <View style={[shared.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (!goal) {
    return (
      <View style={[shared.screen, styles.center]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textTertiary} />
        <Text style={styles.notFoundText}>Goal not found</Text>
      </View>
    );
  }

  const meta = GOAL_TYPE_META[goal.type] || GOAL_TYPE_META.custom;
  const statusInfo = STATUS_LABELS[goal.status] || STATUS_LABELS.active;
  const summary = computeGoalProgress(goal);
  const deadline = parseISO(goal.deadline);
  const daysRemaining = differenceInDays(deadline, new Date());
  const isOverdue = daysRemaining < 0;

  // Milestones
  const milestones = [25, 50, 75, 100].map((pct) => ({
    label: `${pct}% — ${pct === 100 ? 'Goal reached!' : `${pct}% complete`}`,
    reached: summary.percentComplete >= pct,
  }));

  // Projection text
  let projectionText = '';
  if (summary.projectedCompletion && goal.status === 'active') {
    const projDate = parseISO(summary.projectedCompletion);
    const projDays = differenceInDays(projDate, new Date());
    if (projDays <= 0) {
      projectionText = 'At your current rate, you could reach your goal any day now!';
    } else {
      projectionText = `At current rate, you'll reach your goal by ${format(projDate, 'MMM d, yyyy')} (~${projDays} days)`;
    }
  }

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header: type badge + status badge */}
        <View style={styles.headerRow}>
          <View style={[styles.typeBadge, { backgroundColor: meta.bgColor }]}>
            <Ionicons name={meta.icon} size={14} color={meta.color} />
            <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.bgColor }]}>
            <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{goal.title}</Text>
        {goal.description && <Text style={styles.description}>{goal.description}</Text>}

        {/* Progress Ring */}
        <View style={styles.ringContainer}>
          <ProgressRing percent={summary.percentComplete} color={meta.color} />
        </View>

        {/* Stats row */}
        <View style={styles.statsCard}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Starting</Text>
            <Text style={styles.statValue}>{goal.starting_value}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Current</Text>
            <Text style={[styles.statValue, { color: meta.color }]}>{goal.current_value}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Target</Text>
            <Text style={styles.statValue}>{goal.target_value}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Days Left</Text>
            <Text style={[styles.statValue, isOverdue && { color: colors.error }]}>
              {isOverdue ? `${Math.abs(daysRemaining)}` : daysRemaining}
            </Text>
            {isOverdue && <Text style={styles.overdueTag}>overdue</Text>}
          </View>
        </View>

        {/* Projection */}
        {projectionText && (
          <View style={styles.projectionCard}>
            <Ionicons name="trending-up" size={18} color={colors.teal} />
            <Text style={styles.projectionText}>{projectionText}</Text>
          </View>
        )}

        {/* Milestones */}
        <View style={styles.section}>
          <Text style={shared.sectionTitle}>Milestones</Text>
          <View style={styles.milestoneList}>
            {milestones.map((m) => (
              <MilestoneItem key={m.label} label={m.label} reached={m.reached} />
            ))}
          </View>
        </View>

        {/* Badges */}
        {badges.length > 0 && (
          <View style={styles.section}>
            <Text style={shared.sectionTitle}>Earned Badges</Text>
            <View style={styles.badgeGrid}>
              {badges.map((badge) => (
                <View key={badge.id} style={styles.badgeItem}>
                  <Text style={styles.badgeIcon}>{badge.icon}</Text>
                  <Text style={styles.badgeTitle} numberOfLines={1}>{badge.title}</Text>
                  <Text style={styles.badgeDesc} numberOfLines={2}>{badge.description}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recent Progress History */}
        {history.length > 0 && (
          <View style={styles.section}>
            <Text style={shared.sectionTitle}>Progress History</Text>
            <View style={styles.historyList}>
              {history.slice(-10).reverse().map((entry, i) => (
                <View key={`${entry.goal_id}-${entry.recorded_at}-${i}`} style={styles.historyRow}>
                  <Text style={styles.historyDate}>
                    {format(parseISO(entry.recorded_at), 'MMM d, h:mm a')}
                  </Text>
                  <Text style={[styles.historyValue, { color: meta.color }]}>
                    {entry.value}
                  </Text>
                  {entry.notes && (
                    <Text style={styles.historyNotes} numberOfLines={1}>{entry.notes}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Actions */}
        {(goal.status === 'active' || goal.status === 'paused') && (
          <View style={styles.actionsSection}>
            <Text style={shared.sectionTitle}>Actions</Text>
            <View style={styles.actionButtons}>
              {goal.status === 'active' && summary.percentComplete >= 90 && (
                <Pressable style={[shared.btnPrimary, { flex: 1 }]} onPress={handleMarkComplete}>
                  <Ionicons name="trophy" size={18} color="#fff" />
                  <Text style={shared.btnPrimaryText}>Mark Complete</Text>
                </Pressable>
              )}
              <Pressable style={[shared.btnSecondary, { flex: 1 }]} onPress={handlePause}>
                <Ionicons name={goal.status === 'paused' ? 'play' : 'pause'} size={18} color={colors.textSecondary} />
                <Text style={shared.btnSecondaryText}>
                  {goal.status === 'paused' ? 'Resume' : 'Pause'}
                </Text>
              </Pressable>
              <Pressable
                style={[shared.btnSecondary, { flex: 1, borderColor: colors.error, borderWidth: 1 }]}
                onPress={handleDelete}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
                <Text style={[shared.btnSecondaryText, { color: colors.error }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Celebration modal */}
      <GoalCelebration
        visible={showCelebration}
        event={celebrationEvent}
        onDismiss={() => setShowCelebration(false)}
      />
    </View>
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
  notFoundText: {
    ...typography.h3,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
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
  statusBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  statusBadgeText: {
    ...typography.small,
    fontWeight: '600',
  },

  // Title
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },

  // Progress ring
  ringContainer: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  ringOuter: {
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringProgress: {
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    backgroundColor: colors.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPercent: {
    ...typography.hero,
  },
  ringLabel: {
    ...typography.tiny,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Stats card
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  statBox: {
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
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  overdueTag: {
    ...typography.tiny,
    color: colors.error,
    marginTop: 2,
  },

  // Projection
  projectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tealDim,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.tealBorder,
    marginBottom: spacing.xl,
  },
  projectionText: {
    ...typography.caption,
    color: colors.tealLight,
    flex: 1,
  },

  // Section
  section: {
    marginBottom: spacing.xl,
  },

  // Milestones
  milestoneList: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  milestoneLabel: {
    ...typography.body,
    color: colors.textTertiary,
    flex: 1,
  },
  milestoneDate: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // History
  historyList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgBase,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  historyDate: {
    ...typography.caption,
    color: colors.textTertiary,
    flex: 1,
  },
  historyValue: {
    ...typography.bodySemibold,
  },
  historyNotes: {
    ...typography.caption,
    color: colors.textTertiary,
    maxWidth: 120,
  },

  // Badges
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  badgeItem: {
    backgroundColor: colors.bgBase,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    width: 100,
  },
  badgeIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  badgeTitle: {
    ...typography.small,
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: '600',
  },
  badgeDesc: {
    ...typography.tiny,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 2,
  },

  // Actions
  actionsSection: {
    marginTop: spacing.md,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
