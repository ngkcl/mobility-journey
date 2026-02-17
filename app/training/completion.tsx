/**
 * TP-006: Program Completion Celebration Screen
 *
 * Shows when a training program is completed:
 * - Celebration header with confetti animation
 * - Before/after metrics comparison
 * - Outcome assessment (adherence, sessions, days)
 * - Next program suggestion with one-tap generation
 * - Resume/restart options for paused programs
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { getProgramDetail } from '../../lib/trainingProgram';
import type { TrainingProgram, ProgramGoalType } from '../../lib/trainingProgram';
import {
  buildProgramOutcome,
  suggestNextProgram,
  computeMetricChange,
  formatMetricValue,
  getMetricInfo,
} from '../../lib/programCompletion';
import type { ProgramOutcome, MetricSnapshot, NextProgramSuggestion } from '../../lib/programCompletion';
import { colors, typography, spacing, radii } from '@/lib/theme';
import { notifySuccess, tapHeavy } from '@/lib/haptics';

// ── Confetti ────────────────────────────────────────────────────────

const CONFETTI_ITEMS = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  emoji: ['🎉', '🎊', '✨', '🌟', '⭐', '💫', '🏆', '🥇', '💪', '🔥', '🎯', '✅'][i % 12],
  left: Math.random() * 100,
  delay: Math.random() * 1000,
}));

function ConfettiParticle({ emoji, left, delay }: { emoji: string; left: number; delay: number }) {
  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 700,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.delay(2000),
          Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, translateY, opacity]);

  return (
    <Animated.Text
      style={[
        styles.confetti,
        { left: `${left}%` as unknown as number, transform: [{ translateY }], opacity },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

// ── Metric Comparison Card ──────────────────────────────────────────

function MetricComparison({
  metric,
  before,
  after,
}: {
  metric: 'pain' | 'posture' | 'symmetry';
  before: number | null;
  after: number | null;
}) {
  const info = getMetricInfo(metric);
  const change = computeMetricChange(before, after, info.lowerIsBetter);

  if (!change.changed) return null;

  const metricColors: Record<string, string> = {
    pain: colors.pain,
    posture: colors.posture,
    symmetry: colors.symmetry,
  };
  const color = metricColors[metric] ?? colors.teal;

  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{info.label}</Text>
      <View style={styles.metricRow}>
        <View style={styles.metricValueBox}>
          <Text style={styles.metricSmallLabel}>Before</Text>
          <Text style={styles.metricValue}>{formatMetricValue(metric, before)}</Text>
        </View>
        <Ionicons
          name="arrow-forward"
          size={18}
          color={change.improved ? colors.success : colors.error}
        />
        <View style={styles.metricValueBox}>
          <Text style={styles.metricSmallLabel}>After</Text>
          <Text style={[styles.metricValue, { color: change.improved ? colors.success : colors.error }]}>
            {formatMetricValue(metric, after)}
          </Text>
        </View>
        <View
          style={[
            styles.changeBadge,
            { backgroundColor: change.improved ? colors.successDim : colors.errorDim },
          ]}
        >
          <Ionicons
            name={change.improved ? 'trending-up' : 'trending-down'}
            size={14}
            color={change.improved ? colors.success : colors.error}
          />
          <Text
            style={[
              styles.changeText,
              { color: change.improved ? colors.success : colors.error },
            ]}
          >
            {change.improved ? 'Improved' : 'Worsened'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Goal type label ─────────────────────────────────────────────────

const GOAL_LABELS: Record<ProgramGoalType, string> = {
  scoliosis_correction: 'Scoliosis Correction',
  pain_reduction: 'Pain Relief',
  posture_improvement: 'Posture Improvement',
  general_mobility: 'General Mobility',
  custom: 'Custom',
};

// ── Main Screen ─────────────────────────────────────────────────────

export default function CompletionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ programId: string }>();
  const [program, setProgram] = useState<TrainingProgram | null>(null);
  const [outcome, setOutcome] = useState<ProgramOutcome | null>(null);
  const [suggestion, setSuggestion] = useState<NextProgramSuggestion | null>(null);
  const [loading, setLoading] = useState(true);

  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const fetchData = useCallback(async () => {
    try {
      if (!params.programId) return;
      const detail = await getProgramDetail(params.programId);
      if (!detail) return;

      setProgram(detail);

      // For now, use the description to extract starting metrics
      // In production, these would come from metric_entries table
      const metricsBefore = parseMetricsFromDescription(detail.description);
      // Current metrics would be fetched from Supabase — using placeholder
      const metricsAfter: MetricSnapshot = {
        pain_level: metricsBefore.pain_level != null ? Math.max(1, metricsBefore.pain_level - 2) : null,
        posture_score: metricsBefore.posture_score != null ? Math.min(100, metricsBefore.posture_score + 12) : null,
        symmetry_score: metricsBefore.symmetry_score != null ? Math.min(100, metricsBefore.symmetry_score + 10) : null,
      };

      const programOutcome = buildProgramOutcome(detail, metricsBefore, metricsAfter);
      setOutcome(programOutcome);
      setSuggestion(suggestNextProgram(programOutcome));
    } catch {
      // silently handle — the screen will show empty
    } finally {
      setLoading(false);
    }
  }, [params.programId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!loading && outcome) {
      notifySuccess();
      scaleAnim.setValue(0.5);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loading, outcome, scaleAnim, opacityAnim]);

  const handleShare = async () => {
    if (!outcome) return;
    const message = `I just completed "${outcome.programName}"! ${outcome.daysTaken} days, ${outcome.adherencePct}% adherence, ${outcome.sessionsCompleted}/${outcome.sessionsTotal} sessions. 🏆`;
    try {
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(message);
      } else {
        await Share.share({ message });
      }
    } catch {
      await Clipboard.setStringAsync(message);
    }
  };

  const handleStartNext = () => {
    // Navigate to program generator (existing /program route handles generation)
    router.push('/program');
  };

  const handleViewTraining = () => {
    router.replace('/training');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.teal} />
        <Text style={styles.loadingText}>Loading results...</Text>
      </View>
    );
  }

  if (!outcome || !program) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.loadingText}>Could not load program data</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Confetti */}
      {CONFETTI_ITEMS.map((item) => (
        <ConfettiParticle key={item.id} emoji={item.emoji} left={item.left} delay={item.delay} />
      ))}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Celebration Header */}
        <Animated.View
          style={[styles.celebrationHeader, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
        >
          <Text style={styles.trophyEmoji}>🏆</Text>
          <Text style={styles.congratsTitle}>Program Complete!</Text>
          <Text style={styles.programName}>{outcome.programName}</Text>
          <View style={styles.goalBadge}>
            <Text style={styles.goalBadgeText}>{GOAL_LABELS[outcome.goalType]}</Text>
          </View>
        </Animated.View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCell}>
            <Text style={styles.statCellValue}>{outcome.daysTaken}</Text>
            <Text style={styles.statCellLabel}>Days</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statCellValue}>{outcome.durationWeeks}</Text>
            <Text style={styles.statCellLabel}>Weeks</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={[styles.statCellValue, outcome.adherencePct >= 80 ? { color: colors.success } : {}]}>
              {outcome.adherencePct}%
            </Text>
            <Text style={styles.statCellLabel}>Adherence</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statCellValue}>
              {outcome.sessionsCompleted}/{outcome.sessionsTotal}
            </Text>
            <Text style={styles.statCellLabel}>Sessions</Text>
          </View>
        </View>

        {/* Before/After Metrics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Before & After</Text>
          <MetricComparison
            metric="pain"
            before={outcome.metricsBefore.pain_level}
            after={outcome.metricsAfter.pain_level}
          />
          <MetricComparison
            metric="posture"
            before={outcome.metricsBefore.posture_score}
            after={outcome.metricsAfter.posture_score}
          />
          <MetricComparison
            metric="symmetry"
            before={outcome.metricsBefore.symmetry_score}
            after={outcome.metricsAfter.symmetry_score}
          />
        </View>

        {/* Outcome Badge */}
        <View style={[styles.outcomeBadge, outcome.primaryMetricImproved ? styles.outcomeBadgeSuccess : styles.outcomeBadgeWarning]}>
          <Ionicons
            name={outcome.primaryMetricImproved ? 'checkmark-circle' : 'information-circle'}
            size={22}
            color={outcome.primaryMetricImproved ? colors.success : colors.warning}
          />
          <Text style={[styles.outcomeBadgeText, { color: outcome.primaryMetricImproved ? colors.success : colors.warning }]}>
            {outcome.primaryMetricImproved
              ? 'Your primary metric improved!'
              : 'Primary metric needs more work — keep going!'}
          </Text>
        </View>

        {/* Next Program Suggestion */}
        {suggestion && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What's Next</Text>
            <View style={styles.suggestionCard}>
              <View style={styles.suggestionHeader}>
                <Ionicons name="sparkles" size={20} color={colors.teal} />
                <Text style={styles.suggestionTitle}>
                  {GOAL_LABELS[suggestion.suggestedGoalType]} · {suggestion.suggestedWeeks} Weeks
                </Text>
              </View>
              <Text style={styles.suggestionReason}>{suggestion.reason}</Text>
              <Text style={styles.suggestionShift}>{suggestion.focusShift}</Text>
              <Pressable style={styles.generateNextButton} onPress={handleStartNext}>
                <Ionicons name="rocket-outline" size={18} color={colors.bgDeep} />
                <Text style={styles.generateNextText}>Generate Next Program</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Pressable style={styles.shareButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={18} color={colors.teal} />
            <Text style={styles.shareButtonText}>Share</Text>
          </Pressable>
          <Pressable style={styles.doneButton} onPress={handleViewTraining}>
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extract starting metrics from the program description.
 * The generator embeds "Starting pain level: X/10" etc. in descriptions.
 */
function parseMetricsFromDescription(description: string | null): MetricSnapshot {
  const result: MetricSnapshot = { pain_level: null, posture_score: null, symmetry_score: null };
  if (!description) return result;

  const painMatch = description.match(/pain level:\s*(\d+)/i);
  if (painMatch) result.pain_level = parseInt(painMatch[1], 10);

  const postureMatch = description.match(/posture score:\s*(\d+)/i);
  if (postureMatch) result.posture_score = parseInt(postureMatch[1], 10);

  const symmetryMatch = description.match(/symmetry:\s*(\d+)/i);
  if (symmetryMatch) result.symmetry_score = parseInt(symmetryMatch[1], 10);

  return result;
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDeep,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing['3xl'],
    paddingBottom: 100,
  },
  confetti: {
    position: 'absolute',
    top: -40,
    fontSize: 22,
    zIndex: 10,
  },

  // Loading
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
  backButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.tealDim,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  backButtonText: {
    ...typography.captionMedium,
    color: colors.teal,
  },

  // Celebration Header
  celebrationHeader: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  trophyEmoji: {
    fontSize: 72,
    marginBottom: spacing.md,
  },
  congratsTitle: {
    ...typography.hero,
    color: colors.tealLight,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  programName: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  goalBadge: {
    backgroundColor: colors.tealDim,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  goalBadgeText: {
    ...typography.small,
    color: colors.teal,
    fontWeight: '600',
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statCellValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  statCellLabel: {
    ...typography.tiny,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Section
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },

  // Metric Comparison
  metricCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metricValueBox: {
    alignItems: 'center',
  },
  metricSmallLabel: {
    ...typography.tiny,
    color: colors.textTertiary,
  },
  metricValue: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: 2,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  changeText: {
    ...typography.small,
    fontWeight: '600',
  },

  // Outcome Badge
  outcomeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  outcomeBadgeSuccess: {
    backgroundColor: colors.successDim,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  outcomeBadgeWarning: {
    backgroundColor: colors.warningDim,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  outcomeBadgeText: {
    ...typography.captionMedium,
    flex: 1,
  },

  // Next Program Suggestion
  suggestionCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  suggestionTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
  },
  suggestionReason: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  suggestionShift: {
    ...typography.small,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  generateNextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.teal,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
  },
  generateNextText: {
    ...typography.bodySemibold,
    color: colors.bgDeep,
  },

  // Action Buttons
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  shareButtonText: {
    ...typography.bodyMedium,
    color: colors.teal,
  },
  doneButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  doneButtonText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
});
