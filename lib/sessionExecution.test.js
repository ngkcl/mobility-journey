/**
 * Tests for TP-004: Session Execution helpers
 */
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
  test('creates correct number of sets from slot', () => {
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
    expect(result).toHaveLength(3);
    expect(result[0].completed).toBe(false);
    expect(result[0].reps).toBe('12');
    expect(result[0].weight).toBe('40');
    expect(result[0].duration).toBe('');
    expect(result[0].side).toBe('both');
  });

  test('uses hold_seconds for duration-based exercises', () => {
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
    expect(result).toHaveLength(2);
    expect(result[0].reps).toBe('');
    expect(result[0].duration).toBe('30');
    expect(result[0].weight).toBe('');
    expect(result[0].side).toBe('left');
  });

  test('defaults side to bilateral when null', () => {
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
    expect(result[0].side).toBe('bilateral');
  });
});

// ── calculateProgress ──────────────────────────────────────────

describe('calculateProgress', () => {
  test('empty exercises returns 0% with no crash', () => {
    const result = calculateProgress([]);
    expect(result.pct).toBe(0);
    expect(result.allDone).toBe(false);
    expect(result.totalSets).toBe(0);
  });

  test('partial completion calculates correctly', () => {
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
    expect(result.totalSets).toBe(4);
    expect(result.completedSets).toBe(3);
    expect(result.pct).toBe(75);
    expect(result.completedExercises).toBe(1); // only second exercise fully done
    expect(result.totalExercises).toBe(2);
    expect(result.allDone).toBe(false);
  });

  test('all done when every set is completed', () => {
    const exercises = [
      {
        sets: [
          { completed: true, reps: '10', weight: '', duration: '', side: 'bilateral', rpe: '' },
        ],
      },
    ];
    const result = calculateProgress(exercises);
    expect(result.allDone).toBe(true);
    expect(result.pct).toBe(100);
  });
});

// ── buildSessionSummary ────────────────────────────────────────

describe('buildSessionSummary', () => {
  test('calculates programmed vs actual correctly', () => {
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

    expect(result.programmedSets).toBe(3);
    expect(result.programmedReps).toBe(30);
    expect(result.actualSets).toBe(2);
    expect(result.actualReps).toBe(20);
    expect(result.actualVolume).toBe(400); // 10*20 + 10*20
    expect(result.durationMinutes).toBe(30);
    expect(result.completionPct).toBe(67); // 2/3 rounded
    expect(result.exercisesCompleted).toBe(0); // not all sets done
  });

  test('exercise counts as completed when all sets done', () => {
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

    expect(result.exercisesCompleted).toBe(1);
    expect(result.completionPct).toBe(100);
    expect(result.durationMinutes).toBe(15);
  });
});

// ── sessionTypeToWorkoutType ───────────────────────────────────

describe('sessionTypeToWorkoutType', () => {
  test('maps gym correctly', () => {
    expect(sessionTypeToWorkoutType('gym')).toBe('gym');
  });
  test('maps active_recovery to cardio', () => {
    expect(sessionTypeToWorkoutType('active_recovery')).toBe('cardio');
  });
  test('maps corrective', () => {
    expect(sessionTypeToWorkoutType('corrective')).toBe('corrective');
  });
  test('unknown maps to other', () => {
    expect(sessionTypeToWorkoutType('unknown')).toBe('other');
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

  test('finds session by sessionId', () => {
    const { session, week, phase } = findSession(mockProgram, 1, 0, 'sess-2');
    expect(session?.id).toBe('sess-2');
    expect(session?.session_type).toBe('gym');
    expect(week?.week_number).toBe(1);
    expect(phase?.focus).toBe('release');
  });

  test('finds session by day of week', () => {
    const { session } = findSession(mockProgram, 1, 1);
    expect(session?.id).toBe('sess-1');
  });

  test('returns null session when no match', () => {
    const { session, week } = findSession(mockProgram, 1, 5);
    expect(session).toBeNull();
    expect(week?.week_number).toBe(1); // week found, session not
  });

  test('returns all nulls for missing week', () => {
    const { session, week, phase } = findSession(mockProgram, 99, 1);
    expect(session).toBeNull();
    expect(week).toBeNull();
    expect(phase).toBeNull();
  });
});

// ── setLogToWorkoutSet ─────────────────────────────────────────

describe('setLogToWorkoutSet', () => {
  test('converts filled set log', () => {
    const log = {
      completed: true,
      reps: '12',
      weight: '45',
      duration: '',
      side: 'left',
      rpe: '8',
    };
    const result = setLogToWorkoutSet(log);
    expect(result.reps).toBe(12);
    expect(result.weight_kg).toBe(45);
    expect(result.duration_seconds).toBeNull();
    expect(result.side).toBe('left');
    expect(result.rpe).toBe(8);
    expect(result.notes).toBeNull();
  });

  test('handles empty strings as null', () => {
    const log = {
      completed: false,
      reps: '',
      weight: '',
      duration: '',
      side: 'bilateral',
      rpe: '',
    };
    const result = setLogToWorkoutSet(log);
    expect(result.reps).toBeNull();
    expect(result.weight_kg).toBeNull();
    expect(result.duration_seconds).toBeNull();
    expect(result.rpe).toBeNull();
  });
});
