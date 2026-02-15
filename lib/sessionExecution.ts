/**
 * TP-004: Session Execution helpers
 *
 * Pure functions for session execution logic — testable without React Native.
 */

import type { ProgramExerciseSlot, ProgramSession, ProgramWeek, ProgramPhase, TrainingProgram } from './trainingProgram';
import type { WorkoutSet, WorkoutSetSide } from './types';

// ── Types ──────────────────────────────────────────────────────────

export interface SetLog {
  completed: boolean;
  reps: string;
  weight: string;
  duration: string;
  side: WorkoutSetSide;
  rpe: string;
}

export interface SessionSummary {
  programmedSets: number;
  programmedReps: number;
  actualSets: number;
  actualReps: number;
  actualVolume: number;
  durationMinutes: number;
  completionPct: number;
  exercisesCompleted: number;
  totalExercises: number;
}

// ── Helpers ────────────────────────────────────────────────────────

const parseNum = (v: string): number | null => {
  const n = Number(v.trim());
  return v.trim() && Number.isFinite(n) ? n : null;
};

/**
 * Create initial SetLog entries for a ProgramExerciseSlot.
 */
export function createSetsForSlot(slot: ProgramExerciseSlot): SetLog[] {
  const sets: SetLog[] = [];
  for (let i = 0; i < slot.sets; i++) {
    sets.push({
      completed: false,
      reps: slot.reps != null ? String(slot.reps) : '',
      weight: slot.weight_pct_1rm != null ? String(slot.weight_pct_1rm) : '',
      duration: slot.hold_seconds != null ? String(slot.hold_seconds) : '',
      side: (slot.side as WorkoutSetSide) ?? 'bilateral',
      rpe: '',
    });
  }
  return sets;
}

/**
 * Calculate session progress from exercise logs.
 */
export function calculateProgress(exercises: { sets: SetLog[] }[]): {
  totalSets: number;
  completedSets: number;
  pct: number;
  completedExercises: number;
  totalExercises: number;
  allDone: boolean;
} {
  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const completedSets = exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0
  );
  const completedExercises = exercises.filter((ex) =>
    ex.sets.every((s) => s.completed)
  ).length;
  return {
    totalSets,
    completedSets,
    pct: totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0,
    completedExercises,
    totalExercises: exercises.length,
    allDone: totalSets > 0 && completedSets === totalSets,
  };
}

/**
 * Build a SessionSummary from the completed exercise logs vs programmed slots.
 */
export function buildSessionSummary(
  exercises: { slot: ProgramExerciseSlot; sets: SetLog[] }[],
  startedAt: Date,
  endedAt: Date
): SessionSummary {
  let programmedSets = 0;
  let programmedReps = 0;
  let actualSets = 0;
  let actualReps = 0;
  let actualVolume = 0;
  let exercisesCompleted = 0;

  for (const ex of exercises) {
    programmedSets += ex.slot.sets;
    programmedReps += (ex.slot.reps ?? 0) * ex.slot.sets;

    const completedSets = ex.sets.filter((s) => s.completed);
    actualSets += completedSets.length;

    let allDone = true;
    for (const s of ex.sets) {
      if (!s.completed) {
        allDone = false;
        continue;
      }
      const reps = parseNum(s.reps) ?? 0;
      const weight = parseNum(s.weight) ?? 0;
      actualReps += reps;
      actualVolume += reps * weight;
    }
    if (allDone && ex.sets.length > 0) exercisesCompleted++;
  }

  const durationMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);

  return {
    programmedSets,
    programmedReps,
    actualSets,
    actualReps,
    actualVolume,
    durationMinutes,
    completionPct: totalSets > 0 ? Math.round((actualSets / totalSets) * 100) : 0,
    exercisesCompleted,
    totalExercises: exercises.length,
  };
}

/**
 * Determine the workout type string from a session type.
 */
export function sessionTypeToWorkoutType(
  sessionType: string
): 'corrective' | 'gym' | 'cardio' | 'other' {
  switch (sessionType) {
    case 'gym':
      return 'gym';
    case 'active_recovery':
      return 'cardio';
    case 'corrective':
      return 'corrective';
    default:
      return 'other';
  }
}

/**
 * Find a session within a program's nested structure by week number and day of week.
 */
export function findSession(
  program: TrainingProgram,
  weekNumber: number,
  dayOfWeek: number,
  sessionId?: string
): {
  session: ProgramSession | null;
  week: ProgramWeek | null;
  phase: ProgramPhase | null;
} {
  if (!program.phases) return { session: null, week: null, phase: null };

  for (const p of program.phases) {
    for (const w of p.weeks ?? []) {
      if (w.week_number === weekNumber) {
        for (const s of w.sessions ?? []) {
          if (sessionId && s.id === sessionId) {
            return { session: s, week: w, phase: p };
          }
          if (s.day_of_week === dayOfWeek) {
            return { session: s, week: w, phase: p };
          }
        }
        return { session: null, week: w, phase: p };
      }
    }
  }
  return { session: null, week: null, phase: null };
}

/**
 * Convert a SetLog into a WorkoutSet for persisting to Supabase.
 */
export function setLogToWorkoutSet(s: SetLog): WorkoutSet {
  return {
    reps: parseNum(s.reps),
    weight_kg: parseNum(s.weight),
    duration_seconds: parseNum(s.duration),
    side: s.side,
    rpe: parseNum(s.rpe),
    notes: null,
  };
}
