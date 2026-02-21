/**
 * Exercise Effectiveness & Correlation Engine
 *
 * Analyzes which exercises actually reduce pain in specific body zones.
 * Methodology:
 *   1. For each exercise performed on day N, find body_map_entries
 *      in the window BEFORE (day N-1 to N) and AFTER (day N+1 to N+2).
 *   2. Compare average intensity per zone across before/after windows.
 *   3. Delta = after_avg - before_avg (negative = improvement).
 *   4. Aggregate across all occurrences of the same exercise.
 *   5. Require minimum occurrences for confidence thresholds.
 *
 * This turns raw workout + body map data into actionable rehabilitation intelligence.
 */

import { getSupabase } from './supabase';
import type { BodyZoneId } from './bodyMap';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CorrelationConfidence = 'low' | 'medium' | 'high';
export type EffectDirection = 'helps' | 'hurts' | 'neutral';

export interface ExerciseCorrelation {
  exercise_id: string;
  exercise_name: string;
  category: string;
  zone_id: string;
  zone_name: string;
  avg_pain_before: number;
  avg_pain_after: number;
  avg_delta: number;          // negative = pain decreased (good)
  delta_pct: number;          // percentage change
  occurrences: number;
  confidence: CorrelationConfidence;
  direction: EffectDirection;
}

export interface OverallExerciseEffect {
  exercise_id: string;
  exercise_name: string;
  category: string;
  avg_overall_pain_delta: number;
  avg_delta_pct: number;
  affected_zones: { zone_id: string; zone_name: string; delta: number; delta_pct: number }[];
  occurrences: number;
  confidence: CorrelationConfidence;
  direction: EffectDirection;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_OCCURRENCES_LOW = 3;
const MIN_OCCURRENCES_MEDIUM = 5;
const MIN_OCCURRENCES_HIGH = 8;

/** Neutral threshold: deltas within ±5% are considered neutral */
const NEUTRAL_THRESHOLD_PCT = 5;

/** Human-readable zone names */
const ZONE_LABELS: Record<string, string> = {
  neck: 'Neck',
  left_shoulder: 'Left Shoulder',
  right_shoulder: 'Right Shoulder',
  chest: 'Chest',
  upper_back: 'Upper Back',
  mid_back: 'Mid Back',
  lower_back: 'Lower Back',
  left_hip: 'Left Hip',
  right_hip: 'Right Hip',
  left_knee: 'Left Knee',
  right_knee: 'Right Knee',
  left_arm: 'Left Arm',
  right_arm: 'Right Arm',
  left_leg: 'Left Leg',
  right_leg: 'Right Leg',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return formatDate(d);
};

const getConfidence = (occurrences: number): CorrelationConfidence => {
  if (occurrences >= MIN_OCCURRENCES_HIGH) return 'high';
  if (occurrences >= MIN_OCCURRENCES_MEDIUM) return 'medium';
  return 'low';
};

const getDirection = (deltaPct: number): EffectDirection => {
  if (deltaPct < -NEUTRAL_THRESHOLD_PCT) return 'helps';
  if (deltaPct > NEUTRAL_THRESHOLD_PCT) return 'hurts';
  return 'neutral';
};

const avg = (nums: number[]): number =>
  nums.length === 0 ? 0 : nums.reduce((s, n) => s + n, 0) / nums.length;

const pctChange = (before: number, after: number): number =>
  before === 0 ? 0 : Math.round(((after - before) / before) * 100);

// ─── Data Fetching ────────────────────────────────────────────────────────────

interface WorkoutWithExercises {
  workout_id: string;
  workout_date: string;
  exercises: {
    exercise_id: string;
    exercise_name: string;
    category: string;
  }[];
}

interface BodyMapPoint {
  zone: string;
  intensity: number;
  recorded_at: string;
}

/**
 * Fetch all workouts with their exercises within the lookback window.
 */
async function fetchWorkoutsWithExercises(
  lookbackDays: number,
): Promise<WorkoutWithExercises[]> {
  const supabase = getSupabase();
  const cutoff = addDays(formatDate(new Date()), -lookbackDays);

  // Get workouts
  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .select('id, date')
    .gte('date', cutoff)
    .order('date', { ascending: true });

  if (wErr || !workouts?.length) return [];

  // Get all workout exercises for these workouts
  const workoutIds = workouts.map((w: { id: string }) => w.id);
  const { data: wxData, error: wxErr } = await supabase
    .from('workout_exercises')
    .select('workout_id, exercise_id')
    .in('workout_id', workoutIds);

  if (wxErr || !wxData?.length) return [];

  // Get exercise details
  const exerciseIds = [
    ...new Set(
      wxData
        .map((wx: { exercise_id: string | null }) => wx.exercise_id)
        .filter(Boolean),
    ),
  ];
  if (!exerciseIds.length) return [];

  const { data: exercises, error: eErr } = await supabase
    .from('exercises')
    .select('id, name, category')
    .in('id', exerciseIds);

  if (eErr || !exercises?.length) return [];

  const exerciseMap = new Map(
    exercises.map((e: { id: string; name: string; category: string }) => [
      e.id,
      { name: e.name, category: e.category },
    ]),
  );

  // Group exercises by workout
  const wxByWorkout = new Map<string, { exercise_id: string; exercise_name: string; category: string }[]>();
  for (const wx of wxData) {
    if (!wx.exercise_id) continue;
    const info = exerciseMap.get(wx.exercise_id);
    if (!info) continue;
    const list = wxByWorkout.get(wx.workout_id) ?? [];
    list.push({
      exercise_id: wx.exercise_id,
      exercise_name: info.name,
      category: info.category,
    });
    wxByWorkout.set(wx.workout_id, list);
  }

  return workouts
    .filter((w: { id: string }) => wxByWorkout.has(w.id))
    .map((w: { id: string; date: string }) => ({
      workout_id: w.id,
      workout_date: w.date,
      exercises: wxByWorkout.get(w.id) ?? [],
    }));
}

/**
 * Fetch all body map entries within the lookback window (with buffer days).
 */
async function fetchBodyMapEntries(
  lookbackDays: number,
): Promise<BodyMapPoint[]> {
  const supabase = getSupabase();
  // Extra 2-day buffer on each side for before/after windows
  const cutoff = addDays(formatDate(new Date()), -(lookbackDays + 3));

  const { data, error } = await supabase
    .from('body_map_entries')
    .select('zone, intensity, recorded_at')
    .gte('recorded_at', cutoff)
    .order('recorded_at', { ascending: true });

  if (error || !data?.length) return [];
  return data as BodyMapPoint[];
}

// ─── Correlation Computation ──────────────────────────────────────────────────

/**
 * Group body map entries by date (YYYY-MM-DD) and zone.
 * Returns: Map<dateKey, Map<zoneId, avgIntensity>>
 */
function groupBodyMapByDateAndZone(
  entries: BodyMapPoint[],
): Map<string, Map<string, number>> {
  // First, group raw intensities
  const raw = new Map<string, Map<string, number[]>>();

  for (const e of entries) {
    const dateKey = e.recorded_at.slice(0, 10); // YYYY-MM-DD
    if (!raw.has(dateKey)) raw.set(dateKey, new Map());
    const zoneMap = raw.get(dateKey)!;
    if (!zoneMap.has(e.zone)) zoneMap.set(e.zone, []);
    zoneMap.get(e.zone)!.push(e.intensity);
  }

  // Average intensities per date-zone pair
  const result = new Map<string, Map<string, number>>();
  for (const [dateKey, zoneMap] of raw) {
    const averaged = new Map<string, number>();
    for (const [zone, intensities] of zoneMap) {
      averaged.set(zone, avg(intensities));
    }
    result.set(dateKey, averaged);
  }

  return result;
}

/**
 * For a workout on a given date, compute before/after pain per zone.
 * Before window: workout_date - 1 to workout_date (day of and day before)
 * After window: workout_date + 1 to workout_date + 2 (next 2 days)
 */
function getBeforeAfterPain(
  workoutDate: string,
  bodyMapByDate: Map<string, Map<string, number>>,
): { before: Map<string, number[]>; after: Map<string, number[]> } {
  const beforeDates = [addDays(workoutDate, -1), workoutDate];
  const afterDates = [addDays(workoutDate, 1), addDays(workoutDate, 2)];

  const before = new Map<string, number[]>();
  const after = new Map<string, number[]>();

  for (const d of beforeDates) {
    const zones = bodyMapByDate.get(d);
    if (!zones) continue;
    for (const [zone, intensity] of zones) {
      if (!before.has(zone)) before.set(zone, []);
      before.get(zone)!.push(intensity);
    }
  }

  for (const d of afterDates) {
    const zones = bodyMapByDate.get(d);
    if (!zones) continue;
    for (const [zone, intensity] of zones) {
      if (!after.has(zone)) after.set(zone, []);
      after.get(zone)!.push(intensity);
    }
  }

  return { before, after };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute per-exercise, per-zone correlations.
 *
 * For each exercise, looks at body map data before and after each
 * occurrence, then averages the deltas. Requires at least
 * MIN_OCCURRENCES_LOW data points to include.
 */
export async function computeExerciseZoneCorrelations(
  lookbackDays: number = 60,
): Promise<ExerciseCorrelation[]> {
  const [workouts, bodyMapEntries] = await Promise.all([
    fetchWorkoutsWithExercises(lookbackDays),
    fetchBodyMapEntries(lookbackDays),
  ]);

  if (!workouts.length || !bodyMapEntries.length) return [];

  const bodyMapByDate = groupBodyMapByDateAndZone(bodyMapEntries);

  // For each exercise+zone pair, accumulate before/after readings
  // Key: `${exercise_id}::${zone_id}`
  type AccumEntry = {
    exercise_id: string;
    exercise_name: string;
    category: string;
    zone_id: string;
    befores: number[];
    afters: number[];
  };
  const accum = new Map<string, AccumEntry>();

  for (const workout of workouts) {
    const { before, after } = getBeforeAfterPain(workout.workout_date, bodyMapByDate);

    // Only include zones that have BOTH before and after data
    const commonZones = [...before.keys()].filter((z) => after.has(z));
    if (!commonZones.length) continue;

    for (const ex of workout.exercises) {
      for (const zone of commonZones) {
        const key = `${ex.exercise_id}::${zone}`;
        if (!accum.has(key)) {
          accum.set(key, {
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            category: ex.category,
            zone_id: zone,
            befores: [],
            afters: [],
          });
        }
        const entry = accum.get(key)!;
        entry.befores.push(avg(before.get(zone)!));
        entry.afters.push(avg(after.get(zone)!));
      }
    }
  }

  // Build correlations from accumulated data
  const correlations: ExerciseCorrelation[] = [];
  for (const entry of accum.values()) {
    if (entry.befores.length < MIN_OCCURRENCES_LOW) continue;

    const avgBefore = avg(entry.befores);
    const avgAfter = avg(entry.afters);
    const delta = avgAfter - avgBefore;
    const deltaPct = pctChange(avgBefore, avgAfter);

    correlations.push({
      exercise_id: entry.exercise_id,
      exercise_name: entry.exercise_name,
      category: entry.category,
      zone_id: entry.zone_id,
      zone_name: ZONE_LABELS[entry.zone_id] ?? entry.zone_id,
      avg_pain_before: Math.round(avgBefore * 10) / 10,
      avg_pain_after: Math.round(avgAfter * 10) / 10,
      avg_delta: Math.round(delta * 100) / 100,
      delta_pct: deltaPct,
      occurrences: entry.befores.length,
      confidence: getConfidence(entry.befores.length),
      direction: getDirection(deltaPct),
    });
  }

  // Sort by delta (most negative = best improvement first)
  return correlations.sort((a, b) => a.avg_delta - b.avg_delta);
}

/**
 * Get the top N most effective exercises (best overall pain reduction).
 * Aggregates zone-level correlations into per-exercise summaries.
 */
export async function computeTopEffectiveExercises(
  lookbackDays: number = 60,
  limit: number = 5,
): Promise<OverallExerciseEffect[]> {
  const correlations = await computeExerciseZoneCorrelations(lookbackDays);
  return aggregateToOverall(correlations, 'helps', limit);
}

/**
 * Get exercises that seem to increase pain (top N most harmful).
 */
export async function computeTopHarmfulExercises(
  lookbackDays: number = 60,
  limit: number = 3,
): Promise<OverallExerciseEffect[]> {
  const correlations = await computeExerciseZoneCorrelations(lookbackDays);
  return aggregateToOverall(correlations, 'hurts', limit);
}

/**
 * For a specific body zone, find which exercises reduce its pain most.
 */
export async function getZoneBestExercises(
  zoneId: string,
  lookbackDays: number = 60,
): Promise<ExerciseCorrelation[]> {
  const correlations = await computeExerciseZoneCorrelations(lookbackDays);
  return correlations
    .filter((c) => c.zone_id === zoneId && c.direction === 'helps')
    .sort((a, b) => a.avg_delta - b.avg_delta);
}

/**
 * For a specific body zone, find which exercises increase its pain.
 */
export async function getZoneWorstExercises(
  zoneId: string,
  lookbackDays: number = 60,
): Promise<ExerciseCorrelation[]> {
  const correlations = await computeExerciseZoneCorrelations(lookbackDays);
  return correlations
    .filter((c) => c.zone_id === zoneId && c.direction === 'hurts')
    .sort((a, b) => b.avg_delta - a.avg_delta);
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function aggregateToOverall(
  correlations: ExerciseCorrelation[],
  directionFilter: EffectDirection,
  limit: number,
): OverallExerciseEffect[] {
  // Group by exercise_id
  const byExercise = new Map<
    string,
    {
      exercise_id: string;
      exercise_name: string;
      category: string;
      zones: { zone_id: string; zone_name: string; delta: number; delta_pct: number }[];
      deltas: number[];
      deltaPcts: number[];
      maxOccurrences: number;
    }
  >();

  for (const c of correlations) {
    if (c.direction !== directionFilter) continue;

    if (!byExercise.has(c.exercise_id)) {
      byExercise.set(c.exercise_id, {
        exercise_id: c.exercise_id,
        exercise_name: c.exercise_name,
        category: c.category,
        zones: [],
        deltas: [],
        deltaPcts: [],
        maxOccurrences: 0,
      });
    }
    const entry = byExercise.get(c.exercise_id)!;
    entry.zones.push({
      zone_id: c.zone_id,
      zone_name: c.zone_name,
      delta: c.avg_delta,
      delta_pct: c.delta_pct,
    });
    entry.deltas.push(c.avg_delta);
    entry.deltaPcts.push(c.delta_pct);
    entry.maxOccurrences = Math.max(entry.maxOccurrences, c.occurrences);
  }

  const results: OverallExerciseEffect[] = [];
  for (const entry of byExercise.values()) {
    const avgDelta = avg(entry.deltas);
    const avgDeltaPct = Math.round(avg(entry.deltaPcts));

    results.push({
      exercise_id: entry.exercise_id,
      exercise_name: entry.exercise_name,
      category: entry.category,
      avg_overall_pain_delta: Math.round(avgDelta * 100) / 100,
      avg_delta_pct: avgDeltaPct,
      affected_zones: entry.zones.sort((a, b) =>
        directionFilter === 'helps' ? a.delta - b.delta : b.delta - a.delta,
      ),
      occurrences: entry.maxOccurrences,
      confidence: getConfidence(entry.maxOccurrences),
      direction: directionFilter,
    });
  }

  // Sort: helps = most negative first, hurts = most positive first
  if (directionFilter === 'helps') {
    results.sort((a, b) => a.avg_overall_pain_delta - b.avg_overall_pain_delta);
  } else {
    results.sort((a, b) => b.avg_overall_pain_delta - a.avg_overall_pain_delta);
  }

  return results.slice(0, limit);
}
