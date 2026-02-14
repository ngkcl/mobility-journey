// @ts-nocheck
const {
  inferGoalType,
  inferDuration,
  inferSessionsPerWeek,
  buildPhases,
  getExercisesForPhase,
  selectExercisesForSession,
  buildExerciseSlots,
  buildWeekSessions,
  buildPhaseWeeks,
  generateProgram,
  summarizeProgram,
} = require('./programGenerator');

// ── Test Fixtures ──────────────────────────────────────────────────

const mockExercises = [
  { id: 'ex1', name: 'Cat-Cow', category: 'mobility', target_muscles: ['spine', 'thoracic'], sets_default: 2, reps_default: 10, duration_seconds_default: null, side_specific: false },
  { id: 'ex2', name: 'Hip Flexor Stretch', category: 'stretching', target_muscles: ['hip flexors', 'quads'], sets_default: 2, reps_default: null, duration_seconds_default: 30, side_specific: true },
  { id: 'ex3', name: 'Foam Rolling', category: 'mobility', target_muscles: ['right QL', 'right lat'], sets_default: 2, reps_default: null, duration_seconds_default: 60, side_specific: false },
  { id: 'ex4', name: 'Bird Dogs', category: 'corrective', target_muscles: ['core', 'glutes', 'back'], sets_default: 3, reps_default: 8, duration_seconds_default: null, side_specific: false },
  { id: 'ex5', name: 'Dead Bugs', category: 'corrective', target_muscles: ['core', 'obliques'], sets_default: 3, reps_default: 10, duration_seconds_default: null, side_specific: false },
  { id: 'ex6', name: 'Side Plank', category: 'corrective', target_muscles: ['obliques', 'core'], sets_default: 3, reps_default: null, duration_seconds_default: 30, side_specific: true },
  { id: 'ex7', name: 'Clamshells', category: 'corrective', target_muscles: ['glute med'], sets_default: 3, reps_default: 12, duration_seconds_default: null, side_specific: true },
  { id: 'ex8', name: 'Wall Angels', category: 'strengthening', target_muscles: ['thoracic', 'shoulders'], sets_default: 3, reps_default: 10, duration_seconds_default: null, side_specific: false },
  { id: 'ex9', name: 'Band Pull-Aparts', category: 'strengthening', target_muscles: ['upper back', 'shoulders'], sets_default: 3, reps_default: 15, duration_seconds_default: null, side_specific: false },
  { id: 'ex10', name: 'Back Squat', category: 'gym_compound', target_muscles: ['quads', 'glutes', 'core'], sets_default: 4, reps_default: 8, duration_seconds_default: null, side_specific: false },
  { id: 'ex11', name: 'Deadlift', category: 'gym_compound', target_muscles: ['glutes', 'hamstrings', 'back'], sets_default: 4, reps_default: 5, duration_seconds_default: null, side_specific: false },
  { id: 'ex12', name: 'Bench Press', category: 'gym_compound', target_muscles: ['chest', 'triceps'], sets_default: 4, reps_default: 8, duration_seconds_default: null, side_specific: false },
  { id: 'ex13', name: 'Barbell Row', category: 'gym_compound', target_muscles: ['lats', 'mid back'], sets_default: 4, reps_default: 8, duration_seconds_default: null, side_specific: false },
  { id: 'ex14', name: 'Bicep Curl', category: 'gym_isolation', target_muscles: ['biceps'], sets_default: 3, reps_default: 12, duration_seconds_default: null, side_specific: false },
  { id: 'ex15', name: 'Calf Raise', category: 'gym_isolation', target_muscles: ['calves'], sets_default: 3, reps_default: 15, duration_seconds_default: null, side_specific: false },
  { id: 'ex16', name: 'Schroth Breathing', category: 'mobility', target_muscles: ['diaphragm', 'intercostals'], sets_default: 2, reps_default: null, duration_seconds_default: 60, side_specific: false },
];

function makeContext(overrides = {}) {
  return {
    metrics: { pain_level: 5, posture_score: 65, symmetry_score: 72 },
    goals: [],
    workoutStats: { total_workouts: 20, avg_sessions_per_week: 3, current_streak: 5, avg_workout_minutes: 45 },
    exercises: mockExercises,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('inferGoalType', () => {
  test('returns pain_reduction for explicit pain goal', () => {
    const ctx = makeContext({ goals: [{ type: 'pain_reduction', target_value: 3 }] });
    expect(inferGoalType(ctx)).toBe('pain_reduction');
  });

  test('returns scoliosis_correction for symmetry goal', () => {
    const ctx = makeContext({ goals: [{ type: 'symmetry_improvement', target_value: 90 }] });
    expect(inferGoalType(ctx)).toBe('scoliosis_correction');
  });

  test('returns pain_reduction for high pain without explicit goal', () => {
    const ctx = makeContext({ metrics: { pain_level: 7, posture_score: 80, symmetry_score: 85 } });
    expect(inferGoalType(ctx)).toBe('pain_reduction');
  });

  test('returns scoliosis_correction for low symmetry', () => {
    const ctx = makeContext({ metrics: { pain_level: 2, posture_score: 80, symmetry_score: 60 } });
    expect(inferGoalType(ctx)).toBe('scoliosis_correction');
  });

  test('returns posture_improvement for low posture score', () => {
    const ctx = makeContext({ metrics: { pain_level: 2, posture_score: 50, symmetry_score: 80 } });
    expect(inferGoalType(ctx)).toBe('posture_improvement');
  });

  test('returns general_mobility when everything is decent', () => {
    const ctx = makeContext({ metrics: { pain_level: 2, posture_score: 80, symmetry_score: 85 } });
    expect(inferGoalType(ctx)).toBe('general_mobility');
  });
});

describe('inferDuration', () => {
  test('returns 4 for beginners', () => {
    const ctx = makeContext({ workoutStats: { total_workouts: 5, avg_sessions_per_week: 2, current_streak: 1, avg_workout_minutes: 30 } });
    expect(inferDuration(ctx, 'general_mobility')).toBe(4);
  });

  test('returns 4 for severe pain', () => {
    const ctx = makeContext({ metrics: { pain_level: 8, posture_score: 50, symmetry_score: 60 } });
    expect(inferDuration(ctx, 'pain_reduction')).toBe(4);
  });

  test('returns 8 for scoliosis correction', () => {
    const ctx = makeContext();
    expect(inferDuration(ctx, 'scoliosis_correction')).toBe(8);
  });

  test('returns 8 for experienced users', () => {
    const ctx = makeContext({ workoutStats: { total_workouts: 50, avg_sessions_per_week: 5, current_streak: 20, avg_workout_minutes: 60 } });
    expect(inferDuration(ctx, 'general_mobility')).toBe(8);
  });

  test('returns 6 for moderate users', () => {
    const ctx = makeContext();
    expect(inferDuration(ctx, 'general_mobility')).toBe(6);
  });
});

describe('inferSessionsPerWeek', () => {
  test('returns 3 for brand new users', () => {
    const ctx = makeContext({ workoutStats: { total_workouts: 2, avg_sessions_per_week: 1, current_streak: 0, avg_workout_minutes: 20 } });
    expect(inferSessionsPerWeek(ctx)).toBe(3);
  });

  test('returns 4 for building up', () => {
    const ctx = makeContext({ workoutStats: { total_workouts: 10, avg_sessions_per_week: 2.5, current_streak: 3, avg_workout_minutes: 30 } });
    expect(inferSessionsPerWeek(ctx)).toBe(4);
  });

  test('returns 5 for moderate users', () => {
    const ctx = makeContext();
    expect(inferSessionsPerWeek(ctx)).toBe(5);
  });

  test('returns 6 for experienced users', () => {
    const ctx = makeContext({ workoutStats: { total_workouts: 100, avg_sessions_per_week: 5.5, current_streak: 30, avg_workout_minutes: 60 } });
    expect(inferSessionsPerWeek(ctx)).toBe(6);
  });
});

describe('buildPhases', () => {
  test('creates 4 phases', () => {
    const phases = buildPhases(8, 'scoliosis_correction', makeContext());
    expect(phases).toHaveLength(4);
    expect(phases.map(p => p.focus)).toEqual(['release', 'activate', 'strengthen', 'integrate']);
  });

  test('phase weeks sum to total', () => {
    const ctx = makeContext();
    for (const goalType of ['pain_reduction', 'scoliosis_correction', 'posture_improvement', 'general_mobility']) {
      const phases = buildPhases(6, goalType, ctx);
      const sum = phases.reduce((acc, p) => acc + p.duration_weeks, 0);
      expect(sum).toBe(6);
    }
  });

  test('pain_reduction has longer release phase', () => {
    const pain = buildPhases(8, 'pain_reduction', makeContext());
    const general = buildPhases(8, 'general_mobility', makeContext());
    expect(pain[0].duration_weeks).toBeGreaterThanOrEqual(general[0].duration_weeks);
  });

  test('scoliosis_correction has longer strengthen phase', () => {
    const scoliosis = buildPhases(8, 'scoliosis_correction', makeContext());
    const strengthenPhase = scoliosis.find(p => p.focus === 'strengthen');
    expect(strengthenPhase.duration_weeks).toBeGreaterThanOrEqual(2);
  });

  test('every phase has a name and description', () => {
    const phases = buildPhases(6, 'general_mobility', makeContext());
    for (const phase of phases) {
      expect(phase.name).toBeTruthy();
      expect(phase.description).toBeTruthy();
      expect(phase.phase_number).toBeGreaterThan(0);
    }
  });
});

describe('getExercisesForPhase', () => {
  test('release phase includes mobility and stretching', () => {
    const exercises = getExercisesForPhase(mockExercises, 'release');
    const categories = new Set(exercises.map(e => e.category));
    expect(categories.has('mobility')).toBe(true);
    expect(categories.has('stretching')).toBe(true);
    expect(categories.has('gym_compound')).toBe(false);
  });

  test('activate phase includes corrective exercises', () => {
    const exercises = getExercisesForPhase(mockExercises, 'activate');
    const categories = new Set(exercises.map(e => e.category));
    expect(categories.has('corrective')).toBe(true);
    expect(categories.has('mobility')).toBe(true);
  });

  test('strengthen phase includes gym exercises', () => {
    const exercises = getExercisesForPhase(mockExercises, 'strengthen');
    const categories = new Set(exercises.map(e => e.category));
    expect(categories.has('gym_compound')).toBe(true);
    expect(categories.has('corrective')).toBe(true);
  });

  test('integrate phase includes everything strong', () => {
    const exercises = getExercisesForPhase(mockExercises, 'integrate');
    const categories = new Set(exercises.map(e => e.category));
    expect(categories.has('gym_compound')).toBe(true);
    expect(categories.has('gym_isolation')).toBe(true);
    expect(categories.has('strengthening')).toBe(true);
  });
});

describe('selectExercisesForSession', () => {
  test('selects the requested number of exercises', () => {
    const pool = mockExercises.filter(e => ['corrective', 'mobility'].includes(e.category));
    const selected = selectExercisesForSession(pool, 'corrective', 4, new Set());
    expect(selected.length).toBe(4);
  });

  test('prefers unused exercises', () => {
    const pool = mockExercises.filter(e => e.category === 'corrective');
    const used = new Set(['ex4', 'ex5']); // Bird Dogs, Dead Bugs
    const selected = selectExercisesForSession(pool, 'corrective', 2, used);
    // Should prefer Side Plank and Clamshells (unused)
    const selectedIds = selected.map(e => e.id);
    expect(selectedIds).not.toContain('ex4');
    expect(selectedIds).not.toContain('ex5');
  });

  test('covers different muscle groups', () => {
    const pool = mockExercises;
    const selected = selectExercisesForSession(pool, 'gym', 5, new Set());
    const muscles = new Set();
    selected.forEach(e => e.target_muscles.forEach(m => muscles.add(m)));
    expect(muscles.size).toBeGreaterThanOrEqual(4);
  });

  test('returns empty array for empty pool', () => {
    const selected = selectExercisesForSession([], 'corrective', 5, new Set());
    expect(selected).toEqual([]);
  });
});

describe('buildExerciseSlots', () => {
  test('release phase has fewer sets', () => {
    const exercises = [mockExercises[0]]; // Cat-Cow (mobility)
    const slots = buildExerciseSlots(exercises, 'release', 50, false);
    expect(slots[0].sets).toBeLessThanOrEqual(2);
    expect(slots[0].rest_seconds).toBe(30);
  });

  test('strengthen phase has more sets and weight', () => {
    const exercises = [mockExercises[9]]; // Back Squat (gym_compound)
    const slots = buildExerciseSlots(exercises, 'strengthen', 80, false);
    expect(slots[0].sets).toBeGreaterThanOrEqual(3);
    expect(slots[0].weight_pct_1rm).toBeGreaterThan(0);
    expect(slots[0].progression_rule).toBeTruthy();
  });

  test('deload reduces sets and reps', () => {
    const exercises = [mockExercises[4]]; // Dead Bugs
    const normal = buildExerciseSlots(exercises, 'activate', 60, false);
    const deload = buildExerciseSlots(exercises, 'activate', 60, true);
    expect(deload[0].sets).toBeLessThan(normal[0].sets);
  });

  test('side-specific exercises get side=both', () => {
    const exercises = [mockExercises[1]]; // Hip Flexor Stretch (side_specific=true)
    const slots = buildExerciseSlots(exercises, 'release', 50, false);
    expect(slots[0].side).toBe('both');
  });

  test('hold exercises use hold_seconds instead of reps', () => {
    const exercises = [mockExercises[1]]; // Hip Flexor Stretch (duration_seconds_default=30)
    const slots = buildExerciseSlots(exercises, 'release', 50, false);
    expect(slots[0].hold_seconds).toBeGreaterThanOrEqual(30);
    expect(slots[0].reps).toBeNull();
  });
});

describe('buildWeekSessions', () => {
  test('creates correct number of sessions', () => {
    const sessions = buildWeekSessions('activate', mockExercises, 4, 60, false);
    expect(sessions.length).toBe(4);
  });

  test('sessions have correct day_of_week', () => {
    const sessions = buildWeekSessions('release', mockExercises, 4, 50, false);
    const days = sessions.map(s => s.day_of_week);
    expect(days).toEqual([1, 2, 4, 5]); // Mon, Tue, Thu, Fri
  });

  test('each session has exercises', () => {
    const sessions = buildWeekSessions('strengthen', mockExercises, 5, 80, false);
    for (const session of sessions) {
      expect(session.exercises.length).toBeGreaterThan(0);
    }
  });

  test('all sessions start as incomplete', () => {
    const sessions = buildWeekSessions('integrate', mockExercises, 3, 75, false);
    for (const session of sessions) {
      expect(session.completed).toBe(false);
      expect(session.completed_at).toBeNull();
    }
  });
});

describe('buildPhaseWeeks', () => {
  test('creates correct number of weeks', () => {
    const phase = { name: 'Test', description: null, phase_number: 1, duration_weeks: 3, focus: 'activate' };
    const weeks = buildPhaseWeeks(phase, 1, mockExercises, 4, 3);
    expect(weeks.length).toBe(3);
  });

  test('week numbers are sequential', () => {
    const phase = { name: 'Test', description: null, phase_number: 1, duration_weeks: 3, focus: 'release' };
    const weeks = buildPhaseWeeks(phase, 5, mockExercises, 4, 3);
    expect(weeks.map(w => w.week_number)).toEqual([5, 6, 7]);
  });

  test('deload week at correct interval', () => {
    const phase = { name: 'Test', description: null, phase_number: 1, duration_weeks: 4, focus: 'strengthen' };
    const weeks = buildPhaseWeeks(phase, 1, mockExercises, 4, 3);
    // Week 3 should be deload (every 3rd week)
    const deloadWeek = weeks.find(w => w.week_number === 3);
    expect(deloadWeek?.is_deload).toBe(true);
    expect(deloadWeek?.notes).toContain('Recovery week');
  });

  test('deload weeks have lower intensity', () => {
    const phase = { name: 'Test', description: null, phase_number: 1, duration_weeks: 4, focus: 'strengthen' };
    const weeks = buildPhaseWeeks(phase, 1, mockExercises, 4, 3);
    const normalWeek = weeks.find(w => !w.is_deload);
    const deloadWeek = weeks.find(w => w.is_deload);
    if (normalWeek && deloadWeek) {
      expect(deloadWeek.intensity_pct).toBeLessThan(normalWeek.intensity_pct);
    }
  });

  test('intensity progresses within phase', () => {
    const phase = { name: 'Test', description: null, phase_number: 1, duration_weeks: 4, focus: 'strengthen' };
    const weeks = buildPhaseWeeks(phase, 1, mockExercises, 4, 0); // no deload
    // Each week should have equal or higher intensity than the previous
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i].intensity_pct).toBeGreaterThanOrEqual(weeks[i - 1].intensity_pct);
    }
  });
});

describe('generateProgram', () => {
  test('creates a complete program with all fields', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);

    expect(program.name).toBeTruthy();
    expect(program.description).toBeTruthy();
    expect(program.goal_type).toBeTruthy();
    expect(program.duration_weeks).toBeGreaterThanOrEqual(4);
    expect(program.current_week).toBe(1);
    expect(program.status).toBe('active');
    expect(program.started_at).toBeTruthy();
    expect(program.phases.length).toBeGreaterThanOrEqual(2);
  });

  test('total weeks across phases equals duration_weeks', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    const totalPhaseWeeks = program.phases.reduce((sum, p) => sum + p.duration_weeks, 0);
    expect(totalPhaseWeeks).toBe(program.duration_weeks);
  });

  test('all weeks have sessions', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    for (const phase of program.phases) {
      for (const week of phase.weeks ?? []) {
        expect(week.sessions?.length).toBeGreaterThan(0);
      }
    }
  });

  test('all sessions have exercises', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    for (const phase of program.phases) {
      for (const week of phase.weeks ?? []) {
        for (const session of week.sessions ?? []) {
          expect(session.exercises.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test('respects config overrides', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx, {
      totalWeeks: 4,
      sessionsPerWeek: 3,
      goalType: 'pain_reduction',
    });

    expect(program.duration_weeks).toBe(4);
    expect(program.goal_type).toBe('pain_reduction');
    // Each week should have 3 sessions
    const firstWeek = program.phases[0]?.weeks?.[0];
    expect(firstWeek?.sessions?.length).toBe(3);
  });

  test('week numbers are globally sequential', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    const allWeekNumbers = [];
    for (const phase of program.phases) {
      for (const week of phase.weeks ?? []) {
        allWeekNumbers.push(week.week_number);
      }
    }
    // Should be 1, 2, 3, ... N
    for (let i = 0; i < allWeekNumbers.length; i++) {
      expect(allWeekNumbers[i]).toBe(i + 1);
    }
  });

  test('pain_reduction gets shorter program', () => {
    const ctx = makeContext({ metrics: { pain_level: 8, posture_score: 50, symmetry_score: 60 } });
    const program = generateProgram(ctx);
    expect(program.duration_weeks).toBe(4);
    expect(program.goal_type).toBe('pain_reduction');
  });
});

describe('summarizeProgram', () => {
  test('summarizes program correctly', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    const summary = summarizeProgram(program);

    expect(summary.name).toBe(program.name);
    expect(summary.goalType).toBe(program.goal_type);
    expect(summary.totalWeeks).toBe(program.duration_weeks);
    expect(summary.totalSessions).toBeGreaterThan(0);
    expect(summary.totalExerciseSlots).toBeGreaterThan(0);
    expect(summary.phases.length).toBe(program.phases.length);
  });

  test('phase summaries sum to totals', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    const summary = summarizeProgram(program);

    const sessionSum = summary.phases.reduce((s, p) => s + p.sessions, 0);
    const exerciseSum = summary.phases.reduce((s, p) => s + p.exercises, 0);
    expect(sessionSum).toBe(summary.totalSessions);
    expect(exerciseSum).toBe(summary.totalExerciseSlots);
  });
});
