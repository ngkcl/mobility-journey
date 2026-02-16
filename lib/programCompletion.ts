/**
 * TP-006: Program Completion & Next Program
 *
 * Handles program completion detection, before/after metrics comparison,
 * outcome assessment, program history, and next program generation flow.
 */

import type {
  TrainingProgram,
  ProgramPhase,
  ProgramWeek,
  ProgramSession,
  ProgramGoalType,
} from './trainingProgram';
import type { ProgramSummary } from './programGenerator';

// ── Types ──────────────────────────────────────────────────────────

export interface MetricSnapshot {
  pain_level: number | null;
  posture_score: number | null;
  symmetry_score: number | null;
}

export interface ProgramOutcome {
  programId: string;
  programName: string;
  goalType: ProgramGoalType;
  durationWeeks: number;
  startedAt: string;
  completedAt: string;
  daysTaken: number;
  /** Metrics at program start */
  metricsBefore: MetricSnapshot;
  /** Metrics at program end */
  metricsAfter: MetricSnapshot;
  /** Overall adherence across all weeks */
  adherencePct: number;
  /** Total sessions completed */
  sessionsCompleted: number;
  /** Total sessions in the program */
  sessionsTotal: number;
  /** Phase completion counts */
  phasesCompleted: number;
  /** Whether the primary metric improved */
  primaryMetricImproved: boolean;
  /** Human-readable outcome summary */
  outcomeSummary: string;
}

export type ProgramHistoryItem = {
  id: string;
  name: string;
  goal_type: ProgramGoalType;
  duration_weeks: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
};

export interface NextProgramSuggestion {
  reason: string;
  focusShift: string;
  suggestedGoalType: ProgramGoalType;
  suggestedWeeks: number;
}

// ── Pure Functions ─────────────────────────────────────────────────

/**
 * Compute total sessions in the program.
 */
export function countTotalSessions(phases: ProgramPhase[]): number {
  let total = 0;
  for (const phase of phases) {
    for (const week of phase.weeks ?? []) {
      total += (week.sessions ?? []).length;
    }
  }
  return total;
}

/**
 * Compute total completed sessions.
 */
export function countCompletedSessions(phases: ProgramPhase[]): number {
  let completed = 0;
  for (const phase of phases) {
    for (const week of phase.weeks ?? []) {
      for (const session of week.sessions ?? []) {
        if (session.completed) completed++;
      }
    }
  }
  return completed;
}

/**
 * Compute adherence percentage across all sessions.
 */
export function computeProgramAdherence(phases: ProgramPhase[]): number {
  const total = countTotalSessions(phases);
  if (total === 0) return 0;
  const completed = countCompletedSessions(phases);
  return Math.round((completed / total) * 100);
}

/**
 * Compute the number of days between two date strings.
 */
export function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  const diffMs = e.getTime() - s.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Compute metric change for a specific metric.
 * Returns the change value (positive = improvement for posture/symmetry, negative = improvement for pain).
 */
export function computeMetricChange(
  before: number | null,
  after: number | null,
  lowerIsBetter: boolean,
): { changed: boolean; improved: boolean; delta: number } {
  if (before == null || after == null) {
    return { changed: false, improved: false, delta: 0 };
  }
  const delta = after - before;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return { changed: true, improved, delta };
}

/**
 * Determine if the primary metric for the goal type improved.
 */
export function didPrimaryMetricImprove(
  goalType: ProgramGoalType,
  before: MetricSnapshot,
  after: MetricSnapshot,
): boolean {
  switch (goalType) {
    case 'pain_reduction': {
      const { improved } = computeMetricChange(before.pain_level, after.pain_level, true);
      return improved;
    }
    case 'posture_improvement': {
      const { improved } = computeMetricChange(before.posture_score, after.posture_score, false);
      return improved;
    }
    case 'scoliosis_correction': {
      const { improved } = computeMetricChange(before.symmetry_score, after.symmetry_score, false);
      return improved;
    }
    default: {
      // General mobility: any improvement counts
      const pain = computeMetricChange(before.pain_level, after.pain_level, true);
      const posture = computeMetricChange(before.posture_score, after.posture_score, false);
      const symmetry = computeMetricChange(before.symmetry_score, after.symmetry_score, false);
      return pain.improved || posture.improved || symmetry.improved;
    }
  }
}

/**
 * Generate a human-readable outcome summary.
 */
export function buildOutcomeSummary(
  goalType: ProgramGoalType,
  before: MetricSnapshot,
  after: MetricSnapshot,
  adherencePct: number,
  daysTaken: number,
): string {
  const parts: string[] = [];

  parts.push(`Completed in ${daysTaken} days with ${adherencePct}% adherence.`);

  const pain = computeMetricChange(before.pain_level, after.pain_level, true);
  const posture = computeMetricChange(before.posture_score, after.posture_score, false);
  const symmetry = computeMetricChange(before.symmetry_score, after.symmetry_score, false);

  if (pain.changed) {
    const dir = pain.improved ? 'decreased' : 'increased';
    parts.push(`Pain ${dir} from ${before.pain_level} to ${after.pain_level}.`);
  }
  if (posture.changed) {
    const dir = posture.improved ? 'improved' : 'decreased';
    parts.push(`Posture score ${dir} from ${before.posture_score} to ${after.posture_score}.`);
  }
  if (symmetry.changed) {
    const dir = symmetry.improved ? 'improved' : 'decreased';
    parts.push(`Symmetry ${dir} from ${before.symmetry_score}% to ${after.symmetry_score}%.`);
  }

  return parts.join(' ');
}

/**
 * Build a ProgramOutcome from a completed program and metric snapshots.
 */
export function buildProgramOutcome(
  program: TrainingProgram,
  metricsBefore: MetricSnapshot,
  metricsAfter: MetricSnapshot,
): ProgramOutcome {
  const phases = program.phases ?? [];
  const sessionsTotal = countTotalSessions(phases);
  const sessionsCompleted = countCompletedSessions(phases);
  const adherencePct = computeProgramAdherence(phases);
  const startedAt = program.started_at ?? program.created_at;
  const completedAt = program.completed_at ?? new Date().toISOString();
  const days = daysBetween(startedAt, completedAt);
  const primaryImproved = didPrimaryMetricImprove(program.goal_type, metricsBefore, metricsAfter);
  const summary = buildOutcomeSummary(
    program.goal_type,
    metricsBefore,
    metricsAfter,
    adherencePct,
    days,
  );

  return {
    programId: program.id,
    programName: program.name,
    goalType: program.goal_type,
    durationWeeks: program.duration_weeks,
    startedAt,
    completedAt,
    daysTaken: days,
    metricsBefore,
    metricsAfter,
    adherencePct,
    sessionsCompleted,
    sessionsTotal,
    phasesCompleted: phases.length,
    primaryMetricImproved: primaryImproved,
    outcomeSummary: summary,
  };
}

/**
 * Suggest a next program based on outcomes of the completed program.
 */
export function suggestNextProgram(outcome: ProgramOutcome): NextProgramSuggestion {
  const { goalType, primaryMetricImproved, adherencePct, metricsAfter } = outcome;

  // If the primary metric didn't improve or adherence was low, suggest staying on same goal
  if (!primaryMetricImproved || adherencePct < 60) {
    return {
      reason: primaryMetricImproved
        ? 'Your adherence was below 60%. A focused program with fewer sessions may help.'
        : 'Your primary metric needs more work. Let\'s build on the foundation.',
      focusShift: 'Same focus with adjusted intensity',
      suggestedGoalType: goalType,
      suggestedWeeks: Math.min(8, outcome.durationWeeks + 2),
    };
  }

  // Goal-specific progression
  switch (goalType) {
    case 'pain_reduction': {
      const painNow = metricsAfter.pain_level ?? 0;
      if (painNow <= 3) {
        // Pain is low, progress to posture or scoliosis work
        return {
          reason: 'Pain is well-managed. Time to focus on posture and alignment.',
          focusShift: 'From pain relief to posture improvement',
          suggestedGoalType: 'posture_improvement',
          suggestedWeeks: 6,
        };
      }
      return {
        reason: 'Good progress on pain. Continue with more strengthening emphasis.',
        focusShift: 'Pain relief with more strength work',
        suggestedGoalType: 'pain_reduction',
        suggestedWeeks: 6,
      };
    }

    case 'posture_improvement': {
      const postureNow = metricsAfter.posture_score ?? 0;
      if (postureNow >= 75) {
        return {
          reason: 'Great posture progress! Time to address symmetry and integration.',
          focusShift: 'From posture to scoliosis correction',
          suggestedGoalType: 'scoliosis_correction',
          suggestedWeeks: 8,
        };
      }
      return {
        reason: 'Posture improving. Let\'s continue strengthening those muscles.',
        focusShift: 'Continued posture work with higher intensity',
        suggestedGoalType: 'posture_improvement',
        suggestedWeeks: 6,
      };
    }

    case 'scoliosis_correction': {
      const symmetryNow = metricsAfter.symmetry_score ?? 0;
      if (symmetryNow >= 85) {
        return {
          reason: 'Excellent symmetry! Transition to general mobility and maintenance.',
          focusShift: 'From correction to maintenance',
          suggestedGoalType: 'general_mobility',
          suggestedWeeks: 4,
        };
      }
      return {
        reason: 'Symmetry improving. Let\'s push further with targeted correction.',
        focusShift: 'Deeper scoliosis correction',
        suggestedGoalType: 'scoliosis_correction',
        suggestedWeeks: 8,
      };
    }

    default:
      return {
        reason: 'Great work! Here\'s a balanced program to keep progressing.',
        focusShift: 'Balanced mobility and strength',
        suggestedGoalType: 'general_mobility',
        suggestedWeeks: 6,
      };
  }
}

/**
 * Format a metric value for display.
 */
export function formatMetricValue(
  metric: 'pain' | 'posture' | 'symmetry',
  value: number | null,
): string {
  if (value == null) return 'N/A';
  switch (metric) {
    case 'pain':
      return `${value}/10`;
    case 'posture':
      return `${value}/100`;
    case 'symmetry':
      return `${value}%`;
  }
}

/**
 * Get the label and whether lower is better for a metric.
 */
export function getMetricInfo(metric: 'pain' | 'posture' | 'symmetry'): {
  label: string;
  lowerIsBetter: boolean;
} {
  switch (metric) {
    case 'pain':
      return { label: 'Pain Level', lowerIsBetter: true };
    case 'posture':
      return { label: 'Posture Score', lowerIsBetter: false };
    case 'symmetry':
      return { label: 'Symmetry', lowerIsBetter: false };
  }
}
