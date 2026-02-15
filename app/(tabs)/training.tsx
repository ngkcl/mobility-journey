/**
 * TP-003: Program Overview Screen
 *
 * Replaces 'plan' in the visible tab bar.
 * Shows the active training program with phase timeline, weekly breakdown,
 * and quick access to start today's session.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getActiveProgram, getProgramDetail } from '../../lib/trainingProgram';
import type {
  TrainingProgram,
  ProgramPhase,
  ProgramWeek,
  ProgramSession,
  PhaseFocus,
} from '../../lib/trainingProgram';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';

// ── Phase Colors ───────────────────────────────────────────────────

const PHASE_COLORS: Record<PhaseFocus, { bg: string; text: string; border: string }> = {
  release: { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' },
  activate: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
  strengthen: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
  integrate: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
};

const PHASE_ICONS: Record<PhaseFocus, string> = {
  release: 'water-outline',
  activate: 'flash-outline',
  strengthen: 'barbell-outline',
  integrate: 'sync-outline',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Helper Functions ───────────────────────────────────────────────

function getPhaseForWeek(phases: ProgramPhase[], weekNumber: number): ProgramPhase | null {
  let weekCounter = 0;
  for (const phase of phases) {
    for (const week of phase.weeks ?? []) {
      weekCounter++;
      if (week.week_number === weekNumber) return phase;
    }
  }
  return null;
}

function getAllWeeks(phases: ProgramPhase[]): (ProgramWeek & { phase: ProgramPhase })[] {
  const weeks: (ProgramWeek & { phase: ProgramPhase })[] = [];
  for (const phase of phases) {
    for (const week of phase.weeks ?? []) {
      weeks.push({ ...week, phase });
    }
  }
  return weeks.sort((a, b) => a.week_number - b.week_number);
}

function getCompletedSessionsForWeek(week: ProgramWeek): number {
  return (week.sessions ?? []).filter((s) => s.completed).length;
}

function getTotalSessionsForWeek(week: ProgramWeek): number {
  return (week.sessions ?? []).length;
}

function getTodaySession(week: ProgramWeek): ProgramSession | null {
  const today = new Date().getDay();
  return (week.sessions ?? []).find((s) => s.day_of_week === today) ?? null;
}

function computeAdherence(phases: ProgramPhase[], currentWeek: number): number {
  let completed = 0;
  let total = 0;
  for (const phase of phases) {
    for (const week of phase.weeks ?? []) {
      if (week.week_number > currentWeek) continue;
      for (const session of week.sessions ?? []) {
        total++;
        if (session.completed) completed++;
      }
    }
  }
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

function getWeeksCompleted(phases: ProgramPhase[], currentWeek: number): number {
  return Math.max(0, currentWeek - 1);
}

// ── Components ─────────────────────────────────────────────────────

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrapper}>
        <Ionicons name="barbell-outline" size={64} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>No Active Program</Text>
      <Text style={styles.emptySubtitle}>
        Generate a personalized training program based on your goals, metrics, and fitness level.
      </Text>
      <Pressable style={styles.generateButton} onPress={onGenerate}>
        <Ionicons name="sparkles" size={20} color={colors.bgDeep} />
        <Text style={styles.generateButtonText}>Generate Program</Text>
      </Pressable>
    </View>
  );
}

function ProgramHeader({ program }: { program: TrainingProgram }) {
  const goalLabels: Record<string, string> = {
    scoliosis_correction: 'Scoliosis Correction',
    pain_reduction: 'Pain Reduction',
    posture_improvement: 'Posture Improvement',
    general_mobility: 'General Mobility',
    custom: 'Custom',
  };

  return (
    <View style={styles.headerCard}>
      <View style={styles.headerTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.programName}>{program.name}</Text>
          {program.description && (
            <Text style={styles.programDescription} numberOfLines={2}>
              {program.description}
            </Text>
          )}
        </View>
        <View style={styles.goalBadge}>
          <Text style={styles.goalBadgeText}>
            {goalLabels[program.goal_type] ?? program.goal_type}
          </Text>
        </View>
      </View>
      <View style={styles.headerMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.metaText}>
            Week {program.current_week} of {program.duration_weeks}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.metaText}>
            {program.started_at
              ? `Started ${new Date(program.started_at).toLocaleDateString()}`
              : 'Not started'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function PhaseTimeline({
  phases,
  currentWeek,
}: {
  phases: ProgramPhase[];
  currentWeek: number;
}) {
  const totalWeeks = phases.reduce((sum, p) => sum + p.duration_weeks, 0);
  const currentPhase = getPhaseForWeek(phases, currentWeek);

  return (
    <View style={styles.timelineContainer}>
      <Text style={styles.sectionTitle}>Phase Timeline</Text>
      <View style={styles.timelineBar}>
        {phases.map((phase) => {
          const widthPct = (phase.duration_weeks / totalWeeks) * 100;
          const phaseColor = PHASE_COLORS[phase.focus];
          const isCurrent = currentPhase?.phase_number === phase.phase_number;

          return (
            <View
              key={phase.phase_number}
              style={[
                styles.timelineSegment,
                {
                  width: `${widthPct}%` as unknown as number,
                  backgroundColor: isCurrent ? phaseColor.text : phaseColor.bg,
                  borderColor: isCurrent ? phaseColor.text : phaseColor.border,
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.phaseLabels}>
        {phases.map((phase) => {
          const phaseColor = PHASE_COLORS[phase.focus];
          const isCurrent = currentPhase?.phase_number === phase.phase_number;

          return (
            <View key={phase.phase_number} style={styles.phaseLabelItem}>
              <View
                style={[
                  styles.phaseDot,
                  {
                    backgroundColor: isCurrent ? phaseColor.text : phaseColor.bg,
                    borderColor: phaseColor.border,
                  },
                ]}
              />
              <Text
                style={[
                  styles.phaseLabelText,
                  isCurrent && { color: phaseColor.text, fontWeight: '600' },
                ]}
              >
                {phase.name}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StatsRow({
  phases,
  currentWeek,
}: {
  phases: ProgramPhase[];
  currentWeek: number;
}) {
  const allWeeks = getAllWeeks(phases);
  const currentWeekData = allWeeks.find((w) => w.week_number === currentWeek);
  const sessionsThisWeek = currentWeekData ? getCompletedSessionsForWeek(currentWeekData) : 0;
  const totalThisWeek = currentWeekData ? getTotalSessionsForWeek(currentWeekData) : 0;
  const adherence = computeAdherence(phases, currentWeek);
  const weeksCompleted = getWeeksCompleted(phases, currentWeek);

  return (
    <View style={styles.statsRow}>
      <View style={styles.statItem}>
        <Text style={styles.statValue}>{weeksCompleted}</Text>
        <Text style={styles.statLabel}>Weeks Done</Text>
      </View>
      <View style={[styles.statItem, styles.statDivider]}>
        <Text style={styles.statValue}>
          {sessionsThisWeek}/{totalThisWeek}
        </Text>
        <Text style={styles.statLabel}>This Week</Text>
      </View>
      <View style={[styles.statItem, styles.statDivider]}>
        <Text style={[styles.statValue, adherence >= 80 ? { color: colors.success } : adherence >= 50 ? { color: colors.warning } : { color: colors.error }]}>
          {adherence}%
        </Text>
        <Text style={styles.statLabel}>Adherence</Text>
      </View>
    </View>
  );
}

function WeekCard({
  week,
  phase,
  isCurrent,
  onPress,
}: {
  week: ProgramWeek;
  phase: ProgramPhase;
  isCurrent: boolean;
  onPress: () => void;
}) {
  const phaseColor = PHASE_COLORS[phase.focus];
  const completed = getCompletedSessionsForWeek(week);
  const total = getTotalSessionsForWeek(week);
  const progress = total === 0 ? 0 : completed / total;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.weekCard,
        isCurrent && { borderColor: colors.teal, borderWidth: 1.5 },
      ]}
    >
      <View style={styles.weekCardHeader}>
        <View style={styles.weekCardLeft}>
          <Text style={[styles.weekNumber, isCurrent && { color: colors.teal }]}>
            Week {week.week_number}
          </Text>
          {week.is_deload && (
            <View style={styles.deloadBadge}>
              <Text style={styles.deloadText}>Deload</Text>
            </View>
          )}
          {isCurrent && (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>Current</Text>
            </View>
          )}
        </View>
        <View style={[styles.phaseBadge, { backgroundColor: phaseColor.bg, borderColor: phaseColor.border }]}>
          <Ionicons name={PHASE_ICONS[phase.focus] as any} size={12} color={phaseColor.text} />
          <Text style={[styles.phaseBadgeText, { color: phaseColor.text }]}>
            {phase.focus.charAt(0).toUpperCase() + phase.focus.slice(1)}
          </Text>
        </View>
      </View>

      <View style={styles.weekCardBody}>
        <View style={styles.weekMeta}>
          <Text style={styles.weekMetaText}>
            {total} sessions · {Math.round(week.intensity_pct)}% intensity
          </Text>
        </View>

        {/* Session dots */}
        <View style={styles.sessionDots}>
          {(week.sessions ?? []).map((session, idx) => (
            <View key={idx} style={styles.sessionDot}>
              <View
                style={[
                  styles.dot,
                  session.completed
                    ? { backgroundColor: colors.success }
                    : { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
                ]}
              />
              <Text style={styles.dotLabel}>{DAY_NAMES[session.day_of_week]}</Text>
            </View>
          ))}
        </View>

        {/* Progress bar */}
        <View style={styles.weekProgress}>
          <View style={styles.weekProgressBg}>
            <View
              style={[
                styles.weekProgressFill,
                {
                  width: `${progress * 100}%` as unknown as number,
                  backgroundColor: progress >= 0.8 ? colors.success : progress >= 0.5 ? colors.warning : colors.textMuted,
                },
              ]}
            />
          </View>
          <Text style={styles.weekProgressText}>
            {completed}/{total}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── Main Screen ────────────────────────────────────────────────────

export default function TrainingScreen() {
  const router = useRouter();
  const [program, setProgram] = useState<TrainingProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProgram = useCallback(async () => {
    try {
      setError(null);
      const active = await getActiveProgram();
      if (active) {
        const detail = await getProgramDetail(active.id);
        setProgram(detail);
      } else {
        setProgram(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load program');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProgram();
  }, [fetchProgram]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProgram();
  }, [fetchProgram]);

  const allWeeks = useMemo(
    () => (program?.phases ? getAllWeeks(program.phases) : []),
    [program]
  );

  const currentWeekData = useMemo(
    () => allWeeks.find((w) => w.week_number === program?.current_week),
    [allWeeks, program?.current_week]
  );

  const todaySession = useMemo(
    () => (currentWeekData ? getTodaySession(currentWeekData) : null),
    [currentWeekData]
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.teal} />
        <Text style={styles.loadingText}>Loading program...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={[styles.loadingText, { color: colors.error }]}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={fetchProgram}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!program || !program.phases) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.teal}
          />
        }
      >
        <EmptyState onGenerate={() => router.push('/program')} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.teal}
          />
        }
      >
        <ProgramHeader program={program} />
        <PhaseTimeline phases={program.phases} currentWeek={program.current_week} />
        <StatsRow phases={program.phases} currentWeek={program.current_week} />

        {/* Weekly Breakdown */}
        <View style={styles.weeklySection}>
          <Text style={styles.sectionTitle}>Weekly Breakdown</Text>
          {allWeeks.map((week) => (
            <WeekCard
              key={week.week_number}
              week={week}
              phase={week.phase}
              isCurrent={week.week_number === program.current_week}
              onPress={() => {
                // Navigate to first uncompleted session, or first session if all done
                const sessions = week.sessions ?? [];
                const target = sessions.find((s) => !s.completed) ?? sessions[0];
                if (target) {
                  router.push({
                    pathname: '/training/session',
                    params: {
                      programId: program.id,
                      weekNumber: String(week.week_number),
                      dayOfWeek: String(target.day_of_week),
                      sessionId: target.id ?? '',
                    },
                  });
                }
              }}
            />
          ))}
        </View>
      </ScrollView>

      {/* Floating Action Button — Start Today's Session */}
      {todaySession && !todaySession.completed && (
        <Pressable
          style={styles.fab}
          onPress={() => {
            router.push({
              pathname: '/training/session',
              params: {
                programId: program.id,
                weekNumber: String(program.current_week),
                dayOfWeek: String(new Date().getDay()),
                sessionId: todaySession.id ?? '',
              },
            });
          }}
        >
          <Ionicons name="play" size={22} color={colors.bgDeep} />
          <Text style={styles.fabText}>Start Today's Session</Text>
        </Pressable>
      )}
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
    paddingBottom: 100,
    paddingTop: spacing.md,
  },

  // Loading / Error
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

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: spacing.md,
  },
  emptyIconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    lineHeight: 22,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.teal,
    borderRadius: radii.lg,
    marginTop: spacing.md,
  },
  generateButtonText: {
    ...typography.captionMedium,
    color: colors.bgDeep,
    fontWeight: '700',
  },

  // Header Card
  headerCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  programName: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  programDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  goalBadge: {
    backgroundColor: colors.tealDim,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.tealBorder,
    marginLeft: spacing.sm,
  },
  goalBadgeText: {
    ...typography.tiny,
    color: colors.teal,
    fontWeight: '600',
  },
  headerMeta: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // Phase Timeline
  timelineContainer: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  timelineBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    marginBottom: spacing.sm,
  },
  timelineSegment: {
    height: '100%',
    borderWidth: 0.5,
  },
  phaseLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  phaseLabelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phaseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  phaseLabelText: {
    ...typography.tiny,
    color: colors.textTertiary,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  statValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.tiny,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Weekly Section
  weeklySection: {
    marginBottom: spacing.md,
  },

  // Week Card
  weekCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  weekCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  weekNumber: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  deloadBadge: {
    backgroundColor: colors.warningDim,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  deloadText: {
    ...typography.tiny,
    color: colors.warning,
    fontWeight: '600',
  },
  currentBadge: {
    backgroundColor: colors.tealDim,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currentBadgeText: {
    ...typography.tiny,
    color: colors.teal,
    fontWeight: '600',
  },
  phaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  phaseBadgeText: {
    ...typography.tiny,
    fontWeight: '600',
  },

  weekCardBody: {
    gap: spacing.xs,
  },
  weekMeta: {
    flexDirection: 'row',
  },
  weekMetaText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  sessionDots: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: 4,
  },
  sessionDot: {
    alignItems: 'center',
    gap: 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    fontSize: 9,
  },
  weekProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  weekProgressBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgDeep,
    overflow: 'hidden',
  },
  weekProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  weekProgressText: {
    ...typography.tiny,
    color: colors.textTertiary,
    minWidth: 28,
    textAlign: 'right',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.teal,
    paddingVertical: 14,
    borderRadius: radii.lg,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    ...typography.captionMedium,
    color: colors.bgDeep,
    fontWeight: '700',
    fontSize: 16,
  },
});
