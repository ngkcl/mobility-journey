import type { Workout, WorkoutExercise, WorkoutSet, WorkoutSetSide, WorkoutType } from './types';

const normalizeSide = (side?: WorkoutSetSide | null): WorkoutSetSide | null => {
  if (!side) return null;
  if (side === 'left' || side === 'right' || side === 'bilateral') return side;
  return null;
};

const computeSetVolume = (set: WorkoutSet): number => {
  if (set.reps == null || set.weight_kg == null) return 0;
  if (!Number.isFinite(set.reps) || !Number.isFinite(set.weight_kg)) return 0;
  return Math.max(0, set.reps) * Math.max(0, set.weight_kg);
};

export type WorkoutHistoryItem = {
  workout: Workout;
  exercises: WorkoutExercise[];
};

export type WeeklyConsistencyPoint = {
  weekStart: string;
  sessions: number;
  completionPct: number;
};

export type WorkoutVolumePoint = {
  weekStart: string;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
};

export type ExerciseWeightPoint = {
  date: string;
  weightKg: number;
};

export type SideVolumePoint = {
  weekStart: string;
  leftVolumeKg: number;
  rightVolumeKg: number;
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekStart = (date: Date) => {
  const weekStart = new Date(date);
  const day = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - day);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

const parseDate = (value: string) => {
  const trimmed = value.trim();
  const date = new Date(trimmed.length <= 10 ? `${trimmed}T00:00:00` : trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const getWorkoutDateKey = (workout: Workout) => {
  const date = parseDate(workout.date);
  if (!date) return null;
  return formatDateKey(date);
};

const getWorkoutWeekKey = (workout: Workout) => {
  const date = parseDate(workout.date);
  if (!date) return null;
  return formatDateKey(getWeekStart(date));
};

const collectSets = (exercises: WorkoutExercise[]) => {
  const sets: WorkoutSet[] = [];
  exercises.forEach((exercise) => {
    if (Array.isArray(exercise.sets)) {
      sets.push(...exercise.sets);
    }
  });
  return sets;
};

export const buildWeeklyConsistency = (history: WorkoutHistoryItem[]): WeeklyConsistencyPoint[] => {
  const buckets = new Map<string, number>();

  history.forEach((item) => {
    if (item.workout.type !== 'corrective') return;
    const weekKey = getWorkoutWeekKey(item.workout);
    if (!weekKey) return;
    buckets.set(weekKey, (buckets.get(weekKey) ?? 0) + 1);
  });

  return Array.from(buckets.entries())
    .map(([weekStart, sessions]) => ({
      weekStart,
      sessions,
      completionPct: Math.round((sessions / 21) * 100),
    }))
    .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime());
};

export const computeWorkoutStreak = (history: WorkoutHistoryItem[]) => {
  const dates = Array.from(
    new Set(
      history
        .map((item) => getWorkoutDateKey(item.workout))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  if (dates.length === 0) {
    return 0;
  }

  let streak = 1;
  for (let i = 1; i < dates.length; i += 1) {
    const current = parseDate(dates[i - 1]);
    const next = parseDate(dates[i]);
    if (!current || !next) break;
    const diffDays = Math.round((current.getTime() - next.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
};

export const buildWeeklyWorkoutVolume = (history: WorkoutHistoryItem[]): WorkoutVolumePoint[] => {
  const buckets = new Map<string, WorkoutVolumePoint>();

  history.forEach((item) => {
    const weekKey = getWorkoutWeekKey(item.workout);
    if (!weekKey) return;
    const existing =
      buckets.get(weekKey) ?? {
        weekStart: weekKey,
        totalVolumeKg: 0,
        totalSets: 0,
        totalReps: 0,
      };

    const sets = collectSets(item.exercises);
    sets.forEach((set) => {
      existing.totalSets += 1;
      if (set.reps != null && Number.isFinite(set.reps)) {
        existing.totalReps += Math.max(0, set.reps);
      }
      existing.totalVolumeKg += computeSetVolume(set);
    });

    buckets.set(weekKey, existing);
  });

  return Array.from(buckets.values()).sort(
    (a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime(),
  );
};

export const buildExerciseWeightTrend = (
  history: WorkoutHistoryItem[],
  exerciseId: string,
): ExerciseWeightPoint[] => {
  const buckets = new Map<string, number>();

  history.forEach((item) => {
    const dateKey = getWorkoutDateKey(item.workout);
    if (!dateKey) return;
    item.exercises.forEach((exercise) => {
      if (exercise.exercise_id !== exerciseId) return;
      if (!Array.isArray(exercise.sets)) return;
      exercise.sets.forEach((set) => {
        if (set.weight_kg == null || !Number.isFinite(set.weight_kg)) return;
        const current = buckets.get(dateKey) ?? 0;
        buckets.set(dateKey, Math.max(current, set.weight_kg));
      });
    });
  });

  return Array.from(buckets.entries())
    .map(([date, weightKg]) => ({ date, weightKg }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const buildSideVolumeTrend = (
  history: WorkoutHistoryItem[],
  exerciseId: string,
): SideVolumePoint[] => {
  const buckets = new Map<string, SideVolumePoint>();

  history.forEach((item) => {
    const weekKey = getWorkoutWeekKey(item.workout);
    if (!weekKey) return;
    item.exercises.forEach((exercise) => {
      if (exercise.exercise_id !== exerciseId) return;
      if (!Array.isArray(exercise.sets)) return;
      const existing =
        buckets.get(weekKey) ?? {
          weekStart: weekKey,
          leftVolumeKg: 0,
          rightVolumeKg: 0,
        };

      exercise.sets.forEach((set) => {
        const side = normalizeSide(set.side);
        const volume = computeSetVolume(set);
        if (side === 'left') {
          existing.leftVolumeKg += volume;
        } else if (side === 'right') {
          existing.rightVolumeKg += volume;
        }
      });

      buckets.set(weekKey, existing);
    });
  });

  return Array.from(buckets.values()).sort(
    (a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime(),
  );
};

// ─── Asymmetry Analysis ────────────────────────────────────────────────────────

export type AsymmetryTrendPoint = {
  weekStart: string;
  leftVolumeKg: number;
  rightVolumeKg: number;
  imbalancePct: number; // Positive = left bias, Negative = right bias
  totalVolumeKg: number;
};

export type AsymmetrySummary = {
  currentImbalancePct: number;
  trendDirection: 'improving' | 'worsening' | 'stable';
  weeklyTrend: AsymmetryTrendPoint[];
  dominantSide: 'left' | 'right' | 'balanced';
  avgImbalanceLast4Weeks: number;
  avgImbalancePrior4Weeks: number;
};

/**
 * Build asymmetry trend across ALL side-specific exercises.
 * This gives a holistic view of left/right balance improvement.
 */
export const buildOverallAsymmetryTrend = (
  history: WorkoutHistoryItem[],
): AsymmetryTrendPoint[] => {
  const buckets = new Map<string, { left: number; right: number }>();

  history.forEach((item) => {
    const weekKey = getWorkoutWeekKey(item.workout);
    if (!weekKey) return;
    
    const existing = buckets.get(weekKey) ?? { left: 0, right: 0 };

    item.exercises.forEach((exercise) => {
      if (!Array.isArray(exercise.sets)) return;
      exercise.sets.forEach((set) => {
        const side = normalizeSide(set.side);
        const volume = computeSetVolume(set);
        if (side === 'left') {
          existing.left += volume;
        } else if (side === 'right') {
          existing.right += volume;
        }
      });
    });

    buckets.set(weekKey, existing);
  });

  return Array.from(buckets.entries())
    .map(([weekStart, { left, right }]) => {
      const total = left + right;
      const imbalancePct = total > 0 
        ? Math.round(((left - right) / total) * 100)
        : 0;
      return {
        weekStart,
        leftVolumeKg: Math.round(left * 10) / 10,
        rightVolumeKg: Math.round(right * 10) / 10,
        imbalancePct,
        totalVolumeKg: Math.round(total * 10) / 10,
      };
    })
    .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime());
};

/**
 * Compute asymmetry summary with trend analysis.
 * Useful for showing if the user is improving their balance over time.
 */
export const computeAsymmetrySummary = (
  history: WorkoutHistoryItem[],
): AsymmetrySummary | null => {
  const trend = buildOverallAsymmetryTrend(history);
  
  if (trend.length === 0) {
    return null;
  }

  const current = trend[trend.length - 1];
  
  // Calculate averages for last 4 weeks and prior 4 weeks
  const last4 = trend.slice(-4);
  const prior4 = trend.slice(-8, -4);

  const avgLast4 = last4.length > 0
    ? last4.reduce((sum, p) => sum + Math.abs(p.imbalancePct), 0) / last4.length
    : 0;
  
  const avgPrior4 = prior4.length > 0
    ? prior4.reduce((sum, p) => sum + Math.abs(p.imbalancePct), 0) / prior4.length
    : avgLast4; // If no prior data, use current as baseline

  // Determine trend direction
  let trendDirection: 'improving' | 'worsening' | 'stable';
  const improvement = avgPrior4 - avgLast4;
  if (improvement > 3) {
    trendDirection = 'improving';
  } else if (improvement < -3) {
    trendDirection = 'worsening';
  } else {
    trendDirection = 'stable';
  }

  // Determine dominant side
  let dominantSide: 'left' | 'right' | 'balanced';
  if (Math.abs(current.imbalancePct) <= 5) {
    dominantSide = 'balanced';
  } else if (current.imbalancePct > 0) {
    dominantSide = 'left';
  } else {
    dominantSide = 'right';
  }

  return {
    currentImbalancePct: current.imbalancePct,
    trendDirection,
    weeklyTrend: trend,
    dominantSide,
    avgImbalanceLast4Weeks: Math.round(avgLast4),
    avgImbalancePrior4Weeks: Math.round(avgPrior4),
  };
};

// ─── Pain & Energy Correlation ─────────────────────────────────────────────────

export type WorkoutPainPoint = {
  date: string;
  painBefore: number | null;
  painAfter: number | null;
  energyBefore: number | null;
  energyAfter: number | null;
  durationMinutes: number;
  type: WorkoutType;
};

/**
 * Build pain and energy levels around workouts.
 * Helps identify if workouts are helping or hurting.
 */
export const buildWorkoutPainTrend = (
  history: WorkoutHistoryItem[],
): WorkoutPainPoint[] => {
  const results: WorkoutPainPoint[] = [];
  
  for (const item of history) {
    const dateKey = getWorkoutDateKey(item.workout);
    if (!dateKey) continue;
    
    results.push({
      date: dateKey,
      painBefore: item.workout.pain_level_before ?? null,
      painAfter: item.workout.pain_level_after ?? null,
      energyBefore: item.workout.energy_level_before ?? null,
      energyAfter: item.workout.energy_level_after ?? null,
      durationMinutes: item.workout.duration_minutes ?? 0,
      type: item.workout.type ?? 'other',
    });
  }
  
  return results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

/**
 * Calculate average pain change after workouts.
 * Negative = pain decreases (good), Positive = pain increases (concerning)
 */
export const computePainImpact = (
  history: WorkoutHistoryItem[],
): { avgPainChange: number; workoutsWithPainData: number } => {
  const painChanges: number[] = [];
  
  history.forEach((item) => {
    const before = item.workout.pain_level_before;
    const after = item.workout.pain_level_after;
    if (before != null && after != null) {
      painChanges.push(after - before);
    }
  });

  if (painChanges.length === 0) {
    return { avgPainChange: 0, workoutsWithPainData: 0 };
  }

  const avg = painChanges.reduce((sum, c) => sum + c, 0) / painChanges.length;
  return {
    avgPainChange: Math.round(avg * 10) / 10,
    workoutsWithPainData: painChanges.length,
  };
};
