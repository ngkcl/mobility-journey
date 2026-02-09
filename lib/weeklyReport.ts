/**
 * Weekly Progress Report Generator
 * Aggregates workout, metrics, and photo data into comprehensive weekly summaries.
 */

import type {
  Workout,
  WorkoutExercise,
  WorkoutSet,
  WorkoutType,
  Photo,
  PhotoView,
} from './types';
import { getSupabase } from './supabase';

// ─── Types ────────────────────────────────────────────

export type TrendDirection = 'improving' | 'stable' | 'declining';
export type StreakStatus = 'building' | 'maintained' | 'broken' | 'new';
export type InsightType = 'achievement' | 'warning' | 'tip';

export interface Insight {
  id: string;
  type: InsightType;
  icon: string;
  title: string;
  description: string;
  action?: {
    label: string;
    route: string;
  };
}

export interface WorkoutSummary {
  totalSessions: number;
  correctiveSessions: number;
  gymSessions: number;
  totalVolume: number;
  leftVolume: number;
  rightVolume: number;
  asymmetryPct: number;
  asymmetryChange: number | null; // vs previous week
  consistencyPct: number; // % of expected sessions completed
  streakDays: number;
  streakStatus: StreakStatus;
}

export interface MetricsSummary {
  avgPainLevel: number | null;
  painTrend: TrendDirection;
  avgPostureScore: number | null;
  postureTrend: TrendDirection;
  avgEnergyLevel: number | null;
  avgSymmetryScore: number | null;
  metricsLogged: number;
}

export interface PhotoSummary {
  photosThisWeek: number;
  earliestPhotoUrl: string | null;
  latestPhotoUrl: string | null;
  hasComparisonPair: boolean;
  viewsCaptured: PhotoView[];
}

export interface WeeklyReport {
  weekStart: string; // ISO date
  weekEnd: string; // ISO date
  workoutSummary: WorkoutSummary;
  metricsSummary: MetricsSummary;
  photoSummary: PhotoSummary;
  insights: Insight[];
  overallScore: number; // 1-100
  previousWeekScore: number | null;
  generatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekBounds = (weekStart: Date): { start: string; end: string } => {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

const getPreviousWeekStart = (weekStart: Date): Date => {
  const prev = new Date(weekStart);
  prev.setDate(prev.getDate() - 7);
  return prev;
};

const computeAsymmetryPct = (left: number, right: number): number => {
  const total = left + right;
  if (total === 0) return 0;
  const diff = Math.abs(left - right);
  return Math.round((diff / total) * 100);
};

const determineTrend = (
  current: number | null,
  previous: number | null,
  lowerIsBetter: boolean = false
): TrendDirection => {
  if (current === null || previous === null) return 'stable';
  const diff = current - previous;
  const threshold = 0.5; // Minimum change to count as improving/declining
  if (Math.abs(diff) < threshold) return 'stable';
  if (lowerIsBetter) {
    return diff < 0 ? 'improving' : 'declining';
  }
  return diff > 0 ? 'improving' : 'declining';
};

// ─── Data Fetching ────────────────────────────────────────────

interface WorkoutWithExercises {
  workout: Workout;
  exercises: WorkoutExercise[];
}

async function fetchWorkoutsForWeek(
  weekStart: string,
  weekEnd: string
): Promise<WorkoutWithExercises[]> {
  const supabase = getSupabase();

  const { data: workouts, error } = await supabase
    .from('workouts')
    .select('*')
    .gte('date', weekStart.split('T')[0])
    .lte('date', weekEnd.split('T')[0])
    .order('date', { ascending: true });

  if (error || !workouts) return [];

  const results: WorkoutWithExercises[] = [];

  for (const workout of workouts) {
    const { data: exercises } = await supabase
      .from('workout_exercises')
      .select('*')
      .eq('workout_id', workout.id);

    results.push({
      workout: workout as Workout,
      exercises: (exercises ?? []) as WorkoutExercise[],
    });
  }

  return results;
}

interface MetricEntry {
  id: string;
  date: string;
  pain_level: number | null;
  posture_score: number | null;
  energy_level: number | null;
  symmetry_score: number | null;
}

async function fetchMetricsForWeek(
  weekStart: string,
  weekEnd: string
): Promise<MetricEntry[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('daily_metrics')
    .select('id, date, pain_level, posture_score, energy_level, symmetry_score')
    .gte('date', weekStart.split('T')[0])
    .lte('date', weekEnd.split('T')[0])
    .order('date', { ascending: true });

  if (error || !data) return [];
  return data as MetricEntry[];
}

async function fetchPhotosForWeek(
  weekStart: string,
  weekEnd: string
): Promise<Photo[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('photos')
    .select('id, taken_at, view, public_url, storage_path, notes')
    .gte('taken_at', weekStart)
    .lte('taken_at', weekEnd)
    .order('taken_at', { ascending: true });

  if (error || !data) return [];
  return data as Photo[];
}

// ─── Summary Builders ────────────────────────────────────────────

function buildWorkoutSummary(
  workouts: WorkoutWithExercises[],
  previousWeekWorkouts: WorkoutWithExercises[]
): WorkoutSummary {
  let totalVolume = 0;
  let leftVolume = 0;
  let rightVolume = 0;
  let correctiveSessions = 0;
  let gymSessions = 0;
  const workoutDates = new Set<string>();

  for (const { workout, exercises } of workouts) {
    workoutDates.add(workout.date.split('T')[0]);
    
    if (workout.type === 'corrective') {
      correctiveSessions++;
    } else if (workout.type === 'gym') {
      gymSessions++;
    }

    for (const exercise of exercises) {
      const sets: WorkoutSet[] = Array.isArray(exercise.sets) ? exercise.sets : [];
      for (const set of sets) {
        const reps = typeof set.reps === 'number' ? set.reps : 0;
        const weight = typeof set.weight_kg === 'number' ? set.weight_kg : 0;
        const volume = reps * weight;
        totalVolume += volume;

        if (set.side === 'left') {
          leftVolume += volume;
        } else if (set.side === 'right') {
          rightVolume += volume;
        } else {
          // Bilateral - split evenly
          leftVolume += volume / 2;
          rightVolume += volume / 2;
        }
      }
    }
  }

  // Calculate previous week asymmetry for comparison
  let prevLeftVolume = 0;
  let prevRightVolume = 0;
  for (const { exercises } of previousWeekWorkouts) {
    for (const exercise of exercises) {
      const sets: WorkoutSet[] = Array.isArray(exercise.sets) ? exercise.sets : [];
      for (const set of sets) {
        const reps = typeof set.reps === 'number' ? set.reps : 0;
        const weight = typeof set.weight_kg === 'number' ? set.weight_kg : 0;
        const volume = reps * weight;
        if (set.side === 'left') {
          prevLeftVolume += volume;
        } else if (set.side === 'right') {
          prevRightVolume += volume;
        } else {
          prevLeftVolume += volume / 2;
          prevRightVolume += volume / 2;
        }
      }
    }
  }

  const asymmetryPct = computeAsymmetryPct(leftVolume, rightVolume);
  const prevAsymmetryPct = computeAsymmetryPct(prevLeftVolume, prevRightVolume);
  const asymmetryChange = previousWeekWorkouts.length > 0 
    ? asymmetryPct - prevAsymmetryPct 
    : null;

  // Expected: 21 corrective sessions (3 per day) + 2-4 gym sessions
  const expectedSessions = 21; // Focus on corrective compliance
  const consistencyPct = Math.min(100, Math.round((correctiveSessions / expectedSessions) * 100));

  // Streak calculation (simplified - just count consecutive workout days from end of week)
  const sortedDates = Array.from(workoutDates).sort().reverse();
  let streakDays = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  
  for (const dateStr of sortedDates) {
    const workoutDate = new Date(dateStr + 'T00:00:00');
    const daysDiff = Math.floor((currentDate.getTime() - workoutDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff === streakDays || daysDiff === streakDays + 1) {
      streakDays++;
      currentDate = workoutDate;
    } else {
      break;
    }
  }

  const prevStreakDays = previousWeekWorkouts.length > 0 ? Math.min(7, new Set(
    previousWeekWorkouts.map(w => w.workout.date.split('T')[0])
  ).size) : 0;

  let streakStatus: StreakStatus = 'new';
  if (streakDays > prevStreakDays) {
    streakStatus = 'building';
  } else if (streakDays === prevStreakDays && streakDays > 0) {
    streakStatus = 'maintained';
  } else if (streakDays < prevStreakDays) {
    streakStatus = 'broken';
  }

  return {
    totalSessions: workouts.length,
    correctiveSessions,
    gymSessions,
    totalVolume: Math.round(totalVolume),
    leftVolume: Math.round(leftVolume),
    rightVolume: Math.round(rightVolume),
    asymmetryPct,
    asymmetryChange,
    consistencyPct,
    streakDays,
    streakStatus,
  };
}

function buildMetricsSummary(
  metrics: MetricEntry[],
  previousMetrics: MetricEntry[]
): MetricsSummary {
  if (metrics.length === 0) {
    return {
      avgPainLevel: null,
      painTrend: 'stable',
      avgPostureScore: null,
      postureTrend: 'stable',
      avgEnergyLevel: null,
      avgSymmetryScore: null,
      metricsLogged: 0,
    };
  }

  const painLevels = metrics.filter(m => m.pain_level !== null).map(m => m.pain_level!);
  const postureScores = metrics.filter(m => m.posture_score !== null).map(m => m.posture_score!);
  const energyLevels = metrics.filter(m => m.energy_level !== null).map(m => m.energy_level!);
  const symmetryScores = metrics.filter(m => m.symmetry_score !== null).map(m => m.symmetry_score!);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const avgPainLevel = avg(painLevels);
  const avgPostureScore = avg(postureScores);
  const avgEnergyLevel = avg(energyLevels);
  const avgSymmetryScore = avg(symmetryScores);

  // Calculate previous week averages for trends
  const prevPainLevels = previousMetrics.filter(m => m.pain_level !== null).map(m => m.pain_level!);
  const prevPostureScores = previousMetrics.filter(m => m.posture_score !== null).map(m => m.posture_score!);
  
  const prevAvgPain = avg(prevPainLevels);
  const prevAvgPosture = avg(prevPostureScores);

  return {
    avgPainLevel: avgPainLevel !== null ? Math.round(avgPainLevel * 10) / 10 : null,
    painTrend: determineTrend(avgPainLevel, prevAvgPain, true), // Lower pain is better
    avgPostureScore: avgPostureScore !== null ? Math.round(avgPostureScore * 10) / 10 : null,
    postureTrend: determineTrend(avgPostureScore, prevAvgPosture, false), // Higher posture is better
    avgEnergyLevel: avgEnergyLevel !== null ? Math.round(avgEnergyLevel * 10) / 10 : null,
    avgSymmetryScore: avgSymmetryScore !== null ? Math.round(avgSymmetryScore * 10) / 10 : null,
    metricsLogged: metrics.length,
  };
}

function buildPhotoSummary(photos: Photo[]): PhotoSummary {
  if (photos.length === 0) {
    return {
      photosThisWeek: 0,
      earliestPhotoUrl: null,
      latestPhotoUrl: null,
      hasComparisonPair: false,
      viewsCaptured: [],
    };
  }

  const sortedPhotos = [...photos].sort(
    (a, b) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime()
  );

  const viewsCaptured = [...new Set(photos.map(p => p.view))] as PhotoView[];
  
  // For comparison, we want photos from different days
  const photosByDay = new Map<string, Photo>();
  for (const photo of sortedPhotos) {
    const day = photo.taken_at.split('T')[0];
    if (!photosByDay.has(day)) {
      photosByDay.set(day, photo);
    }
  }

  const uniqueDays = Array.from(photosByDay.keys()).sort();
  const hasComparisonPair = uniqueDays.length >= 2;

  return {
    photosThisWeek: photos.length,
    earliestPhotoUrl: sortedPhotos[0]?.public_url ?? null,
    latestPhotoUrl: sortedPhotos[sortedPhotos.length - 1]?.public_url ?? null,
    hasComparisonPair,
    viewsCaptured,
  };
}

// ─── Overall Score ────────────────────────────────────────────

function computeOverallScore(
  workout: WorkoutSummary,
  metrics: MetricsSummary
): number {
  let score = 50; // Base score

  // Consistency bonus (up to 30 points)
  score += Math.round(workout.consistencyPct * 0.3);

  // Asymmetry improvement bonus (up to 10 points)
  if (workout.asymmetryChange !== null && workout.asymmetryChange < 0) {
    score += Math.min(10, Math.abs(workout.asymmetryChange));
  }

  // Pain reduction bonus (up to 10 points)
  if (metrics.painTrend === 'improving') {
    score += 10;
  } else if (metrics.painTrend === 'declining') {
    score -= 5;
  }

  // Posture improvement bonus (up to 10 points)
  if (metrics.postureTrend === 'improving') {
    score += 10;
  }

  // Streak bonus (up to 10 points)
  if (workout.streakStatus === 'building') {
    score += 10;
  } else if (workout.streakStatus === 'maintained') {
    score += 5;
  } else if (workout.streakStatus === 'broken') {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

// ─── Main Generator ────────────────────────────────────────────

export async function generateWeeklyReport(weekStart: Date): Promise<WeeklyReport> {
  const bounds = getWeekBounds(weekStart);
  const prevWeekStart = getPreviousWeekStart(weekStart);
  const prevBounds = getWeekBounds(prevWeekStart);

  // Fetch all data
  const [workouts, previousWorkouts, metrics, previousMetrics, photos] = await Promise.all([
    fetchWorkoutsForWeek(bounds.start, bounds.end),
    fetchWorkoutsForWeek(prevBounds.start, prevBounds.end),
    fetchMetricsForWeek(bounds.start, bounds.end),
    fetchMetricsForWeek(prevBounds.start, prevBounds.end),
    fetchPhotosForWeek(bounds.start, bounds.end),
  ]);

  // Build summaries
  const workoutSummary = buildWorkoutSummary(workouts, previousWorkouts);
  const metricsSummary = buildMetricsSummary(metrics, previousMetrics);
  const photoSummary = buildPhotoSummary(photos);

  // Calculate scores
  const overallScore = computeOverallScore(workoutSummary, metricsSummary);
  
  // Get previous week's report for score comparison
  const supabase = getSupabase();
  const { data: prevReport } = await supabase
    .from('weekly_reports')
    .select('report_json')
    .eq('week_start', formatDateKey(prevWeekStart))
    .single();

  const previousWeekScore = prevReport?.report_json?.overallScore ?? null;

  // Generate insights (imported from separate module)
  const { generateInsights } = await import('./reportInsights');
  const insights = generateInsights(
    workoutSummary,
    metricsSummary,
    photoSummary,
    previousWorkouts.length > 0
  );

  return {
    weekStart: formatDateKey(weekStart),
    weekEnd: formatDateKey(new Date(bounds.end)),
    workoutSummary,
    metricsSummary,
    photoSummary,
    insights,
    overallScore,
    previousWeekScore,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Export Utilities ────────────────────────────────────────────

export function formatReportForSharing(report: WeeklyReport): string {
  const { workoutSummary, metricsSummary, overallScore } = report;
  
  const parts: string[] = [
    `📊 Weekly Progress Report`,
    `Week of ${report.weekStart}`,
    ``,
    `🏋️ Workouts: ${workoutSummary.totalSessions} sessions`,
    `   • Corrective: ${workoutSummary.correctiveSessions}`,
    `   • Gym: ${workoutSummary.gymSessions}`,
    `   • Consistency: ${workoutSummary.consistencyPct}%`,
  ];

  if (workoutSummary.asymmetryChange !== null) {
    const direction = workoutSummary.asymmetryChange < 0 ? '↓' : '↑';
    parts.push(`   • Asymmetry: ${workoutSummary.asymmetryPct}% (${direction}${Math.abs(workoutSummary.asymmetryChange)}%)`);
  }

  parts.push(``);

  if (metricsSummary.avgPainLevel !== null) {
    const painIcon = metricsSummary.painTrend === 'improving' ? '📉' : metricsSummary.painTrend === 'declining' ? '📈' : '➡️';
    parts.push(`${painIcon} Pain: ${metricsSummary.avgPainLevel}/10`);
  }

  if (metricsSummary.avgPostureScore !== null) {
    const postureIcon = metricsSummary.postureTrend === 'improving' ? '📈' : metricsSummary.postureTrend === 'declining' ? '📉' : '➡️';
    parts.push(`${postureIcon} Posture: ${metricsSummary.avgPostureScore}/10`);
  }

  parts.push(``);
  parts.push(`🎯 Overall Score: ${overallScore}/100`);

  return parts.join('\n');
}
