/**
 * Tests for TP-004: Session Execution helpers
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'Node16',
  moduleResolution: 'Node16',
});
require('ts-node/register/transpile-only');

const {
  createSetsForSlot,
  calculateProgress,
  buildSessionSummary,
  sessionTypeToWorkoutType,
  findSession,
  setLogToWorkoutSet,
} = require('./sessionExecution');

// ── createSetsForSlot ──────────────────────────────────────────

describe('createSetsForSlot', () => {
  it('creates correct number of sets from slot', () => {
    const slot = {
      exercise_id: 'ex-1',
      slot_order: 0,
      sets: 3,
      reps: 12,
      hold_seconds: null,
      weight_pct_1rm: 40,
      side: 'both',
      rest_seconds: 60,
      notes: null,
      progression_rule: null,
    };
    const result = createSetsForSlot(slot);
    assert.equal(result.length, 3);
    assert.equal(result[0].completed, false);
    assert.equal(result[0].reps, '12');
    assert.equal(result[0].weight, '40');
    assert.equal(result[0].duration, '');
    assert.equal(result[0].side, 'both');
  });

  it('uses hold_seconds for duration-based exercises', () => {
    const slot = {
      exercise_id: 'ex-2',
      slot_order: 1,
      sets: 2,
      reps: null,
      hold_seconds: 30,
      weight_pct_1rm: null,
      side: 'left',
      rest_seconds: 30,
      notes: null,
      progression_rule: null,
    };
    const result = createSetsForSlot(slot);
    assert.equal(result.length, 2);
    assert.equal(result[0].reps, '');
    assert.equal(result[0].duration, '30');
    assert.equal(result[0].weight, '');
    assert.equal(result[0].side, 'left');
  });

  it('defaults side to bilateral when null', () => {
    const slot = {
      exercise_id: 'ex-3',
      slot_order: 0,
      sets: 1,
      reps: 10,
      hold_seconds: null,
      weight_pct_1rm: null,
      side: null,
      rest_seconds: 45,
      notes: null,
      progression_rule: null,
    };
    const result = createSetsForSlot(slot);
    assert.equal(result[0].side, 'bilateral');
  });
});

// ── calculateProgress ──────────────────────────────────────────

describe('calculateProgress', () => {
  it('empty exercises returns 0% with no crash', () => {
    const result = calculateProgress([]);
    assert.equal(result.pct, 0);
    assert.equal(result.allDone, false);
    assert.equal(result.totalSets, 0);
  });

  it('partial completion calculates correctly', () => {
    const exercises = [
      {
        sets: [
          { completed: true, reps: '10', weight: '', duration: '', side: 'bilateral', rpe: '' },
          { completed: false, reps: '10', weight: '', duration: '', side: 'bilateral', rpe: '' },
        ],
      },
      {
        sets: [
          { completed: true, reps: '8', weight: '20', duration: '', side: 'bilateral', rpe: '' },
          { completed: true, reps: '8', weight: '20', duration: '', side: 'bilateral', rpe: '' },
        ],
      },
    ];
    const result = calculateProgress(exercises);
    assert.equal(result.totalSets, 4);
    assert.equal(result.completedSets, 3);
    assert.equal(result.pct, 75);
    assert.equal(result.completedExercises, 1);
    assert.equal(result.totalExercises, 2);
    assert.equal(result.allDone, false);
  });

  it('all done when every set is completed', () => {
    const exercises = [
      {
        sets: [
          { completed: true, reps: '10', weight: '', duration: '', side: 'bilateral', rpe: '' },
        ],
      },
    ];
    const result = calculateProgress(exercises);
    assert.equal(result.allDone, true);
    assert.equal(result.pct, 100);
  });
});

// ── buildSessionSummary ────────────────────────────────────────

describe('buildSessionSummary', () => {
  it('calculates programmed vs actual correctly', () => {
    const exercises = [
      {
        slot: { sets: 3, reps: 10, hold_seconds: null, weight_pct_1rm: 20 },
        sets: [
          { completed: true, reps: '10', weight: '20', duration: '', side: 'bilateral', rpe: '7' },
          { completed: true, reps: '10', weight: '20', duration: '', side: 'bilateral', rpe: '8' },
          { completed: false, reps: '', weight: '', duration: '', side: 'bilateral', rpe: '' },
        ],
      },
    ];
    const start = new Date('2026-02-15T05:00:00');
    const end = new Date('2026-02-15T05:30:00');
    const result = buildSessionSummary(exercises, start, end);

    assert.equal(result.programmedSets, 3);
    assert.equal(result.programmedReps, 30);
    assert.equal(result.actualSets, 2);
    assert.equal(result.actualReps, 20);
    assert.equal(result.actualVolume, 400);
    assert.equal(result.durationMinutes, 30);
    assert.equal(result.completionPct, 67);
    assert.equal(result.exercisesCompleted, 0);
  });

  it('exercise counts as completed when all sets done', () => {
    const exercises = [
      {
        slot: { sets: 2, reps: 5, hold_seconds: null, weight_pct_1rm: null },
        sets: [
          { completed: true, reps: '5', weight: '', duration: '', side: 'bilateral', rpe: '' },
          { completed: true, reps: '5', weight: '', duration: '', side: 'bilateral', rpe: '' },
        ],
      },
    ];
    const start = new Date('2026-02-15T05:00:00');
    const end = new Date('2026-02-15T05:15:00');
    const result = buildSessionSummary(exercises, start, end);

    assert.equal(result.exercisesCompleted, 1);
    assert.equal(result.completionPct, 100);
    assert.equal(result.durationMinutes, 15);
  });
});

// ── sessionTypeToWorkoutType ───────────────────────────────────

describe('sessionTypeToWorkoutType', () => {
  it('maps gym correctly', () => {
    assert.equal(sessionTypeToWorkoutType('gym'), 'gym');
  });
  it('maps active_recovery to cardio', () => {
    assert.equal(sessionTypeToWorkoutType('active_recovery'), 'cardio');
  });
  it('maps corrective', () => {
    assert.equal(sessionTypeToWorkoutType('corrective'), 'corrective');
  });
  it('unknown maps to other', () => {
    assert.equal(sessionTypeToWorkoutType('unknown'), 'other');
  });
});

// ── findSession ────────────────────────────────────────────────

describe('findSession', () => {
  const mockProgram = {
    id: 'prog-1',
    name: 'Test',
    description: null,
    goal_type: 'scoliosis_correction',
    duration_weeks: 4,
    current_week: 2,
    status: 'active',
    created_at: '2026-02-01',
    started_at: '2026-02-01',
    completed_at: null,
    phases: [
      {
        id: 'phase-1',
        program_id: 'prog-1',
        name: 'Release',
        description: null,
        phase_number: 1,
        duration_weeks: 2,
        focus: 'release',
        weeks: [
          {
            id: 'w1',
            phase_id: 'phase-1',
            week_number: 1,
            is_deload: false,
            intensity_pct: 60,
            notes: null,
            sessions: [
              {
                id: 'sess-1',
                week_id: 'w1',
                day_of_week: 1,
                session_type: 'corrective',
                completed: false,
                completed_at: null,
                exercises: [],
              },
              {
                id: 'sess-2',
                week_id: 'w1',
                day_of_week: 3,
                session_type: 'gym',
                completed: true,
                completed_at: '2026-02-05',
                exercises: [],
              },
            ],
          },
          {
            id: 'w2',
            phase_id: 'phase-1',
            week_number: 2,
            is_deload: false,
            intensity_pct: 65,
            notes: null,
            sessions: [],
          },
        ],
      },
    ],
  };

  it('finds session by sessionId', () => {
    const { session, week, phase } = findSession(mockProgram, 1, 0, 'sess-2');
    assert.equal(session?.id, 'sess-2');
    assert.equal(session?.session_type, 'gym');
    assert.equal(week?.week_number, 1);
    assert.equal(phase?.focus, 'release');
  });

  it('finds session by day of week', () => {
    const { session } = findSession(mockProgram, 1, 1);
    assert.equal(session?.id, 'sess-1');
  });

  it('returns null session when no match', () => {
    const { session, week } = findSession(mockProgram, 1, 5);
    assert.equal(session, null);
    assert.equal(week?.week_number, 1);
  });

  it('returns all nulls for missing week', () => {
    const { session, week, phase } = findSession(mockProgram, 99, 1);
    assert.equal(session, null);
    assert.equal(week, null);
    assert.equal(phase, null);
  });
});

// ── setLogToWorkoutSet ─────────────────────────────────────────

describe('setLogToWorkoutSet', () => {
  it('converts filled set log', () => {
    const log = {
      completed: true,
      reps: '12',
      weight: '45',
      duration: '',
      side: 'left',
      rpe: '8',
    };
    const result = setLogToWorkoutSet(log);
    assert.equal(result.reps, 12);
    assert.equal(result.weight_kg, 45);
    assert.equal(result.duration_seconds, null);
    assert.equal(result.side, 'left');
    assert.equal(result.rpe, 8);
    assert.equal(result.notes, null);
  });

  it('handles empty strings as null', () => {
    const log = {
      completed: false,
      reps: '',
      weight: '',
      duration: '',
      side: 'bilateral',
      rpe: '',
    };
    const result = setLogToWorkoutSet(log);
    assert.equal(result.reps, null);
    assert.equal(result.weight_kg, null);
    assert.equal(result.duration_seconds, null);
    assert.equal(result.rpe, null);
  });
});
