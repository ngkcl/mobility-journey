/**
 * TP-005: Weekly Review Modal
 *
 * Shows stats comparison, pain/volume trends, and adjustment suggestions
 * for the just-completed week. User can accept or override suggestions.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  reviewWeek,
  suggestAdjustments,
  compareWeeks,
  submitReviewDecision,
} from '../../lib/weeklyReview';
import type {
  WeekReview,
  WeekComparison,
  WeekAdjustment,
  AdjustmentType,
} from '../../lib/weeklyReview';
import { colors, typography, spacing, radii } from '@/lib/theme';

// ── Helper Components ──────────────────────────────────────────────

function StatCard({
  label,
  value,
  change,
  changeLabel,
  icon,
  color,
}: {
  label: string;
  value: string;
  change?: number | null;
  changeLabel?: string;
  icon: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconBg, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.statCardValue}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
      {change != null && (
        <View style={styles.changeRow}>
          <Ionicons
            name={change > 0 ? 'arrow-up' : change < 0 ? 'arrow-down' : 'remove'}
            size={12}
            color={change > 0 ? colors.success : change < 0 ? colors.error : colors.textTertiary}
          />
          <Text
            style={[
              styles.changeText,
              {
                color:
                  change > 0 ? colors.success : change < 0 ? colors.error : colors.textTertiary,
              },
            ]}
          >
            {changeLabel ?? `${Math.abs(change)}${change > 0 ? ' more' : ' less'}`}
          </Text>
        </View>
      )}
    </View>
  );
}

function PainTrendBadge({ trend }: { trend: string }) {
  const config: Record<string, { icon: string; color: string; label: string }> = {
    improved: { icon: 'trending-down', color: colors.success, label: 'Pain Improved' },
    worsened: { icon: 'trending-up', color: colors.error, label: 'Pain Increased' },
    stable: { icon: 'remove', color: colors.warning, label: 'Pain Stable' },
    unknown: { icon: 'help-circle-outline', color: colors.textMuted, label: 'No Pain Data' },
  };
  const c = config[trend] ?? config.unknown;

  return (
    <View style={[styles.trendBadge, { backgroundColor: `${c.color}15`, borderColor: `${c.color}30` }]}>
      <Ionicons name={c.icon as any} size={16} color={c.color} />
      <Text style={[styles.trendBadgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

function AdjustmentCard({
  adjustment,
  selected,
  onSelect,
}: {
  adjustment: WeekAdjustment;
  selected: boolean;
  onSelect: () => void;
}) {
  const typeIcons: Record<AdjustmentType, string> = {
    repeat_week: 'refresh-outline',
    reduce_intensity: 'trending-down-outline',
    increase_intensity: 'trending-up-outline',
    continue: 'arrow-forward-outline',
    advance: 'rocket-outline',
  };

  const typeColors: Record<AdjustmentType, string> = {
    repeat_week: colors.warning,
    reduce_intensity: colors.error,
    increase_intensity: colors.success,
    continue: colors.teal,
    advance: colors.success,
  };

  const icon = typeIcons[adjustment.type] ?? 'help-circle-outline';
  const color = typeColors[adjustment.type] ?? colors.teal;

  return (
    <Pressable
      style={[
        styles.adjustmentCard,
        selected && { borderColor: color, borderWidth: 1.5 },
      ]}
      onPress={onSelect}
    >
      <View style={styles.adjustmentHeader}>
        <View style={[styles.adjustmentIconBg, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon as any} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.adjustmentReason}>{adjustment.reason}</Text>
          {adjustment.intensity_modifier !== 0 && (
            <Text style={[styles.adjustmentModifier, { color }]}>
              {adjustment.intensity_modifier > 0 ? '+' : ''}
              {adjustment.intensity_modifier}% intensity
            </Text>
          )}
        </View>
        {selected && <Ionicons name="checkmark-circle" size={24} color={color} />}
      </View>
      <Text style={styles.adjustmentDetails}>{adjustment.details}</Text>
    </Pressable>
  );
}

// ── Main Screen ────────────────────────────────────────────────────

export default function WeeklyReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    programId: string;
    weekNumber: string;
  }>();

  const programId = params.programId ?? '';
  const weekNumber = parseInt(params.weekNumber ?? '0', 10);

  const [currentReview, setCurrentReview] = useState<WeekReview | null>(null);
  const [previousReview, setPreviousReview] = useState<WeekReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<number>(0);

  const fetchReview = useCallback(async () => {
    try {
      setLoading(true);
      const [current, prev] = await Promise.all([
        reviewWeek(programId, weekNumber),
        weekNumber > 1 ? reviewWeek(programId, weekNumber - 1) : Promise.resolve(null),
      ]);
      setCurrentReview(current);
      setPreviousReview(prev);
    } catch (err) {
      console.error('Failed to load review:', err);
    } finally {
      setLoading(false);
    }
  }, [programId, weekNumber]);

  useEffect(() => {
    if (programId && weekNumber > 0) fetchReview();
  }, [fetchReview, programId, weekNumber]);

  const comparison = useMemo<WeekComparison | null>(
    () => (currentReview ? compareWeeks(currentReview, previousReview) : null),
    [currentReview, previousReview]
  );

  const adjustments = useMemo<WeekAdjustment[]>(
    () => (currentReview ? suggestAdjustments(currentReview, previousReview) : []),
    [currentReview, previousReview]
  );

  const handleSubmit = useCallback(async () => {
    if (!currentReview || !adjustments.length) return;
    const selected = adjustments[selectedAdjustment];

    setSubmitting(true);
    try {
      await submitReviewDecision({
        programId,
        weekNumber,
        adjustment: selected.type,
        intensity_modifier: selected.intensity_modifier,
        notes: null,
        decided_at: new Date().toISOString(),
      });
      router.back();
    } catch (err) {
      Alert.alert('Error', 'Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [currentReview, adjustments, selectedAdjustment, programId, weekNumber, router]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.teal} />
        <Text style={styles.loadingText}>Analyzing your week...</Text>
      </View>
    );
  }

  if (!currentReview) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.loadingText}>Unable to load review data</Text>
        <Pressable style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Week Header */}
        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>Week {weekNumber} Review</Text>
          <Text style={styles.headerSubtitle}>
            {currentReview.phase_focus.charAt(0).toUpperCase() + currentReview.phase_focus.slice(1)} Phase
            {currentReview.is_deload ? ' (Deload)' : ''}
          </Text>
        </View>

        {/* Pain Trend */}
        <View style={styles.trendSection}>
          <PainTrendBadge trend={currentReview.pain_trend} />
          {currentReview.pain_before_avg != null && currentReview.pain_after_avg != null && (
            <Text style={styles.painDetail}>
              Avg pain: {currentReview.pain_before_avg} → {currentReview.pain_after_avg}
            </Text>
          )}
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Adherence"
            value={`${currentReview.adherence_pct}%`}
            change={comparison?.adherence_change}
            changeLabel={
              comparison?.adherence_change != null
                ? `${comparison.adherence_change > 0 ? '+' : ''}${comparison.adherence_change}%`
                : undefined
            }
            icon="checkmark-circle-outline"
            color={
              currentReview.adherence_pct >= 80
                ? colors.success
                : currentReview.adherence_pct >= 60
                ? colors.warning
                : colors.error
            }
          />
          <StatCard
            label="Sessions"
            value={`${currentReview.sessions_completed}/${currentReview.sessions_total}`}
            change={currentReview.sessions_missed > 0 ? -currentReview.sessions_missed : null}
            changeLabel={
              currentReview.sessions_missed > 0
                ? `${currentReview.sessions_missed} missed`
                : undefined
            }
            icon="fitness-outline"
            color={colors.teal}
          />
          <StatCard
            label="Volume"
            value={currentReview.total_volume > 0 ? `${Math.round(currentReview.total_volume / 1000)}k` : '0'}
            change={comparison?.volume_change_pct}
            changeLabel={
              comparison?.volume_change_pct != null
                ? `${comparison.volume_change_pct > 0 ? '+' : ''}${comparison.volume_change_pct}%`
                : undefined
            }
            icon="barbell-outline"
            color={colors.info}
          />
          <StatCard
            label="Intensity"
            value={`${currentReview.intensity_pct}%`}
            icon="flash-outline"
            color={colors.warning}
          />
        </View>

        {/* Energy */}
        {currentReview.energy_avg != null && (
          <View style={styles.energyRow}>
            <Ionicons name="battery-half-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.energyText}>
              Average energy level: {currentReview.energy_avg}/10
            </Text>
          </View>
        )}

        {/* Adjustments */}
        <View style={styles.adjustmentsSection}>
          <Text style={styles.sectionTitle}>Suggested Adjustments</Text>
          <Text style={styles.sectionSubtitle}>
            Select how you'd like to proceed to the next week
          </Text>
          {adjustments.map((adj, idx) => (
            <AdjustmentCard
              key={idx}
              adjustment={adj}
              selected={selectedAdjustment === idx}
              onSelect={() => setSelectedAdjustment(idx)}
            />
          ))}
        </View>
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomBar}>
        <Pressable style={styles.skipButton} onPress={() => router.back()}>
          <Text style={styles.skipButtonText}>Skip Review</Text>
        </Pressable>
        <Pressable
          style={[styles.submitButton, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.bgDeep} />
          ) : (
            <>
              <Ionicons name="checkmark" size={18} color={colors.bgDeep} />
              <Text style={styles.submitButtonText}>Apply & Continue</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDeep,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
    paddingTop: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bgDeep,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.tealDim,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  retryButtonText: {
    ...typography.captionMedium,
    color: colors.teal,
  },

  // Header
  headerSection: {
    marginBottom: spacing.md,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 24,
  },
  headerSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 4,
  },

  // Pain Trend
  trendSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  trendBadgeText: {
    ...typography.captionMedium,
    fontWeight: '600',
  },
  painDetail: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    minWidth: '45%' as unknown as number,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 4,
  },
  statIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  statCardValue: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 22,
  },
  statCardLabel: {
    ...typography.tiny,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  changeText: {
    ...typography.tiny,
    fontWeight: '600',
  },

  // Energy
  energyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  energyText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  // Adjustments
  adjustmentsSection: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  adjustmentCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  adjustmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  adjustmentIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adjustmentReason: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  adjustmentModifier: {
    ...typography.tiny,
    fontWeight: '700',
    marginTop: 2,
  },
  adjustmentDetails: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.xs,
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: 34,
    backgroundColor: colors.bgBase,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  skipButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skipButtonText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.teal,
  },
  submitButtonText: {
    ...typography.captionMedium,
    color: colors.bgDeep,
    fontWeight: '700',
    fontSize: 15,
  },
});
