/**
 * goalSuggestions.ts — AI-powered goal suggestions based on user data (GL-007)
 *
 * Analyzes current metrics and workout history to suggest relevant,
 * achievable goals. Smart defaults make one-tap goal creation easy.
 */

import { getSupabase } from './supabase';
import {
  getGoals,
  type Goal,
  type GoalType,
  type GoalStatus,
  type CreateGoalInput,
} from './goals';

// ── Types ───────────────────────────────────────────────────────────────────

export interface GoalSuggestion {
  type: GoalType;
  title: string;
  description: string;
  reason: string; // Why we're suggesting this
  startingValue: number;
  targetValue: number;
  deadlineWeeks: number; // Suggested timeframe in weeks
  priority: number; // Lower = more important (1-10)
  icon: string; // Ionicons name for display
}

export interface UserMetrics {
  painLevel: number | null;
  postureScore: number | null;
  symmetryScore: number | null;
  workoutsThisWeek: number;
  currentStreak: number;
  avgPainLast7d: number | null;
  avgPostureLast7d: number | null;
  avgSymmetryLast7d: number | null;
  painTrend: 'improving' | 'stable' | 'worsening' | 'unknown';
  postureTrend: 'improving' | 'stable' | 'worsening' | 'unknown';
  symmetryTrend: 'improving' | 'stable' | 'worsening' | 'unknown';
  totalWorkouts30d: number;
  daysWithData: number;
}

// ── Thresholds ──────────────────────────────────────────────────────────────

const PAIN_CONCERN_THRESHOLD = 5; // Suggest pain reduction if above this
const SYMMETRY_CONCERN_THRESHOLD = 80; // Suggest symmetry if below this
const POSTURE_CONCERN_THRESHOLD = 70; // Suggest posture if below this
const CONSISTENCY_CONCERN_THRESHOLD = 70; // Suggest consistency if below this %
const STREAK_START_THRESHOLD = 3; // Suggest streak if current streak is low

const MAX_SUGGESTIONS = 3; // Don't overwhelm with suggestions

// ── Data Fetching ───────────────────────────────────────────────────────────

async function getLatestMetricValue(metricName: string): Promise<number | null> {
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

async function getMetricAverage(
  metricName: string,
  days: number,
): Promise<number | null> {
  const supabase = getSupabase();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('metric_entries')
    .select('value')
    .eq('metric_name', metricName)
    .gte('recorded_at', since.toISOString());

  if (error || !data || data.length === 0) return null;

  const values = data.map((d: { value: number }) => d.value);
  return values.reduce((a: number, b: number) => a + b, 0) / values.length;
}

async function getMetricTrend(
  metricName: string,
): Promise<'improving' | 'stable' | 'worsening' | 'unknown'> {
  const supabase = getSupabase();
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [firstWeek, secondWeek] = await Promise.all([
    supabase
      .from('metric_entries')
      .select('value')
      .eq('metric_name', metricName)
      .gte('recorded_at', twoWeeksAgo.toISOString())
      .lt('recorded_at', oneWeekAgo.toISOString()),
    supabase
      .from('metric_entries')
      .select('value')
      .eq('metric_name', metricName)
      .gte('recorded_at', oneWeekAgo.toISOString()),
  ]);

  if (
    firstWeek.error ||
    secondWeek.error ||
    !firstWeek.data?.length ||
    !secondWeek.data?.length
  ) {
    return 'unknown';
  }

  const avg = (arr: { value: number }[]) =>
    arr.reduce((sum, d) => sum + d.value, 0) / arr.length;
  const avgFirst = avg(firstWeek.data);
  const avgSecond = avg(secondWeek.data);
  const delta = avgSecond - avgFirst;

  // For pain: lower is better, so negative delta = improving
  if (metricName === 'pain_level') {
    if (delta < -0.5) return 'improving';
    if (delta > 0.5) return 'worsening';
    return 'stable';
  }

  // For posture/symmetry: higher is better
  if (delta > 2) return 'improving';
  if (delta < -2) return 'worsening';
  return 'stable';
}

async function getWorkoutsThisWeek(): Promise<number> {
  const supabase = getSupabase();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const { data, error } = await supabase
    .from('workouts')
    .select('id')
    .gte('started_at', oneWeekAgo.toISOString());

  if (error || !data) return 0;
  return data.length;
}

async function getWorkoutsLast30d(): Promise<number> {
  const supabase = getSupabase();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabase
    .from('workouts')
    .select('id')
    .gte('started_at', thirtyDaysAgo.toISOString());

  if (error || !data) return 0;
  return data.length;
}

async function getCurrentStreak(): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workouts')
    .select('started_at')
    .order('started_at', { ascending: false })
    .limit(90);

  if (error || !data || data.length === 0) return 0;

  const workoutDates = new Set(
    data.map((w: { started_at: string }) => {
      const d = new Date(w.started_at);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );

  let streak = 0;
  const today = new Date();
  const dateKey = (d: Date) =>
    `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

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

async function getDaysWithData(): Promise<number> {
  const supabase = getSupabase();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabase
    .from('metric_entries')
    .select('recorded_at')
    .gte('recorded_at', thirtyDaysAgo.toISOString());

  if (error || !data) return 0;

  const uniqueDays = new Set(
    data.map((d: { recorded_at: string }) => new Date(d.recorded_at).toDateString()),
  );
  return uniqueDays.size;
}

// ── Fetch All Metrics ───────────────────────────────────────────────────────

export async function fetchUserMetrics(): Promise<UserMetrics> {
  const [
    painLevel,
    postureScore,
    symmetryScore,
    avgPainLast7d,
    avgPostureLast7d,
    avgSymmetryLast7d,
    painTrend,
    postureTrend,
    symmetryTrend,
    workoutsThisWeek,
    currentStreak,
    totalWorkouts30d,
    daysWithData,
  ] = await Promise.all([
    getLatestMetricValue('pain_level'),
    getLatestMetricValue('posture_score'),
    getLatestMetricValue('symmetry_score'),
    getMetricAverage('pain_level', 7),
    getMetricAverage('posture_score', 7),
    getMetricAverage('symmetry_score', 7),
    getMetricTrend('pain_level'),
    getMetricTrend('posture_score'),
    getMetricTrend('symmetry_score'),
    getWorkoutsThisWeek(),
    getCurrentStreak(),
    getWorkoutsLast30d(),
    getDaysWithData(),
  ]);

  return {
    painLevel,
    postureScore,
    symmetryScore,
    avgPainLast7d,
    avgPostureLast7d,
    avgSymmetryLast7d,
    painTrend,
    postureTrend,
    symmetryTrend,
    workoutsThisWeek,
    currentStreak,
    totalWorkouts30d,
    daysWithData,
  };
}

// ── Suggestion Logic ────────────────────────────────────────────────────────

function suggestPainReduction(
  metrics: UserMetrics,
  activeGoalTypes: Set<GoalType>,
): GoalSuggestion | null {
  if (activeGoalTypes.has('pain_reduction')) return null;
  const pain = metrics.avgPainLast7d ?? metrics.painLevel;
  if (pain === null || pain <= PAIN_CONCERN_THRESHOLD) return null;

  // Target: cut pain in half (minimum 2)
  const target = Math.max(2, Math.round(pain / 2));

  // Timeframe based on how bad it is
  const weeks = pain >= 7 ? 12 : 8;

  return {
    type: 'pain_reduction',
    title: `Reduce pain to ${target}/10`,
    description: `Your average pain level is ${pain.toFixed(1)}. Let's work on bringing it down to ${target}.`,
    reason:
      metrics.painTrend === 'worsening'
        ? `Your pain has been getting worse recently — time to take action.`
        : `Your pain level of ${pain.toFixed(1)} is above average. Setting a concrete target helps focus your efforts.`,
    startingValue: Math.round(pain),
    targetValue: target,
    deadlineWeeks: weeks,
    priority: pain >= 7 ? 1 : 3,
    icon: 'heart-outline',
  };
}

function suggestSymmetryImprovement(
  metrics: UserMetrics,
  activeGoalTypes: Set<GoalType>,
): GoalSuggestion | null {
  if (activeGoalTypes.has('symmetry_improvement')) return null;
  const sym = metrics.avgSymmetryLast7d ?? metrics.symmetryScore;
  if (sym === null || sym >= SYMMETRY_CONCERN_THRESHOLD) return null;

  // Target: improve by 10-15 points (cap at 95)
  const gap = 100 - sym;
  const improvement = Math.min(gap, Math.max(10, Math.round(gap * 0.5)));
  const target = Math.min(95, Math.round(sym + improvement));

  return {
    type: 'symmetry_improvement',
    title: `Reach ${target}% symmetry`,
    description: `Your symmetry score is ${sym.toFixed(0)}%. Consistent corrective work can get you to ${target}%.`,
    reason:
      metrics.symmetryTrend === 'worsening'
        ? `Your symmetry has been declining — corrective exercises can reverse this.`
        : `Improving symmetry from ${sym.toFixed(0)}% to ${target}% will reduce compensations and injury risk.`,
    startingValue: Math.round(sym),
    targetValue: target,
    deadlineWeeks: 8,
    priority: sym < 60 ? 2 : 4,
    icon: 'git-compare-outline',
  };
}

function suggestPostureScore(
  metrics: UserMetrics,
  activeGoalTypes: Set<GoalType>,
): GoalSuggestion | null {
  if (activeGoalTypes.has('posture_score')) return null;
  const posture = metrics.avgPostureLast7d ?? metrics.postureScore;
  if (posture === null || posture >= POSTURE_CONCERN_THRESHOLD) return null;

  const gap = 100 - posture;
  const improvement = Math.min(gap, Math.max(10, Math.round(gap * 0.4)));
  const target = Math.min(90, Math.round(posture + improvement));

  return {
    type: 'posture_score',
    title: `Improve posture to ${target}/100`,
    description: `Your posture score is ${posture.toFixed(0)}. Small daily corrections can make a big difference.`,
    reason:
      metrics.postureTrend === 'worsening'
        ? `Your posture score has dropped recently. A goal will help you stay accountable.`
        : `Getting from ${posture.toFixed(0)} to ${target} is achievable with daily posture awareness.`,
    startingValue: Math.round(posture),
    targetValue: target,
    deadlineWeeks: 8,
    priority: posture < 50 ? 2 : 5,
    icon: 'body-outline',
  };
}

function suggestWorkoutConsistency(
  metrics: UserMetrics,
  activeGoalTypes: Set<GoalType>,
): GoalSuggestion | null {
  if (activeGoalTypes.has('workout_consistency')) return null;

  // Calculate current consistency as % (workouts per week / 7 * 100)
  const consistency = Math.round((metrics.workoutsThisWeek / 7) * 100);
  if (consistency >= CONSISTENCY_CONCERN_THRESHOLD) return null;

  // Need at least some data to suggest this
  if (metrics.daysWithData < 3 && metrics.totalWorkouts30d < 2) return null;

  // Target: realistic step up
  const target = Math.min(100, Math.max(consistency + 20, 70));

  return {
    type: 'workout_consistency',
    title: `Hit ${target}% weekly consistency`,
    description: `You did ${metrics.workoutsThisWeek} workouts this week. Let's build a sustainable habit.`,
    reason:
      metrics.workoutsThisWeek === 0
        ? `No workouts this week — a consistency goal can get you back on track.`
        : `You're working out ${metrics.workoutsThisWeek}x/week. Bumping to ${Math.ceil((target / 100) * 7)}x will accelerate your progress.`,
    startingValue: consistency,
    targetValue: target,
    deadlineWeeks: 4,
    priority: metrics.workoutsThisWeek === 0 ? 2 : 6,
    icon: 'calendar-outline',
  };
}

function suggestWorkoutStreak(
  metrics: UserMetrics,
  activeGoalTypes: Set<GoalType>,
): GoalSuggestion | null {
  if (activeGoalTypes.has('workout_streak')) return null;
  if (metrics.currentStreak > STREAK_START_THRESHOLD) return null;

  // Need some workout history to suggest this
  if (metrics.totalWorkouts30d < 3) return null;

  // Target: achievable streak based on current habits
  const weeklyAvg = metrics.totalWorkouts30d / 4;
  const target = weeklyAvg >= 3 ? 14 : 7;

  return {
    type: 'workout_streak',
    title: `Build a ${target}-day streak`,
    description: `Your current streak is ${metrics.currentStreak} days. Streaks build momentum.`,
    reason:
      metrics.currentStreak === 0
        ? `Starting a streak today is the hardest part — a goal makes it official.`
        : `You've got ${metrics.currentStreak} days going. Let's extend it to ${target} and lock in the habit.`,
    startingValue: metrics.currentStreak,
    targetValue: target,
    deadlineWeeks: target === 14 ? 4 : 2,
    priority: 7,
    icon: 'flame-outline',
  };
}

// ── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Analyze user metrics and active goals to generate smart suggestions.
 * Returns up to MAX_SUGGESTIONS sorted by priority.
 */
export async function suggestGoals(): Promise<GoalSuggestion[]> {
  const [metrics, activeGoals] = await Promise.all([
    fetchUserMetrics(),
    getGoals('active'),
  ]);

  const activeGoalTypes = new Set(activeGoals.map((g) => g.type));

  const allSuggestions: (GoalSuggestion | null)[] = [
    suggestPainReduction(metrics, activeGoalTypes),
    suggestSymmetryImprovement(metrics, activeGoalTypes),
    suggestPostureScore(metrics, activeGoalTypes),
    suggestWorkoutConsistency(metrics, activeGoalTypes),
    suggestWorkoutStreak(metrics, activeGoalTypes),
  ];

  return allSuggestions
    .filter((s): s is GoalSuggestion => s !== null)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Convert a suggestion into a CreateGoalInput for one-tap creation.
 */
export function suggestionToGoalInput(
  suggestion: GoalSuggestion,
): CreateGoalInput {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + suggestion.deadlineWeeks * 7);

  return {
    type: suggestion.type,
    title: suggestion.title,
    description: suggestion.description,
    target_value: suggestion.targetValue,
    starting_value: suggestion.startingValue,
    current_value: suggestion.startingValue,
    deadline: deadline.toISOString(),
    status: 'active',
  };
}
