/**
 * TP-002: AI Program Generator (rule-based with optional API enhancement)
 *
 * Generates personalized multi-week scoliosis rehabilitation programs based on:
 * - Current metrics (pain, posture, symmetry)
 * - Active goals
 * - Workout history stats
 * - Available exercises from the exercise library
 *
 * Phase structure follows the 4-phase scoliosis correction model:
 * 1. Release: foam rolling, stretching, breathing (1-2 weeks)
 * 2. Activate: corrective exercises, low resistance (1-2 weeks)
 * 3. Strengthen: progressive overload, compound movements (2-3 weeks)
 * 4. Integrate: full-body training with corrective maintenance (1-2 weeks)
 */

import type {
  TrainingProgram,
  ProgramPhase,
  ProgramWeek,
  ProgramSession,
  ProgramExerciseSlot,
  ProgramGoalType,
  PhaseFocus,
  SessionType,
  ExerciseSide,
  CreateProgramInput,
} from './trainingProgram';

// ── User Context Types ─────────────────────────────────────────────

export interface UserMetrics {
  pain_level: number | null; // 0-10, lower is better
  posture_score: number | null; // 0-100, higher is better
  symmetry_score: number | null; // 0-100, higher is better
}

export interface WorkoutStats {
  total_workouts: number;
  avg_sessions_per_week: number;
  current_streak: number;
  avg_workout_minutes: number;
}

export interface ExerciseRecord {
  id: string;
  name: string;
  category: string;
  target_muscles: string[];
  sets_default: number | null;
  reps_default: number | null;
  duration_seconds_default: number | null;
  side_specific: boolean;
}

export interface UserContext {
  metrics: UserMetrics;
  goals: { type: string; target_value: number }[];
  workoutStats: WorkoutStats;
  exercises: ExerciseRecord[];
}

// ── Configuration ──────────────────────────────────────────────────

export interface ProgramConfig {
  /** Total weeks (4-8, auto-determined if not set) */
  totalWeeks?: number;
  /** Sessions per week (4-6) */
  sessionsPerWeek?: number;
  /** Insert deload every N weeks (default: 3) */
  deloadEvery?: number;
  /** Goal type to optimize for */
  goalType?: ProgramGoalType;
}

// ── Constants ──────────────────────────────────────────────────────

/** Exercise category → which phases it belongs to */
const CATEGORY_PHASE_MAP: Record<string, PhaseFocus[]> = {
  stretching: ['release'],
  mobility: ['release', 'activate'],
  corrective: ['activate', 'strengthen'],
  strengthening: ['activate', 'strengthen', 'integrate'],
  gym_compound: ['strengthen', 'integrate'],
  gym_isolation: ['strengthen', 'integrate'],
};

/** Phase focus → which session types to use */
const PHASE_SESSION_TYPES: Record<PhaseFocus, SessionType[]> = {
  release: ['corrective', 'active_recovery'],
  activate: ['corrective', 'corrective'],
  strengthen: ['corrective', 'gym'],
  integrate: ['gym', 'corrective'],
};

/** Default intensity per phase (percentage) */
const PHASE_INTENSITY: Record<PhaseFocus, number> = {
  release: 50,
  activate: 60,
  strengthen: 80,
  integrate: 75,
};

/** Deload intensity multiplier */
const DELOAD_INTENSITY_MULT = 0.6;

/** Days of the week for sessions (0=Sun, 1=Mon, ..., 6=Sat) */
const SESSION_DAYS_BY_COUNT: Record<number, number[]> = {
  3: [1, 3, 5], // Mon, Wed, Fri
  4: [1, 2, 4, 5], // Mon, Tue, Thu, Fri
  5: [1, 2, 3, 4, 5], // Mon-Fri
  6: [1, 2, 3, 4, 5, 6], // Mon-Sat
};

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Determine the best goal type from user context.
 */
export function inferGoalType(ctx: UserContext): ProgramGoalType {
  const { metrics, goals } = ctx;

  // Check explicit goals first
  if (goals.some((g) => g.type === 'pain_reduction')) return 'pain_reduction';
  if (goals.some((g) => g.type === 'posture_score')) return 'posture_improvement';
  if (goals.some((g) => g.type === 'symmetry_improvement')) return 'scoliosis_correction';

  // Infer from metrics
  if (metrics.pain_level != null && metrics.pain_level >= 5) return 'pain_reduction';
  if (metrics.symmetry_score != null && metrics.symmetry_score < 70) return 'scoliosis_correction';
  if (metrics.posture_score != null && metrics.posture_score < 60) return 'posture_improvement';

  return 'general_mobility';
}

/**
 * Determine optimal program duration based on user context.
 */
export function inferDuration(ctx: UserContext, goalType: ProgramGoalType): number {
  const { metrics, workoutStats } = ctx;

  // Beginners get shorter programs (4 weeks)
  if (workoutStats.total_workouts < 10) return 4;

  // Pain-focused = shorter, more careful
  if (goalType === 'pain_reduction' && (metrics.pain_level ?? 0) >= 7) return 4;

  // Scoliosis correction needs time
  if (goalType === 'scoliosis_correction') return 8;

  // Good fitness base = can handle longer programs
  if (workoutStats.avg_sessions_per_week >= 4) return 8;

  return 6; // default middle ground
}

/**
 * Determine sessions per week based on workout history.
 */
export function inferSessionsPerWeek(ctx: UserContext): number {
  const { workoutStats } = ctx;

  if (workoutStats.total_workouts < 5) return 3; // brand new
  if (workoutStats.avg_sessions_per_week < 3) return 4; // building up
  if (workoutStats.avg_sessions_per_week >= 5) return 6; // experienced
  return 5; // moderate
}

/**
 * Build the phase plan for the program.
 */
export function buildPhases(
  totalWeeks: number,
  goalType: ProgramGoalType,
  ctx: UserContext,
): ProgramPhase[] {
  const phases: ProgramPhase[] = [];

  // Determine phase distribution based on goal and duration
  let releaseWeeks: number;
  let activateWeeks: number;
  let strengthenWeeks: number;
  let integrateWeeks: number;

  if (goalType === 'pain_reduction') {
    // Longer release phase for pain
    releaseWeeks = Math.max(1, Math.round(totalWeeks * 0.3));
    activateWeeks = Math.max(1, Math.round(totalWeeks * 0.25));
    strengthenWeeks = Math.max(1, Math.round(totalWeeks * 0.25));
  } else if (goalType === 'scoliosis_correction') {
    // Balanced with longer strengthen
    releaseWeeks = Math.max(1, Math.round(totalWeeks * 0.2));
    activateWeeks = Math.max(1, Math.round(totalWeeks * 0.25));
    strengthenWeeks = Math.max(1, Math.round(totalWeeks * 0.35));
  } else if (goalType === 'posture_improvement') {
    // More activation and strengthening
    releaseWeeks = Math.max(1, Math.round(totalWeeks * 0.2));
    activateWeeks = Math.max(1, Math.round(totalWeeks * 0.3));
    strengthenWeeks = Math.max(1, Math.round(totalWeeks * 0.3));
  } else {
    // General mobility: even distribution
    releaseWeeks = Math.max(1, Math.round(totalWeeks * 0.25));
    activateWeeks = Math.max(1, Math.round(totalWeeks * 0.25));
    strengthenWeeks = Math.max(1, Math.round(totalWeeks * 0.25));
  }

  // Integrate phase absorbs remainder to guarantee sum === totalWeeks
  integrateWeeks = Math.max(1, totalWeeks - releaseWeeks - activateWeeks - strengthenWeeks);

  // Safety: if rounding caused overshoot, trim from the largest non-1 phase
  while (releaseWeeks + activateWeeks + strengthenWeeks + integrateWeeks > totalWeeks) {
    if (strengthenWeeks > 1) strengthenWeeks--;
    else if (activateWeeks > 1) activateWeeks--;
    else if (releaseWeeks > 1) releaseWeeks--;
    else integrateWeeks = Math.max(1, integrateWeeks - 1);
  }

  const phaseConfigs: { name: string; focus: PhaseFocus; weeks: number; desc: string }[] = [
    {
      name: 'Release & Reset',
      focus: 'release',
      weeks: releaseWeeks,
      desc: 'Focus on releasing tight tissues, foam rolling, stretching, and breathing exercises. Build body awareness.',
    },
    {
      name: 'Activate & Correct',
      focus: 'activate',
      weeks: activateWeeks,
      desc: 'Activate weak muscles, especially on the underactive side. Low resistance corrective work with precision.',
    },
    {
      name: 'Build Strength',
      focus: 'strengthen',
      weeks: strengthenWeeks,
      desc: 'Progressive overload with compound movements. Maintain corrective exercises while building overall strength.',
    },
    {
      name: 'Integrate & Maintain',
      focus: 'integrate',
      weeks: integrateWeeks,
      desc: 'Full-body training integrating corrective patterns into everyday movements. Build lasting habits.',
    },
  ];

  let phaseNumber = 1;
  for (const config of phaseConfigs) {
    if (config.weeks > 0) {
      phases.push({
        name: config.name,
        description: config.desc,
        phase_number: phaseNumber,
        duration_weeks: config.weeks,
        focus: config.focus,
      });
      phaseNumber++;
    }
  }

  return phases;
}

/**
 * Filter exercises appropriate for a given phase focus.
 */
export function getExercisesForPhase(
  exercises: ExerciseRecord[],
  focus: PhaseFocus,
): ExerciseRecord[] {
  const allowedCategories = Object.entries(CATEGORY_PHASE_MAP)
    .filter(([, phases]) => phases.includes(focus))
    .map(([cat]) => cat);

  return exercises.filter((ex) => allowedCategories.includes(ex.category));
}

/**
 * Select exercises for a session, ensuring variety and targeting key muscle groups.
 */
export function selectExercisesForSession(
  available: ExerciseRecord[],
  sessionType: SessionType,
  exerciseCount: number,
  usedIds: Set<string>,
): ExerciseRecord[] {
  if (available.length === 0) return [];

  // Prefer exercises not used in other sessions this week
  const unused = available.filter((ex) => !usedIds.has(ex.id));
  const pool = unused.length >= exerciseCount ? unused : available;

  // Prioritize by session type
  const prioritized = [...pool].sort((a, b) => {
    // For corrective sessions, prioritize corrective and mobility exercises
    if (sessionType === 'corrective' || sessionType === 'active_recovery') {
      const aScore = ['corrective', 'mobility', 'stretching'].includes(a.category) ? 0 : 1;
      const bScore = ['corrective', 'mobility', 'stretching'].includes(b.category) ? 0 : 1;
      return aScore - bScore;
    }
    // For gym sessions, prioritize compound then isolation
    if (sessionType === 'gym') {
      const aScore = a.category === 'gym_compound' ? 0 : a.category === 'gym_isolation' ? 1 : 2;
      const bScore = b.category === 'gym_compound' ? 0 : b.category === 'gym_isolation' ? 1 : 2;
      return aScore - bScore;
    }
    return 0;
  });

  // Take the top N, ensuring we cover different muscle groups
  const selected: ExerciseRecord[] = [];
  const coveredMuscles = new Set<string>();

  for (const ex of prioritized) {
    if (selected.length >= exerciseCount) break;

    // Prefer exercises targeting uncovered muscles
    const newMuscles = ex.target_muscles.filter((m) => !coveredMuscles.has(m));
    if (newMuscles.length > 0 || selected.length < Math.ceil(exerciseCount / 2)) {
      selected.push(ex);
      ex.target_muscles.forEach((m) => coveredMuscles.add(m));
    }
  }

  // Fill remaining spots if needed
  if (selected.length < exerciseCount) {
    for (const ex of prioritized) {
      if (selected.length >= exerciseCount) break;
      if (!selected.includes(ex)) {
        selected.push(ex);
      }
    }
  }

  return selected.slice(0, exerciseCount);
}

/**
 * Build exercise slots from selected exercises with appropriate parameters.
 */
export function buildExerciseSlots(
  exercises: ExerciseRecord[],
  phaseFocus: PhaseFocus,
  intensityPct: number,
  isDeload: boolean,
): ProgramExerciseSlot[] {
  return exercises.map((ex, idx) => {
    const intensity = isDeload ? intensityPct * DELOAD_INTENSITY_MULT : intensityPct;

    // Base sets/reps from exercise defaults, adjusted by phase
    let sets = ex.sets_default ?? 3;
    let reps: number | null = ex.reps_default ?? 10;
    let holdSeconds: number | null = ex.duration_seconds_default ?? null;
    let restSeconds = 60;
    let weightPct: number | null = null;
    let side: ExerciseSide | null = ex.side_specific ? 'both' : null;

    // Phase-specific adjustments
    switch (phaseFocus) {
      case 'release':
        sets = Math.min(sets, 2);
        reps = holdSeconds != null ? null : Math.min(reps, 8);
        holdSeconds = holdSeconds != null ? Math.max(holdSeconds, 30) : null;
        restSeconds = 30;
        break;
      case 'activate':
        sets = Math.max(2, Math.min(sets, 3));
        reps = holdSeconds != null ? null : Math.min(reps, 12);
        restSeconds = 45;
        break;
      case 'strengthen':
        sets = Math.max(3, sets);
        reps = holdSeconds != null ? null : reps;
        restSeconds = 90;
        weightPct = ex.category.startsWith('gym') ? Math.round(intensity * 0.85) : null;
        break;
      case 'integrate':
        sets = 3;
        reps = holdSeconds != null ? null : Math.min(reps + 2, 15);
        restSeconds = 60;
        weightPct = ex.category.startsWith('gym') ? Math.round(intensity * 0.75) : null;
        break;
    }

    // Deload reductions
    if (isDeload) {
      sets = Math.max(1, sets - 1);
      reps = reps != null ? Math.max(5, Math.round(reps * 0.7)) : null;
      restSeconds = Math.min(restSeconds + 15, 120);
    }

    // Progressive overload: slight increase for later exercises in the session
    const progressionRule = phaseFocus === 'strengthen' || phaseFocus === 'integrate'
      ? 'Add 2.5kg when all sets completed at target reps for 2 consecutive sessions'
      : null;

    return {
      exercise_id: ex.id,
      slot_order: idx,
      sets,
      reps,
      hold_seconds: holdSeconds,
      weight_pct_1rm: weightPct,
      side,
      rest_seconds: restSeconds,
      notes: null,
      progression_rule: progressionRule,
    };
  });
}

/**
 * Build sessions for a week.
 */
export function buildWeekSessions(
  phaseFocus: PhaseFocus,
  exercises: ExerciseRecord[],
  sessionsPerWeek: number,
  intensityPct: number,
  isDeload: boolean,
): ProgramSession[] {
  const sessionTypes = PHASE_SESSION_TYPES[phaseFocus];
  const days = SESSION_DAYS_BY_COUNT[sessionsPerWeek] ?? SESSION_DAYS_BY_COUNT[4]!;
  const phaseExercises = getExercisesForPhase(exercises, phaseFocus);
  const usedIds = new Set<string>();

  const sessions: ProgramSession[] = [];
  for (let i = 0; i < Math.min(sessionsPerWeek, days.length); i++) {
    const sessionType = sessionTypes[i % sessionTypes.length]!;

    // Exercise count per session
    const exerciseCount = sessionType === 'active_recovery'
      ? 4
      : sessionType === 'corrective'
        ? 5
        : 6;

    const selected = selectExercisesForSession(
      phaseExercises,
      sessionType,
      exerciseCount,
      usedIds,
    );

    // Track used exercises for variety
    selected.forEach((ex) => usedIds.add(ex.id));

    const exerciseSlots = buildExerciseSlots(selected, phaseFocus, intensityPct, isDeload);

    sessions.push({
      day_of_week: days[i]!,
      session_type: sessionType,
      completed: false,
      completed_at: null,
      exercises: exerciseSlots,
    });
  }

  // Add rest days where there's no session
  // (Rest days are implicit — we only create active sessions)

  return sessions;
}

/**
 * Build all weeks for a phase.
 */
export function buildPhaseWeeks(
  phase: ProgramPhase,
  startWeekNumber: number,
  exercises: ExerciseRecord[],
  sessionsPerWeek: number,
  deloadEvery: number,
): ProgramWeek[] {
  const weeks: ProgramWeek[] = [];
  const baseIntensity = PHASE_INTENSITY[phase.focus];

  for (let w = 0; w < phase.duration_weeks; w++) {
    const weekNumber = startWeekNumber + w;
    const isDeload = deloadEvery > 0 && weekNumber > 0 && weekNumber % deloadEvery === 0;

    // Progressive intensity within phase (small weekly increase)
    const weekProgression = isDeload ? 0 : w * 3; // +3% per week within phase
    const intensityPct = Math.min(
      100,
      isDeload ? Math.round(baseIntensity * DELOAD_INTENSITY_MULT) : baseIntensity + weekProgression,
    );

    const sessions = buildWeekSessions(
      phase.focus,
      exercises,
      sessionsPerWeek,
      intensityPct,
      isDeload,
    );

    weeks.push({
      week_number: weekNumber,
      is_deload: isDeload,
      intensity_pct: intensityPct,
      notes: isDeload
        ? 'Recovery week — reduced volume and intensity. Focus on form and breathing.'
        : null,
      sessions,
    });
  }

  return weeks;
}

/**
 * Generate a complete training program.
 */
export function generateProgram(
  ctx: UserContext,
  config: ProgramConfig = {},
): CreateProgramInput {
  // Determine program parameters
  const goalType = config.goalType ?? inferGoalType(ctx);
  const totalWeeks = config.totalWeeks ?? inferDuration(ctx, goalType);
  const sessionsPerWeek = config.sessionsPerWeek ?? inferSessionsPerWeek(ctx);
  const deloadEvery = config.deloadEvery ?? 3;

  // Build phase structure
  const phaseDefs = buildPhases(totalWeeks, goalType, ctx);

  // Build weeks for each phase
  let currentWeekNumber = 1;
  const phases: ProgramPhase[] = phaseDefs.map((phaseDef) => {
    const weeks = buildPhaseWeeks(
      phaseDef,
      currentWeekNumber,
      ctx.exercises,
      sessionsPerWeek,
      deloadEvery,
    );
    currentWeekNumber += phaseDef.duration_weeks;

    return {
      ...phaseDef,
      weeks,
    };
  });

  // Build program name
  const goalNames: Record<ProgramGoalType, string> = {
    scoliosis_correction: 'Scoliosis Correction',
    pain_reduction: 'Pain Relief',
    posture_improvement: 'Posture Improvement',
    general_mobility: 'General Mobility',
    custom: 'Custom Training',
  };

  const programName = `${totalWeeks}-Week ${goalNames[goalType]} Program`;
  const programDesc = buildProgramDescription(goalType, totalWeeks, sessionsPerWeek, ctx);

  return {
    name: programName,
    description: programDesc,
    goal_type: goalType,
    duration_weeks: totalWeeks,
    current_week: 1,
    status: 'active',
    started_at: new Date().toISOString(),
    phases,
  };
}

/**
 * Build a human-readable program description.
 */
function buildProgramDescription(
  goalType: ProgramGoalType,
  totalWeeks: number,
  sessionsPerWeek: number,
  ctx: UserContext,
): string {
  const lines: string[] = [];

  lines.push(`A ${totalWeeks}-week structured program with ${sessionsPerWeek} sessions per week.`);

  if (ctx.metrics.pain_level != null && ctx.metrics.pain_level > 0) {
    lines.push(`Starting pain level: ${ctx.metrics.pain_level}/10.`);
  }
  if (ctx.metrics.symmetry_score != null) {
    lines.push(`Starting symmetry: ${ctx.metrics.symmetry_score}%.`);
  }
  if (ctx.metrics.posture_score != null) {
    lines.push(`Starting posture score: ${ctx.metrics.posture_score}/100.`);
  }

  switch (goalType) {
    case 'pain_reduction':
      lines.push('Prioritizes tissue release and gentle activation before building strength.');
      break;
    case 'scoliosis_correction':
      lines.push('Progressive correction through release, activation, strengthening, and integration phases.');
      break;
    case 'posture_improvement':
      lines.push('Targets postural muscles through corrective exercises and compound movements.');
      break;
    default:
      lines.push('Balanced approach to mobility, strength, and body awareness.');
  }

  return lines.join(' ');
}

/**
 * Get a summary of the generated program for display before saving.
 */
export function summarizeProgram(input: CreateProgramInput): ProgramSummary {
  let totalSessions = 0;
  let totalExerciseSlots = 0;
  let deloadWeeks = 0;

  const phaseSummaries: PhaseSummary[] = (input.phases ?? []).map((phase) => {
    let phaseSessions = 0;
    let phaseExercises = 0;
    let phaseDeloads = 0;

    for (const week of phase.weeks ?? []) {
      if (week.is_deload) phaseDeloads++;
      for (const session of week.sessions ?? []) {
        phaseSessions++;
        phaseExercises += session.exercises.length;
      }
    }

    totalSessions += phaseSessions;
    totalExerciseSlots += phaseExercises;
    deloadWeeks += phaseDeloads;

    return {
      name: phase.name,
      focus: phase.focus,
      weeks: phase.duration_weeks,
      sessions: phaseSessions,
      exercises: phaseExercises,
    };
  });

  return {
    name: input.name,
    goalType: input.goal_type,
    totalWeeks: input.duration_weeks,
    totalSessions,
    totalExerciseSlots,
    deloadWeeks,
    phases: phaseSummaries,
  };
}

export interface PhaseSummary {
  name: string;
  focus: PhaseFocus;
  weeks: number;
  sessions: number;
  exercises: number;
}

export interface ProgramSummary {
  name: string;
  goalType: ProgramGoalType;
  totalWeeks: number;
  totalSessions: number;
  totalExerciseSlots: number;
  deloadWeeks: number;
  phases: PhaseSummary[];
}
