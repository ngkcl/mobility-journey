import { format } from 'date-fns';
import type { Workout, WorkoutExercise, Exercise } from './types';

export type WorkoutHistoryItem = {
  workout: Workout;
  exercises: WorkoutExercise[];
};

export type ExportFormat = 'csv' | 'json';

/**
 * Build CSV string from workout history data.
 * Includes dates, exercises, sets/reps/weight, pain levels, and asymmetry data.
 */
export const buildWorkoutCSV = (
  history: WorkoutHistoryItem[],
  exerciseMap: Map<string, Exercise>,
): string => {
  const lines: string[] = [];
  
  // CSV Header
  lines.push([
    'Date',
    'Workout Type',
    'Duration (min)',
    'Pain Before',
    'Pain After',
    'Pain Change',
    'Energy Before',
    'Energy After',
    'Exercise',
    'Set #',
    'Side',
    'Reps',
    'Weight (kg)',
    'Duration (sec)',
    'RPE',
    'Volume (kg)',
    'Notes',
  ].join(','));

  // Sort by date ascending
  const sorted = [...history].sort(
    (a, b) => new Date(a.workout.date).getTime() - new Date(b.workout.date).getTime()
  );

  for (const item of sorted) {
    const { workout, exercises } = item;
    const dateStr = format(new Date(workout.date), 'yyyy-MM-dd');
    const painChange = 
      workout.pain_level_before != null && workout.pain_level_after != null
        ? workout.pain_level_after - workout.pain_level_before
        : '';

    // If no exercises, still output the workout row
    if (exercises.length === 0) {
      lines.push([
        dateStr,
        workout.type ?? '',
        workout.duration_minutes ?? '',
        workout.pain_level_before ?? '',
        workout.pain_level_after ?? '',
        painChange,
        workout.energy_level_before ?? '',
        workout.energy_level_after ?? '',
        '', '', '', '', '', '', '', '',
        escapeCSV(workout.notes ?? ''),
      ].join(','));
      continue;
    }

    for (const exercise of exercises) {
      const exerciseInfo = exercise.exercise_id 
        ? exerciseMap.get(exercise.exercise_id) 
        : null;
      const exerciseName = exerciseInfo?.name ?? `Exercise ${exercise.order_index + 1}`;
      
      const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
      
      if (sets.length === 0) {
        // Exercise with no sets
        lines.push([
          dateStr,
          workout.type ?? '',
          workout.duration_minutes ?? '',
          workout.pain_level_before ?? '',
          workout.pain_level_after ?? '',
          painChange,
          workout.energy_level_before ?? '',
          workout.energy_level_after ?? '',
          escapeCSV(exerciseName),
          '', '', '', '', '', '', '',
          escapeCSV(workout.notes ?? ''),
        ].join(','));
        continue;
      }

      sets.forEach((set, setIndex) => {
        const volume = 
          set.reps != null && set.weight_kg != null
            ? set.reps * set.weight_kg
            : '';
        
        lines.push([
          dateStr,
          workout.type ?? '',
          workout.duration_minutes ?? '',
          workout.pain_level_before ?? '',
          workout.pain_level_after ?? '',
          painChange,
          workout.energy_level_before ?? '',
          workout.energy_level_after ?? '',
          escapeCSV(exerciseName),
          setIndex + 1,
          set.side ?? 'bilateral',
          set.reps ?? '',
          set.weight_kg ?? '',
          set.duration_seconds ?? '',
          set.rpe ?? '',
          volume,
          escapeCSV(set.notes ?? ''),
        ].join(','));
      });
    }
  }

  return lines.join('\n');
};

/**
 * Build a summary statistics object for the workout history.
 */
export type WorkoutSummaryStats = {
  totalWorkouts: number;
  totalDuration: number;
  totalSets: number;
  totalReps: number;
  totalVolume: number;
  avgPainChange: number | null;
  workoutsByType: Record<string, number>;
  dateRange: { start: string; end: string } | null;
  leftVolumeTotal: number;
  rightVolumeTotal: number;
  asymmetryPct: number | null;
};

export const computeWorkoutSummary = (
  history: WorkoutHistoryItem[],
): WorkoutSummaryStats => {
  let totalDuration = 0;
  let totalSets = 0;
  let totalReps = 0;
  let totalVolume = 0;
  let leftVolume = 0;
  let rightVolume = 0;
  let painChanges: number[] = [];
  const workoutsByType: Record<string, number> = {};

  const dates = history
    .map(h => h.workout.date)
    .filter(Boolean)
    .sort();

  for (const item of history) {
    const { workout, exercises } = item;
    
    totalDuration += workout.duration_minutes ?? 0;
    
    const type = workout.type ?? 'other';
    workoutsByType[type] = (workoutsByType[type] ?? 0) + 1;
    
    if (workout.pain_level_before != null && workout.pain_level_after != null) {
      painChanges.push(workout.pain_level_after - workout.pain_level_before);
    }
    
    for (const exercise of exercises) {
      const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
      totalSets += sets.length;
      
      for (const set of sets) {
        const reps = set.reps ?? 0;
        const weight = set.weight_kg ?? 0;
        const volume = reps * weight;
        
        totalReps += reps;
        totalVolume += volume;
        
        if (set.side === 'left') {
          leftVolume += volume;
        } else if (set.side === 'right') {
          rightVolume += volume;
        }
      }
    }
  }

  const totalSideVolume = leftVolume + rightVolume;
  const asymmetryPct = totalSideVolume > 0
    ? Math.round(((leftVolume - rightVolume) / totalSideVolume) * 100)
    : null;

  return {
    totalWorkouts: history.length,
    totalDuration,
    totalSets,
    totalReps,
    totalVolume: Math.round(totalVolume),
    avgPainChange: painChanges.length > 0
      ? Math.round((painChanges.reduce((a, b) => a + b, 0) / painChanges.length) * 10) / 10
      : null,
    workoutsByType,
    dateRange: dates.length >= 2
      ? { start: dates[0], end: dates[dates.length - 1] }
      : dates.length === 1
      ? { start: dates[0], end: dates[0] }
      : null,
    leftVolumeTotal: Math.round(leftVolume),
    rightVolumeTotal: Math.round(rightVolume),
    asymmetryPct,
  };
};

/**
 * Build JSON export payload with all workout data and summary.
 */
export const buildWorkoutExportPayload = (
  history: WorkoutHistoryItem[],
  exerciseMap: Map<string, Exercise>,
) => {
  const summary = computeWorkoutSummary(history);
  
  const workouts = history.map(item => ({
    date: item.workout.date,
    type: item.workout.type,
    durationMinutes: item.workout.duration_minutes,
    painBefore: item.workout.pain_level_before,
    painAfter: item.workout.pain_level_after,
    energyBefore: item.workout.energy_level_before,
    energyAfter: item.workout.energy_level_after,
    notes: item.workout.notes,
    exercises: item.exercises.map(ex => {
      const info = ex.exercise_id ? exerciseMap.get(ex.exercise_id) : null;
      return {
        name: info?.name ?? `Exercise ${ex.order_index + 1}`,
        category: info?.category ?? null,
        sets: Array.isArray(ex.sets) ? ex.sets.map(s => ({
          side: s.side ?? 'bilateral',
          reps: s.reps,
          weightKg: s.weight_kg,
          durationSeconds: s.duration_seconds,
          rpe: s.rpe,
          notes: s.notes,
        })) : [],
      };
    }),
  }));

  return {
    exportedAt: new Date().toISOString(),
    summary,
    workouts,
  };
};

/**
 * Escape a string for CSV (wrap in quotes if contains comma, quote, or newline).
 */
function escapeCSV(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
