/**
 * goalTracker.ts — Automatic goal progress tracking (GL-005)
 *
 * When a metric entry is saved (pain_level, posture_score, symmetry_score),
 * this module checks for active goals of that type and auto-updates progress.
 * For workout goals, it recalculates from workout history.
 */

import { getSupabase } from './supabase';
import {
  getGoals,
  updateGoal,
  isGoalComplete,
  type Goal,
  type GoalType,
} from './goals';

// ── Metric → Goal type mapping ──────────────────────────────────────────────

type MetricName = 'pain_level' | 'posture_score' | 'symmetry_score' | 'energy_level';

const METRIC_TO_GOAL_TYPE: Record<MetricName, GoalType> = {
  pain_level: 'pain_reduction',
  posture_score: 'posture_score',
  symmetry_score: 'symmetry_improvement',
  energy_level: 'custom', // no specific goal type for energy
};

// ── Core: Track metric update ───────────────────────────────────────────────

/**
 * Call this when a metric entry is saved. Finds matching active goals
 * and auto-creates progress entries + updates current_value.
 *
 * Returns the list of goals that were updated (empty if none).
 */
export async function trackMetricUpdate(
  metricName: MetricName,
  value: number,
): Promise<Goal[]> {
  const goalType = METRIC_TO_GOAL_TYPE[metricName];
  if (!goalType || goalType === 'custom') return [];

  const activeGoals = await getGoals('active');
  const matching = activeGoals.filter((g) => g.type === goalType);
  if (matching.length === 0) return [];

  const updated: Goal[] = [];

  for (const goal of matching) {
    // Insert progress entry
    await insertGoalProgress(goal.id, value);

    // Update current_value on the goal
    const updatedGoal = await updateGoal(goal.id, { current_value: value });
    if (!updatedGoal) continue;

    // Check if goal is now complete
    if (isGoalComplete(updatedGoal) && updatedGoal.status === 'active') {
      await updateGoal(goal.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
      });
      updatedGoal.status = 'completed';
      updatedGoal.completed_at = new Date().toISOString();
    }

    updated.push(updatedGoal);
  }

  return updated;
}

// ── Workout consistency tracking ────────────────────────────────────────────

/**
 * Call after a workout is completed. Updates workout_consistency
 * and workout_streak goals based on actual workout history.
 */
export async function trackWorkoutCompleted(): Promise<Goal[]> {
  const activeGoals = await getGoals('active');
  const consistencyGoals = activeGoals.filter((g) => g.type === 'workout_consistency');
  const streakGoals = activeGoals.filter((g) => g.type === 'workout_streak');

  if (consistencyGoals.length === 0 && streakGoals.length === 0) return [];

  const updated: Goal[] = [];

  // Calculate consistency: workouts this week / 7 * 100
  if (consistencyGoals.length > 0) {
    const consistency = await computeWeeklyConsistency();
    for (const goal of consistencyGoals) {
      await insertGoalProgress(goal.id, consistency);
      const updatedGoal = await updateGoal(goal.id, { current_value: consistency });
      if (!updatedGoal) continue;

      if (isGoalComplete(updatedGoal) && updatedGoal.status === 'active') {
        await updateGoal(goal.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
        updatedGoal.status = 'completed';
        updatedGoal.completed_at = new Date().toISOString();
      }
      updated.push(updatedGoal);
    }
  }

  // Calculate streak
  if (streakGoals.length > 0) {
    const streak = await computeCurrentStreak();
    for (const goal of streakGoals) {
      await insertGoalProgress(goal.id, streak);
      const updatedGoal = await updateGoal(goal.id, { current_value: streak });
      if (!updatedGoal) continue;

      if (isGoalComplete(updatedGoal) && updatedGoal.status === 'active') {
        await updateGoal(goal.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
        updatedGoal.status = 'completed';
        updatedGoal.completed_at = new Date().toISOString();
      }
      updated.push(updatedGoal);
    }
  }

  return updated;
}

// ── Batch refresh: recalculate all active goals ─────────────────────────────

/**
 * Recalculate current_value for all active goals from latest data.
 * Useful for pull-to-refresh or app foreground.
 */
export async function refreshAllGoals(): Promise<Goal[]> {
  const activeGoals = await getGoals('active');
  const updated: Goal[] = [];

  for (const goal of activeGoals) {
    const latestValue = await getLatestValueForGoal(goal);
    if (latestValue === null) continue;
    if (latestValue === goal.current_value) continue;

    const updatedGoal = await updateGoal(goal.id, { current_value: latestValue });
    if (!updatedGoal) continue;

    if (isGoalComplete(updatedGoal) && updatedGoal.status === 'active') {
      await updateGoal(goal.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
      });
      updatedGoal.status = 'completed';
      updatedGoal.completed_at = new Date().toISOString();
    }

    updated.push(updatedGoal);
  }

  return updated;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function insertGoalProgress(goalId: string, value: number): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('goal_progress').insert({
    goal_id: goalId,
    value,
    recorded_at: new Date().toISOString(),
  });
  if (error) {
    console.error('Failed to insert goal progress:', error);
  }
}

async function getLatestValueForGoal(goal: Goal): Promise<number | null> {
  switch (goal.type) {
    case 'pain_reduction':
      return getLatestMetric('pain_level');
    case 'posture_score':
      return getLatestMetric('posture_score');
    case 'symmetry_improvement':
      return getLatestMetric('symmetry_score');
    case 'workout_consistency':
      return computeWeeklyConsistency();
    case 'workout_streak':
      return computeCurrentStreak();
    default:
      return null;
  }
}

async function getLatestMetric(metricName: string): Promise<number | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('metric_entries')
    .select('value')
    .eq('metric_name', metricName)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.value as number;
}

async function computeWeeklyConsistency(): Promise<number> {
  const supabase = getSupabase();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const { data, error } = await supabase
    .from('workouts')
    .select('id')
    .gte('started_at', oneWeekAgo.toISOString());

  if (error || !data) return 0;

  // Consistency as percentage of 7 days
  const uniqueDays = new Set(
    data.map((w: any) => new Date(w.started_at ?? w.id).toDateString()),
  );
  return Math.round((data.length / 7) * 100);
}

async function computeCurrentStreak(): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workouts')
    .select('started_at')
    .order('started_at', { ascending: false })
    .limit(90); // Check up to 90 days back

  if (error || !data || data.length === 0) return 0;

  // Build set of workout dates
  const workoutDates = new Set(
    data.map((w: any) => {
      const d = new Date(w.started_at);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );

  // Count consecutive days from today backwards
  let streak = 0;
  const today = new Date();
  const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  // Allow today or yesterday as the starting point
  const hasToday = workoutDates.has(dateKey(today));
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const hasYesterday = workoutDates.has(dateKey(yesterday));

  if (!hasToday && !hasYesterday) return 0;

  const startDate = hasToday ? today : yesterday;
  const checkDate = new Date(startDate);

  while (workoutDates.has(dateKey(checkDate))) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return streak;
}
