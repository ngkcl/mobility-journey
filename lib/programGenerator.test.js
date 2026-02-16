// @ts-nocheck
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'Node16',
  moduleResolution: 'Node16',
});
require('ts-node/register/transpile-only');

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
  it('returns pain_reduction for explicit pain goal', () => {
    const ctx = makeContext({ goals: [{ type: 'pain_reduction', target_value: 3 }] });
    assert.equal(inferGoalType(ctx), 'pain_reduction');
  });

  it('returns scoliosis_correction for symmetry goal', () => {
    const ctx = makeContext({ goals: [{ type: 'symmetry_improvement', target_value: 90 }] });
    assert.equal(inferGoalType(ctx), 'scoliosis_correction');
  });

  it('returns pain_reduction for high pain without explicit goal', () => {
    const ctx = makeContext({ metrics: { pain_level: 7, posture_score: 80, symmetry_score: 85 } });
    assert.equal(inferGoalType(ctx), 'pain_reduction');
  });

  it('returns scoliosis_correction for low symmetry', () => {
    const ctx = makeContext({ metrics: { pain_level: 2, posture_score: 80, symmetry_score: 60 } });
    assert.equal(inferGoalType(ctx), 'scoliosis_correction');
  });

  it('returns posture_improvement for low posture score', () => {
    const ctx = makeContext({ metrics: { pain_level: 2, posture_score: 50, symmetry_score: 80 } });
    assert.equal(inferGoalType(ctx), 'posture_improvement');
  });

  it('returns general_mobility when everything is decent', () => {
    const ctx = makeContext({ metrics: { pain_level: 2, posture_score: 80, symmetry_score: 85 } });
    assert.equal(inferGoalType(ctx), 'general_mobility');
  });
});

describe('inferDuration', () => {
  it('returns 4 for beginners', () => {
    const ctx = makeContext({ workoutStats: { total_workouts: 5, avg_sessions_per_week: 2, current_streak: 1, avg_workout_minutes: 30 } });
    assert.equal(inferDuration(ctx, 'general_mobility'), 4);
  });

  it('returns 4 for severe pain', () => {
    const ctx = makeContext({ metrics: { pain_level: 8, posture_score: 50, symmetry_score: 60 } });
    assert.equal(inferDuration(ctx, 'pain_reduction'), 4);
  });

  it('returns 8 for scoliosis correction', () => {
    const ctx = makeContext();
    assert.equal(inferDuration(ctx, 'scoliosis_correction'), 8);
  });

  it('returns 8 for experienced users', () => {
    const ctx = makeContext({ workoutStats: { total_workouts: 50, avg_sessions_per_week: 5, current_streak: 20, avg_workout_minutes: 60 } });
    assert.equal(inferDuration(ctx, 'general_mobility'), 8);
  });

  it('returns 6 for moderate users', () => {
    const ctx = makeContext();
    assert.equal(inferDuration(ctx, 'general_mobility'), 6);
  });
});

describe('inferSessionsPerWeek', () => {
  it('returns 3 for brand new users', () => {
    const ctx = makeContext({ workoutStats: { total_workouts: 2, avg_sessions_per_week: 1, current_streak: 0, avg_workout_minutes: 20 } });
    assert.equal(inferSessionsPerWeek(ctx), 3);
  });

  it('returns 4 for building up', () => {
    const ctx = makeContext({ workoutStats: { total_workouts: 10, avg_sessions_per_week: 2.5, current_streak: 3, avg_workout_minutes: 30 } });
    assert.equal(inferSessionsPerWeek(ctx), 4);
  });

  it('returns 5 for moderate users', () => {
    const ctx = makeContext();
    assert.equal(inferSessionsPerWeek(ctx), 5);
  });

  it('returns 6 for experienced users', () => {
    const ctx = makeContext({ workoutStats: { total_workouts: 100, avg_sessions_per_week: 5.5, current_streak: 30, avg_workout_minutes: 60 } });
    assert.equal(inferSessionsPerWeek(ctx), 6);
  });
});

describe('buildPhases', () => {
  it('creates 4 phases', () => {
    const phases = buildPhases(8, 'scoliosis_correction', makeContext());
    assert.equal(phases.length, 4);
    assert.deepEqual(phases.map(p => p.focus), ['release', 'activate', 'strengthen', 'integrate']);
  });

  it('phase weeks sum to total', () => {
    const ctx = makeContext();
    for (const goalType of ['pain_reduction', 'scoliosis_correction', 'posture_improvement', 'general_mobility']) {
      const phases = buildPhases(6, goalType, ctx);
      const sum = phases.reduce((acc, p) => acc + p.duration_weeks, 0);
      assert.equal(sum, 6);
    }
  });

  it('pain_reduction has longer release phase', () => {
    const pain = buildPhases(8, 'pain_reduction', makeContext());
    const general = buildPhases(8, 'general_mobility', makeContext());
    assert.ok(pain[0].duration_weeks >= general[0].duration_weeks);
  });

  it('scoliosis_correction has longer strengthen phase', () => {
    const scoliosis = buildPhases(8, 'scoliosis_correction', makeContext());
    const strengthenPhase = scoliosis.find(p => p.focus === 'strengthen');
    assert.ok(strengthenPhase.duration_weeks >= 2);
  });

  it('every phase has a name and description', () => {
    const phases = buildPhases(6, 'general_mobility', makeContext());
    for (const phase of phases) {
      assert.ok(phase.name);
      assert.ok(phase.description);
      assert.ok(phase.phase_number > 0);
    }
  });
});

describe('getExercisesForPhase', () => {
  it('release phase includes mobility and stretching', () => {
    const exercises = getExercisesForPhase(mockExercises, 'release');
    const categories = new Set(exercises.map(e => e.category));
    assert.ok(categories.has('mobility'));
    assert.ok(categories.has('stretching'));
    assert.ok(!categories.has('gym_compound'));
  });

  it('activate phase includes corrective exercises', () => {
    const exercises = getExercisesForPhase(mockExercises, 'activate');
    const categories = new Set(exercises.map(e => e.category));
    assert.ok(categories.has('corrective'));
    assert.ok(categories.has('mobility'));
  });

  it('strengthen phase includes gym exercises', () => {
    const exercises = getExercisesForPhase(mockExercises, 'strengthen');
    const categories = new Set(exercises.map(e => e.category));
    assert.ok(categories.has('gym_compound'));
    assert.ok(categories.has('corrective'));
  });

  it('integrate phase includes everything strong', () => {
    const exercises = getExercisesForPhase(mockExercises, 'integrate');
    const categories = new Set(exercises.map(e => e.category));
    assert.ok(categories.has('gym_compound'));
    assert.ok(categories.has('gym_isolation'));
    assert.ok(categories.has('strengthening'));
  });
});

describe('selectExercisesForSession', () => {
  it('selects the requested number of exercises', () => {
    const pool = mockExercises.filter(e => ['corrective', 'mobility'].includes(e.category));
    const selected = selectExercisesForSession(pool, 'corrective', 4, new Set());
    assert.equal(selected.length, 4);
  });

  it('prefers unused exercises', () => {
    const pool = mockExercises.filter(e => e.category === 'corrective');
    const used = new Set(['ex4', 'ex5']);
    const selected = selectExercisesForSession(pool, 'corrective', 2, used);
    const selectedIds = selected.map(e => e.id);
    assert.ok(!selectedIds.includes('ex4'));
    assert.ok(!selectedIds.includes('ex5'));
  });

  it('covers different muscle groups', () => {
    const pool = mockExercises;
    const selected = selectExercisesForSession(pool, 'gym', 5, new Set());
    const muscles = new Set();
    selected.forEach(e => e.target_muscles.forEach(m => muscles.add(m)));
    assert.ok(muscles.size >= 4);
  });

  it('returns empty array for empty pool', () => {
    const selected = selectExercisesForSession([], 'corrective', 5, new Set());
    assert.deepEqual(selected, []);
  });
});

describe('buildExerciseSlots', () => {
  it('release phase has fewer sets', () => {
    const exercises = [mockExercises[0]];
    const slots = buildExerciseSlots(exercises, 'release', 50, false);
    assert.ok(slots[0].sets <= 2);
    assert.equal(slots[0].rest_seconds, 30);
  });

  it('strengthen phase has more sets and weight', () => {
    const exercises = [mockExercises[9]];
    const slots = buildExerciseSlots(exercises, 'strengthen', 80, false);
    assert.ok(slots[0].sets >= 3);
    assert.ok(slots[0].weight_pct_1rm > 0);
    assert.ok(slots[0].progression_rule);
  });

  it('deload reduces sets and reps', () => {
    const exercises = [mockExercises[4]];
    const normal = buildExerciseSlots(exercises, 'activate', 60, false);
    const deload = buildExerciseSlots(exercises, 'activate', 60, true);
    assert.ok(deload[0].sets < normal[0].sets);
  });

  it('side-specific exercises get side=both', () => {
    const exercises = [mockExercises[1]];
    const slots = buildExerciseSlots(exercises, 'release', 50, false);
    assert.equal(slots[0].side, 'both');
  });

  it('hold exercises use hold_seconds instead of reps', () => {
    const exercises = [mockExercises[1]];
    const slots = buildExerciseSlots(exercises, 'release', 50, false);
    assert.ok(slots[0].hold_seconds >= 30);
    assert.equal(slots[0].reps, null);
  });
});

describe('buildWeekSessions', () => {
  it('creates correct number of sessions', () => {
    const sessions = buildWeekSessions('activate', mockExercises, 4, 60, false);
    assert.equal(sessions.length, 4);
  });

  it('sessions have correct day_of_week', () => {
    const sessions = buildWeekSessions('release', mockExercises, 4, 50, false);
    const days = sessions.map(s => s.day_of_week);
    assert.deepEqual(days, [1, 2, 4, 5]);
  });

  it('each session has exercises', () => {
    const sessions = buildWeekSessions('strengthen', mockExercises, 5, 80, false);
    for (const session of sessions) {
      assert.ok(session.exercises.length > 0);
    }
  });

  it('all sessions start as incomplete', () => {
    const sessions = buildWeekSessions('integrate', mockExercises, 3, 75, false);
    for (const session of sessions) {
      assert.equal(session.completed, false);
      assert.equal(session.completed_at, null);
    }
  });
});

describe('buildPhaseWeeks', () => {
  it('creates correct number of weeks', () => {
    const phase = { name: 'Test', description: null, phase_number: 1, duration_weeks: 3, focus: 'activate' };
    const weeks = buildPhaseWeeks(phase, 1, mockExercises, 4, 3);
    assert.equal(weeks.length, 3);
  });

  it('week numbers are sequential', () => {
    const phase = { name: 'Test', description: null, phase_number: 1, duration_weeks: 3, focus: 'release' };
    const weeks = buildPhaseWeeks(phase, 5, mockExercises, 4, 3);
    assert.deepEqual(weeks.map(w => w.week_number), [5, 6, 7]);
  });

  it('deload week at correct interval', () => {
    const phase = { name: 'Test', description: null, phase_number: 1, duration_weeks: 4, focus: 'strengthen' };
    const weeks = buildPhaseWeeks(phase, 1, mockExercises, 4, 3);
    const deloadWeek = weeks.find(w => w.week_number === 3);
    assert.equal(deloadWeek?.is_deload, true);
    assert.ok(deloadWeek?.notes?.includes('Recovery week'));
  });

  it('deload weeks have lower intensity', () => {
    const phase = { name: 'Test', description: null, phase_number: 1, duration_weeks: 4, focus: 'strengthen' };
    const weeks = buildPhaseWeeks(phase, 1, mockExercises, 4, 3);
    const normalWeek = weeks.find(w => !w.is_deload);
    const deloadWeek = weeks.find(w => w.is_deload);
    if (normalWeek && deloadWeek) {
      assert.ok(deloadWeek.intensity_pct < normalWeek.intensity_pct);
    }
  });

  it('intensity progresses within phase', () => {
    const phase = { name: 'Test', description: null, phase_number: 1, duration_weeks: 4, focus: 'strengthen' };
    const weeks = buildPhaseWeeks(phase, 1, mockExercises, 4, 0);
    for (let i = 1; i < weeks.length; i++) {
      assert.ok(weeks[i].intensity_pct >= weeks[i - 1].intensity_pct);
    }
  });
});

describe('generateProgram', () => {
  it('creates a complete program with all fields', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    assert.ok(program.name);
    assert.ok(program.description);
    assert.ok(program.goal_type);
    assert.ok(program.duration_weeks >= 4);
    assert.equal(program.current_week, 1);
    assert.equal(program.status, 'active');
    assert.ok(program.started_at);
    assert.ok(program.phases.length >= 2);
  });

  it('total weeks across phases equals duration_weeks', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    const totalPhaseWeeks = program.phases.reduce((sum, p) => sum + p.duration_weeks, 0);
    assert.equal(totalPhaseWeeks, program.duration_weeks);
  });

  it('all weeks have sessions', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    for (const phase of program.phases) {
      for (const week of phase.weeks ?? []) {
        assert.ok(week.sessions?.length > 0);
      }
    }
  });

  it('all sessions have exercises', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    for (const phase of program.phases) {
      for (const week of phase.weeks ?? []) {
        for (const session of week.sessions ?? []) {
          assert.ok(session.exercises.length > 0);
        }
      }
    }
  });

  it('respects config overrides', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx, {
      totalWeeks: 4,
      sessionsPerWeek: 3,
      goalType: 'pain_reduction',
    });
    assert.equal(program.duration_weeks, 4);
    assert.equal(program.goal_type, 'pain_reduction');
    const firstWeek = program.phases[0]?.weeks?.[0];
    assert.equal(firstWeek?.sessions?.length, 3);
  });

  it('week numbers are globally sequential', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    const allWeekNumbers = [];
    for (const phase of program.phases) {
      for (const week of phase.weeks ?? []) {
        allWeekNumbers.push(week.week_number);
      }
    }
    for (let i = 0; i < allWeekNumbers.length; i++) {
      assert.equal(allWeekNumbers[i], i + 1);
    }
  });

  it('pain_reduction gets shorter program', () => {
    const ctx = makeContext({ metrics: { pain_level: 8, posture_score: 50, symmetry_score: 60 } });
    const program = generateProgram(ctx);
    assert.equal(program.duration_weeks, 4);
    assert.equal(program.goal_type, 'pain_reduction');
  });
});

describe('summarizeProgram', () => {
  it('summarizes program correctly', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    const summary = summarizeProgram(program);
    assert.equal(summary.name, program.name);
    assert.equal(summary.goalType, program.goal_type);
    assert.equal(summary.totalWeeks, program.duration_weeks);
    assert.ok(summary.totalSessions > 0);
    assert.ok(summary.totalExerciseSlots > 0);
    assert.equal(summary.phases.length, program.phases.length);
  });

  it('phase summaries sum to totals', () => {
    const ctx = makeContext();
    const program = generateProgram(ctx);
    const summary = summarizeProgram(program);
    const sessionSum = summary.phases.reduce((s, p) => s + p.sessions, 0);
    const exerciseSum = summary.phases.reduce((s, p) => s + p.exercises, 0);
    assert.equal(sessionSum, summary.totalSessions);
    assert.equal(exerciseSum, summary.totalExerciseSlots);
  });
});
