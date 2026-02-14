import { getSupabase } from './supabase';

// ── Types ──────────────────────────────────────────────────────────

export type ProgramStatus = 'active' | 'completed' | 'paused';
export type ProgramGoalType =
  | 'scoliosis_correction'
  | 'pain_reduction'
  | 'posture_improvement'
  | 'general_mobility'
  | 'custom';
export type PhaseFocus = 'release' | 'activate' | 'strengthen' | 'integrate';
export type SessionType = 'corrective' | 'gym' | 'rest' | 'active_recovery';
export type ExerciseSide = 'left' | 'right' | 'both' | 'alternating';

export interface ProgramExerciseSlot {
  id?: string;
  session_id?: string;
  exercise_id: string;
  slot_order: number;
  sets: number;
  reps: number | null;
  hold_seconds: number | null;
  weight_pct_1rm: number | null;
  side: ExerciseSide | null;
  rest_seconds: number;
  notes: string | null;
  progression_rule: string | null;
}

export interface ProgramSession {
  id?: string;
  week_id?: string;
  day_of_week: number; // 0=Sun .. 6=Sat
  session_type: SessionType;
  completed: boolean;
  completed_at: string | null;
  exercises: ProgramExerciseSlot[];
}

export interface ProgramWeek {
  id?: string;
  phase_id?: string;
  week_number: number;
  is_deload: boolean;
  intensity_pct: number;
  notes: string | null;
  sessions?: ProgramSession[];
}

export interface ProgramPhase {
  id?: string;
  program_id?: string;
  name: string;
  description: string | null;
  phase_number: number;
  duration_weeks: number;
  focus: PhaseFocus;
  weeks?: ProgramWeek[];
}

export interface TrainingProgram {
  id: string;
  name: string;
  description: string | null;
  goal_type: ProgramGoalType;
  duration_weeks: number;
  current_week: number;
  status: ProgramStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  phases?: ProgramPhase[];
}

export type CreateProgramInput = Omit<TrainingProgram, 'id' | 'created_at' | 'completed_at'> & {
  phases: ProgramPhase[];
};

// ── CRUD ───────────────────────────────────────────────────────────

/**
 * Create a full training program with phases, weeks, sessions, and exercises.
 * Inserts everything in a nested loop (Supabase doesn't have transactions in JS SDK,
 * but cascading deletes will clean up on failure).
 */
export async function createProgram(input: CreateProgramInput): Promise<TrainingProgram> {
  const supabase = getSupabase();

  // 1. Insert program
  const { data: program, error: programErr } = await supabase
    .from('training_programs')
    .insert({
      name: input.name,
      description: input.description,
      goal_type: input.goal_type,
      duration_weeks: input.duration_weeks,
      current_week: input.current_week,
      status: input.status,
      started_at: input.started_at,
    })
    .select()
    .single();

  if (programErr || !program) throw new Error(`Failed to create program: ${programErr?.message}`);

  // 2. Insert phases
  for (const phase of input.phases) {
    const { data: phaseRow, error: phaseErr } = await supabase
      .from('program_phases')
      .insert({
        program_id: program.id,
        name: phase.name,
        description: phase.description,
        phase_number: phase.phase_number,
        duration_weeks: phase.duration_weeks,
        focus: phase.focus,
      })
      .select()
      .single();

    if (phaseErr || !phaseRow) throw new Error(`Failed to create phase: ${phaseErr?.message}`);

    // 3. Insert weeks for this phase
    for (const week of phase.weeks ?? []) {
      const { data: weekRow, error: weekErr } = await supabase
        .from('program_weeks')
        .insert({
          phase_id: phaseRow.id,
          week_number: week.week_number,
          is_deload: week.is_deload,
          intensity_pct: week.intensity_pct,
          notes: week.notes,
        })
        .select()
        .single();

      if (weekErr || !weekRow) throw new Error(`Failed to create week: ${weekErr?.message}`);

      // 4. Insert sessions for this week
      for (const session of week.sessions ?? []) {
        const { data: sessionRow, error: sessionErr } = await supabase
          .from('program_sessions')
          .insert({
            week_id: weekRow.id,
            day_of_week: session.day_of_week,
            session_type: session.session_type,
            completed: false,
            completed_at: null,
          })
          .select()
          .single();

        if (sessionErr || !sessionRow) throw new Error(`Failed to create session: ${sessionErr?.message}`);

        // 5. Insert exercise slots
        if (session.exercises.length > 0) {
          const slots = session.exercises.map((ex, idx) => ({
            session_id: sessionRow.id,
            exercise_id: ex.exercise_id,
            slot_order: ex.slot_order ?? idx,
            sets: ex.sets,
            reps: ex.reps,
            hold_seconds: ex.hold_seconds,
            weight_pct_1rm: ex.weight_pct_1rm,
            side: ex.side,
            rest_seconds: ex.rest_seconds,
            notes: ex.notes,
            progression_rule: ex.progression_rule,
          }));

          const { error: slotErr } = await supabase
            .from('program_exercise_slots')
            .insert(slots);

          if (slotErr) throw new Error(`Failed to create exercise slots: ${slotErr.message}`);
        }
      }
    }
  }

  return program as TrainingProgram;
}

/**
 * Update top-level program fields (name, status, current_week, etc.)
 */
export async function updateProgram(
  id: string,
  updates: Partial<Pick<TrainingProgram, 'name' | 'description' | 'status' | 'current_week' | 'started_at' | 'completed_at'>>
): Promise<TrainingProgram> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('training_programs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to update program: ${error?.message}`);
  return data as TrainingProgram;
}

/**
 * Get the currently active program (there should only be one).
 */
export async function getActiveProgram(): Promise<TrainingProgram | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('training_programs')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code === 'PGRST116') return null; // no rows
  if (error) throw new Error(`Failed to fetch active program: ${error.message}`);
  return data as TrainingProgram;
}

/**
 * Get full program detail with nested phases → weeks → sessions → exercise slots.
 */
export async function getProgramDetail(programId: string): Promise<TrainingProgram | null> {
  const supabase = getSupabase();

  // Fetch program
  const { data: program, error: pErr } = await supabase
    .from('training_programs')
    .select('*')
    .eq('id', programId)
    .single();

  if (pErr) {
    if (pErr.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch program: ${pErr.message}`);
  }

  // Fetch phases
  const { data: phases, error: phErr } = await supabase
    .from('program_phases')
    .select('*')
    .eq('program_id', programId)
    .order('phase_number', { ascending: true });

  if (phErr) throw new Error(`Failed to fetch phases: ${phErr.message}`);

  // Fetch all weeks for this program's phases
  const phaseIds = (phases ?? []).map((p: { id: string }) => p.id);
  let allWeeks: Record<string, unknown>[] = [];
  if (phaseIds.length > 0) {
    const { data: weeks, error: wErr } = await supabase
      .from('program_weeks')
      .select('*')
      .in('phase_id', phaseIds)
      .order('week_number', { ascending: true });
    if (wErr) throw new Error(`Failed to fetch weeks: ${wErr.message}`);
    allWeeks = weeks ?? [];
  }

  // Fetch all sessions for these weeks
  const weekIds = allWeeks.map((w) => w.id as string);
  let allSessions: Record<string, unknown>[] = [];
  if (weekIds.length > 0) {
    const { data: sessions, error: sErr } = await supabase
      .from('program_sessions')
      .select('*')
      .in('week_id', weekIds)
      .order('day_of_week', { ascending: true });
    if (sErr) throw new Error(`Failed to fetch sessions: ${sErr.message}`);
    allSessions = sessions ?? [];
  }

  // Fetch all exercise slots for these sessions
  const sessionIds = allSessions.map((s) => s.id as string);
  let allSlots: Record<string, unknown>[] = [];
  if (sessionIds.length > 0) {
    const { data: slots, error: slErr } = await supabase
      .from('program_exercise_slots')
      .select('*')
      .in('session_id', sessionIds)
      .order('slot_order', { ascending: true });
    if (slErr) throw new Error(`Failed to fetch exercise slots: ${slErr.message}`);
    allSlots = slots ?? [];
  }

  // Assemble the tree
  const slotsBySession = groupBy(allSlots, 'session_id');
  const sessionsWithExercises = allSessions.map((s) => ({
    ...s,
    exercises: (slotsBySession[s.id as string] ?? []) as unknown as ProgramExerciseSlot[],
  })) as unknown as (ProgramSession & { week_id: string })[];

  const sessionsByWeek = groupByTyped(sessionsWithExercises, 'week_id');
  const weeksWithSessions = allWeeks.map((w) => ({
    ...w,
    sessions: (sessionsByWeek[w.id as string] ?? []) as ProgramSession[],
  })) as unknown as (ProgramWeek & { phase_id: string })[];

  const weeksByPhase = groupByTyped(weeksWithSessions, 'phase_id');
  const phasesWithWeeks: ProgramPhase[] = (phases ?? []).map((p: Record<string, unknown>) => ({
    ...(p as unknown as ProgramPhase),
    weeks: (weeksByPhase[p.id as string] ?? []) as ProgramWeek[],
  }));

  return {
    ...(program as unknown as TrainingProgram),
    phases: phasesWithWeeks,
  };
}

/**
 * Mark the current week as complete and advance to next week.
 * If it's the last week, marks the program as completed.
 */
export async function advanceWeek(programId: string): Promise<TrainingProgram> {
  const program = await getActiveProgram();
  if (!program || program.id !== programId) {
    throw new Error('Program not found or not active');
  }

  const nextWeek = program.current_week + 1;
  if (nextWeek > program.duration_weeks) {
    // Program complete!
    return updateProgram(programId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      current_week: program.current_week,
    });
  }

  return updateProgram(programId, { current_week: nextWeek });
}

/**
 * Mark a session as completed.
 */
export async function completeSession(sessionId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('program_sessions')
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw new Error(`Failed to complete session: ${error.message}`);
}

/**
 * Get all sessions for a specific week (by program week number).
 */
export async function getWeekSessions(programId: string, weekNumber: number): Promise<ProgramSession[]> {
  const detail = await getProgramDetail(programId);
  if (!detail?.phases) return [];

  for (const phase of detail.phases) {
    for (const week of phase.weeks ?? []) {
      if (week.week_number === weekNumber) {
        return week.sessions ?? [];
      }
    }
  }
  return [];
}

/**
 * Delete a program and all its nested data (cascade handles it).
 */
export async function deleteProgram(programId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('training_programs')
    .delete()
    .eq('id', programId);

  if (error) throw new Error(`Failed to delete program: ${error.message}`);
}

// ── Helpers ────────────────────────────────────────────────────────

function groupBy<T extends Record<string, unknown>>(items: T[], key: string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const k = String(item[key] ?? '');
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupByTyped<T>(items: T[], key: keyof T & string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const k = String(item[key] ?? '');
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}
