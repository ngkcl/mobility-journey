/**
 * TP-005: Weekly Review and Progression
 *
 * Pure functions for computing weekly review data and generating
 * adjustment suggestions based on adherence, pain trends, and volume.
 */

import { getSupabase } from './supabase';
import type {
  TrainingProgram,
  ProgramPhase,
  ProgramWeek,
  ProgramSession,
} from './trainingProgram';
import { getProgramDetail, updateProgram, advanceWeek } from './trainingProgram';

// ── Types ──────────────────────────────────────────────────────────

export interface WeekReview {
  programId: string;
  weekNumber: number;
  adherence_pct: number;
  sessions_completed: number;
  sessions_total: number;
  sessions_missed: number;
  total_volume: number;
  total_sets: number;
  total_reps: number;
  pain_before_avg: number | null;
  pain_after_avg: number | null;
  pain_trend: 'improved' | 'worsened' | 'stable' | 'unknown';
  energy_avg: number | null;
  is_deload: boolean;
  intensity_pct: number;
  phase_focus: string;
}

export interface WeekComparison {
  current: WeekReview;
  previous: WeekReview | null;
  adherence_change: number | null;
  volume_change_pct: number | null;
  pain_change: number | null;
}

export type AdjustmentType =
  | 'repeat_week'
  | 'reduce_intensity'
  | 'increase_intensity'
  | 'continue'
  | 'advance';

export interface WeekAdjustment {
  type: AdjustmentType;
  reason: string;
  details: string;
  intensity_modifier: number; // e.g. -15 means reduce by 15%
  priority: number; // 1 = highest
}

export interface ReviewDecision {
  programId: string;
  weekNumber: number;
  adjustment: AdjustmentType;
  intensity_modifier: number;
  notes: string | null;
  decided_at: string;
}

// ── Pure Functions (testable) ─────────────────────────────────────

/**
 * Compute a WeekReview from a program week's session data and workout history.
 */
export function computeWeekReview(
  programId: string,
  week: ProgramWeek,
  phase: ProgramPhase,
  workoutData: { total_volume: number; total_sets: number; total_reps: number },
  painData: { pain_before: number[]; pain_after: number[]; energy: number[] }
): WeekReview {
  const sessions = week.sessions ?? [];
  const completed = sessions.filter((s) => s.completed).length;
  const total = sessions.length;
  const missed = total - completed;
  const adherence = total === 0 ? 100 : Math.round((completed / total) * 100);

  const avgOrNull = (arr: number[]) =>
    arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

  const painBeforeAvg = avgOrNull(painData.pain_before);
  const painAfterAvg = avgOrNull(painData.pain_after);

  let pain_trend: WeekReview['pain_trend'] = 'unknown';
  if (painBeforeAvg != null && painAfterAvg != null) {
    const diff = painAfterAvg - painBeforeAvg;
    if (diff <= -0.5) pain_trend = 'improved';
    else if (diff >= 0.5) pain_trend = 'worsened';
    else pain_trend = 'stable';
  }

  return {
    programId,
    weekNumber: week.week_number,
    adherence_pct: adherence,
    sessions_completed: completed,
    sessions_total: total,
    sessions_missed: missed,
    total_volume: workoutData.total_volume,
    total_sets: workoutData.total_sets,
    total_reps: workoutData.total_reps,
    pain_before_avg: painBeforeAvg,
    pain_after_avg: painAfterAvg,
    pain_trend,
    energy_avg: avgOrNull(painData.energy),
    is_deload: week.is_deload,
    intensity_pct: week.intensity_pct,
    phase_focus: phase.focus,
  };
}

/**
 * Compare current week review to the previous week's review.
 */
export function compareWeeks(
  current: WeekReview,
  previous: WeekReview | null
): WeekComparison {
  const adherence_change = previous != null ? current.adherence_pct - previous.adherence_pct : null;
  const volume_change_pct =
    previous != null && previous.total_volume > 0
      ? Math.round(((current.total_volume - previous.total_volume) / previous.total_volume) * 100)
      : null;
  const pain_change =
    current.pain_after_avg != null && previous?.pain_after_avg != null
      ? Math.round((current.pain_after_avg - previous.pain_after_avg) * 10) / 10
      : null;

  return { current, previous, adherence_change, volume_change_pct, pain_change };
}

/**
 * Generate adjustment suggestions based on a week review.
 */
export function suggestAdjustments(review: WeekReview, previous: WeekReview | null): WeekAdjustment[] {
  const suggestions: WeekAdjustment[] = [];

  // Low adherence: suggest repeating or reducing
  if (review.adherence_pct < 40) {
    suggestions.push({
      type: 'repeat_week',
      reason: 'Very low adherence',
      details: `Only ${review.sessions_completed} of ${review.sessions_total} sessions completed (${review.adherence_pct}%). Consider repeating this week with the same targets.`,
      intensity_modifier: 0,
      priority: 1,
    });
  } else if (review.adherence_pct < 60) {
    suggestions.push({
      type: 'reduce_intensity',
      reason: 'Low adherence',
      details: `${review.sessions_completed} of ${review.sessions_total} sessions completed (${review.adherence_pct}%). Reducing intensity by 10% for the next week may help you stay on track.`,
      intensity_modifier: -10,
      priority: 2,
    });
  }

  // Pain increased: reduce intensity
  if (review.pain_trend === 'worsened') {
    const modifier = review.pain_after_avg != null && review.pain_after_avg >= 7 ? -20 : -15;
    suggestions.push({
      type: 'reduce_intensity',
      reason: 'Pain increased during workouts',
      details: `Average pain went from ${review.pain_before_avg ?? '?'} to ${review.pain_after_avg ?? '?'} after sessions. Reducing intensity by ${Math.abs(modifier)}% to allow recovery.`,
      intensity_modifier: modifier,
      priority: 1,
    });
  }

  // Pain improved and good adherence: confirm progression
  if (review.pain_trend === 'improved' && review.adherence_pct >= 80) {
    suggestions.push({
      type: 'advance',
      reason: 'Great week — pain improving and strong adherence',
      details: `Pain decreased and ${review.adherence_pct}% adherence. You're ready to progress to the next week.`,
      intensity_modifier: 0,
      priority: 3,
    });
  }

  // Good adherence, stable pain: normal progression
  if (suggestions.length === 0 && review.adherence_pct >= 60) {
    suggestions.push({
      type: 'continue',
      reason: 'Solid week',
      details: `${review.adherence_pct}% adherence with ${review.pain_trend} pain. Continue to the next week as planned.`,
      intensity_modifier: 0,
      priority: 3,
    });
  }

  // If deload week had good adherence, suggest bumping intensity slightly
  if (review.is_deload && review.adherence_pct >= 80 && review.pain_trend !== 'worsened') {
    suggestions.push({
      type: 'increase_intensity',
      reason: 'Recovery week went well',
      details: 'Deload week completed successfully. You can increase intensity by 5% for the next training week.',
      intensity_modifier: 5,
      priority: 4,
    });
  }

  return suggestions.sort((a, b) => a.priority - b.priority);
}

/**
 * Check whether the current week is ready for review
 * (all sessions done, or the week calendar has passed).
 */
export function isWeekReadyForReview(
  week: ProgramWeek,
  programStartDate: string | null,
  currentWeek: number
): boolean {
  if (week.week_number >= currentWeek) return false; // only review completed weeks

  const sessions = week.sessions ?? [];
  if (sessions.length === 0) return true;

  // All sessions completed
  const allDone = sessions.every((s) => s.completed);
  if (allDone) return true;

  // Week has elapsed (program start + weeks * 7 days < now)
  if (programStartDate) {
    const start = new Date(programStartDate);
    const weekEnd = new Date(start);
    weekEnd.setDate(weekEnd.getDate() + week.week_number * 7);
    if (weekEnd < new Date()) return true;
  }

  return false;
}

/**
 * Check if the user should see the weekly review on app open.
 * Returns the week number that needs review, or null.
 */
export function getWeekNeedingReview(program: TrainingProgram): number | null {
  if (!program.phases || program.status !== 'active') return null;

  // Find the most recent completed week that hasn't been reviewed
  // We check current_week - 1 (the just-completed week)
  const previousWeek = program.current_week - 1;
  if (previousWeek < 1) return null;

  // Find the week data
  for (const phase of program.phases) {
    for (const week of phase.weeks ?? []) {
      if (week.week_number === previousWeek) {
        const sessions = week.sessions ?? [];
        const allDone = sessions.every((s) => s.completed);
        // If all sessions are done, this week needs review
        if (allDone && sessions.length > 0) return previousWeek;
      }
    }
  }

  return null;
}

// ── Data Fetching ─────────────────────────────────────────────────

/**
 * Fetch workout data for a specific program week.
 * Looks at workouts logged during that week's date range.
 */
export async function fetchWeekWorkoutData(
  programStartDate: string,
  weekNumber: number
): Promise<{ total_volume: number; total_sets: number; total_reps: number }> {
  const supabase = getSupabase();
  const start = new Date(programStartDate);
  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const { data: workouts } = await supabase
    .from('workouts')
    .select('id')
    .gte('date', weekStart.toISOString().slice(0, 10))
    .lt('date', weekEnd.toISOString().slice(0, 10));

  if (!workouts?.length) return { total_volume: 0, total_sets: 0, total_reps: 0 };

  const workoutIds = workouts.map((w: { id: string }) => w.id);
  const { data: exercises } = await supabase
    .from('workout_exercises')
    .select('sets')
    .in('workout_id', workoutIds);

  let total_volume = 0;
  let total_sets = 0;
  let total_reps = 0;

  for (const ex of exercises ?? []) {
    const sets = (ex.sets as { reps?: number; weight_kg?: number }[]) ?? [];
    for (const set of sets) {
      total_sets++;
      const reps = set.reps ?? 0;
      const weight = set.weight_kg ?? 0;
      total_reps += reps;
      total_volume += reps * weight;
    }
  }

  return { total_volume, total_sets, total_reps };
}

/**
 * Fetch pain/energy data from metrics logged during a program week.
 */
export async function fetchWeekPainData(
  programStartDate: string,
  weekNumber: number
): Promise<{ pain_before: number[]; pain_after: number[]; energy: number[] }> {
  const supabase = getSupabase();
  const start = new Date(programStartDate);
  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const { data: entries } = await supabase
    .from('metric_entries')
    .select('pain_level, energy_level, recorded_at')
    .gte('recorded_at', weekStart.toISOString())
    .lt('recorded_at', weekEnd.toISOString())
    .order('recorded_at', { ascending: true });

  const pain_before: number[] = [];
  const pain_after: number[] = [];
  const energy: number[] = [];

  // Split entries into before/after (first half vs second half of week)
  const midpoint = new Date(weekStart);
  midpoint.setDate(midpoint.getDate() + 3);

  for (const entry of entries ?? []) {
    const entryDate = new Date(entry.recorded_at);
    if (entry.pain_level != null) {
      if (entryDate < midpoint) pain_before.push(entry.pain_level);
      else pain_after.push(entry.pain_level);
    }
    if (entry.energy_level != null) energy.push(entry.energy_level);
  }

  return { pain_before, pain_after, energy };
}

/**
 * Build a full week review by fetching data and computing metrics.
 */
export async function reviewWeek(
  programId: string,
  weekNumber: number
): Promise<WeekReview | null> {
  const program = await getProgramDetail(programId);
  if (!program?.phases) return null;

  let targetWeek: ProgramWeek | null = null;
  let targetPhase: ProgramPhase | null = null;

  for (const phase of program.phases) {
    for (const week of phase.weeks ?? []) {
      if (week.week_number === weekNumber) {
        targetWeek = week;
        targetPhase = phase;
        break;
      }
    }
    if (targetWeek) break;
  }

  if (!targetWeek || !targetPhase) return null;

  const startDate = program.started_at ?? program.created_at;
  const [workoutData, painData] = await Promise.all([
    fetchWeekWorkoutData(startDate, weekNumber),
    fetchWeekPainData(startDate, weekNumber),
  ]);

  return computeWeekReview(programId, targetWeek, targetPhase, workoutData, painData);
}

/**
 * Apply an adjustment to the next week's intensity in the program.
 */
export async function applyAdjustment(
  programId: string,
  nextWeekNumber: number,
  intensityModifier: number
): Promise<void> {
  if (intensityModifier === 0) return;

  const supabase = getSupabase();
  const program = await getProgramDetail(programId);
  if (!program?.phases) return;

  for (const phase of program.phases) {
    for (const week of phase.weeks ?? []) {
      if (week.week_number === nextWeekNumber && week.id) {
        const newIntensity = Math.max(30, Math.min(100, week.intensity_pct + intensityModifier));
        await supabase
          .from('program_weeks')
          .update({ intensity_pct: newIntensity })
          .eq('id', week.id);
        return;
      }
    }
  }
}

/**
 * Log a review decision and advance the program.
 */
export async function submitReviewDecision(decision: ReviewDecision): Promise<void> {
  // Apply intensity adjustment if needed
  if (decision.intensity_modifier !== 0) {
    await applyAdjustment(decision.programId, decision.weekNumber + 1, decision.intensity_modifier);
  }

  // For repeat_week, don't advance — keep current_week the same
  if (decision.adjustment !== 'repeat_week') {
    await advanceWeek(decision.programId);
  }
}
