/**
 * profileStats.ts — Aggregated user statistics for the Profile screen.
 *
 * Pulls data from workouts, goals, badges, metrics, and photos to build
 * a comprehensive overview of the user's journey.
 */

import { getSupabase } from './supabase';
import { getBadges, type Badge } from './badges';
import { getGoals, type Goal } from './goals';
import { computeStreakStats, type StreakStats, type WorkoutHistoryItem } from './workoutAnalytics';
import type { Workout, WorkoutExercise, MetricEntry } from './types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProfileStats {
  // Journey overview
  daysSinceStart: number;
  firstActivityDate: string | null;

  // Workout stats
  totalWorkouts: number;
  totalWorkoutMinutes: number;
  totalSetsCompleted: number;
  streakStats: StreakStats;

  // Goal stats
  activeGoals: number;
  completedGoals: number;
  totalGoals: number;

  // Badge stats
  badges: Badge[];
  totalBadgesEarned: number;
  totalBadgesAvailable: number;

  // Metric stats
  totalCheckIns: number;
  latestPainLevel: number | null;
  latestPostureScore: number | null;
  latestSymmetryScore: number | null;

  // Photo stats
  totalPhotos: number;

  // Milestone timeline
  milestones: Milestone[];
}

export interface Milestone {
  date: string;
  icon: string;
  title: string;
  subtitle: string;
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchWorkoutData(): Promise<{
  workouts: Workout[];
  historyItems: WorkoutHistoryItem[];
  totalSets: number;
}> {
  const supabase = getSupabase();

  const { data: workoutRows } = await supabase
    .from('workouts')
    .select('*')
    .order('date', { ascending: true });

  const workouts: Workout[] = (workoutRows ?? []) as Workout[];

  let totalSets = 0;
  const historyItems: WorkoutHistoryItem[] = [];

  for (const w of workouts) {
    const { data: exRows } = await supabase
      .from('workout_exercises')
      .select('*')
      .eq('workout_id', w.id);

    const exercises: WorkoutExercise[] = (exRows ?? []).map((e: any) => ({
      id: e.id,
      workout_id: e.workout_id,
      exercise_id: e.exercise_id ?? null,
      order_index: e.order_index ?? 0,
      sets: Array.isArray(e.sets) ? e.sets : [],
    }));

    for (const ex of exercises) {
      totalSets += ex.sets.length;
    }

    historyItems.push({ workout: w, exercises });
  }

  return { workouts, historyItems, totalSets };
}

async function fetchMetricData(): Promise<{
  entries: MetricEntry[];
  latest: MetricEntry | null;
}> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('metric_entries')
    .select('*')
    .order('entry_date', { ascending: false });

  const entries = (data ?? []) as MetricEntry[];
  return {
    entries,
    latest: entries.length > 0 ? entries[0] : null,
  };
}

async function fetchPhotoCount(): Promise<number> {
  const supabase = getSupabase();
  const { count } = await supabase
    .from('photos')
    .select('id', { count: 'exact', head: true });

  return count ?? 0;
}

// ── Milestone Generation ─────────────────────────────────────────────────────

function buildMilestones(
  workouts: Workout[],
  goals: Goal[],
  badges: Badge[],
  metricEntries: MetricEntry[],
  photoCount: number,
): Milestone[] {
  const milestones: Milestone[] = [];

  // First workout
  if (workouts.length > 0) {
    milestones.push({
      date: workouts[0].date,
      icon: '🏋️',
      title: 'First Workout',
      subtitle: 'Started the journey',
    });
  }

  // First check-in
  if (metricEntries.length > 0) {
    const oldest = metricEntries[metricEntries.length - 1];
    milestones.push({
      date: oldest.entry_date,
      icon: '📊',
      title: 'First Check-in',
      subtitle: 'Started tracking metrics',
    });
  }

  // Workout count milestones
  const workoutMilestones = [10, 25, 50, 100, 250, 500];
  for (const count of workoutMilestones) {
    if (workouts.length >= count) {
      const milestone = workouts[count - 1];
      milestones.push({
        date: milestone.date,
        icon: count >= 100 ? '🏆' : '💪',
        title: `${count} Workouts`,
        subtitle: `Completed ${count} workout sessions`,
      });
    }
  }

  // First goal completed
  const completedGoals = goals
    .filter((g) => g.status === 'completed' && g.completed_at)
    .sort((a, b) => new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime());

  if (completedGoals.length > 0) {
    milestones.push({
      date: completedGoals[0].completed_at!,
      icon: '🎯',
      title: 'First Goal Completed',
      subtitle: completedGoals[0].title,
    });
  }

  // First badge earned
  if (badges.length > 0) {
    const oldestBadge = [...badges].sort(
      (a, b) => new Date(a.earned_at).getTime() - new Date(b.earned_at).getTime(),
    );
    milestones.push({
      date: oldestBadge[0].earned_at,
      icon: oldestBadge[0].icon,
      title: 'First Badge',
      subtitle: oldestBadge[0].title,
    });
  }

  // First photo
  if (photoCount > 0) {
    milestones.push({
      date: new Date().toISOString(), // approximate
      icon: '📸',
      title: 'Photo Tracking',
      subtitle: `${photoCount} progress photos taken`,
    });
  }

  // Sort by date, newest first
  milestones.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return milestones;
}

// ── Main Loader ──────────────────────────────────────────────────────────────

export async function loadProfileStats(): Promise<ProfileStats> {
  const [
    { workouts, historyItems, totalSets },
    goals,
    badges,
    { entries: metricEntries, latest: latestMetric },
    photoCount,
  ] = await Promise.all([
    fetchWorkoutData(),
    getGoals(),
    getBadges(),
    fetchMetricData(),
    fetchPhotoCount(),
  ]);

  // Compute streak stats
  const streakStats = computeStreakStats(historyItems);

  // Days since first activity
  const dates: Date[] = [];
  if (workouts.length > 0) dates.push(new Date(workouts[0].date));
  if (metricEntries.length > 0) dates.push(new Date(metricEntries[metricEntries.length - 1].entry_date));

  let daysSinceStart = 0;
  let firstActivityDate: string | null = null;
  if (dates.length > 0) {
    const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
    firstActivityDate = earliest.toISOString();
    daysSinceStart = Math.floor(
      (Date.now() - earliest.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  // Workout minutes
  const totalWorkoutMinutes = workouts.reduce(
    (sum, w) => sum + (w.duration_minutes ?? 0),
    0,
  );

  // Goal counts
  const activeGoals = goals.filter((g) => g.status === 'active').length;
  const completedGoals = goals.filter((g) => g.status === 'completed').length;

  // Build milestones
  const milestones = buildMilestones(workouts, goals, badges, metricEntries, photoCount);

  return {
    daysSinceStart,
    firstActivityDate,

    totalWorkouts: workouts.length,
    totalWorkoutMinutes,
    totalSetsCompleted: totalSets,
    streakStats,

    activeGoals,
    completedGoals,
    totalGoals: goals.length,

    badges,
    totalBadgesEarned: badges.length,
    totalBadgesAvailable: 7, // from BADGE_DEFINITIONS

    totalCheckIns: metricEntries.length,
    latestPainLevel: latestMetric?.pain_level ?? null,
    latestPostureScore: latestMetric?.posture_score ?? null,
    latestSymmetryScore: latestMetric?.symmetry_score ?? null,

    totalPhotos: photoCount,

    milestones,
  };
}
