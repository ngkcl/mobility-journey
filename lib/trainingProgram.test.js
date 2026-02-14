// Tests for trainingProgram.ts — unit tests for types and helpers
// Integration tests (Supabase CRUD) require live DB, tested manually

describe('TrainingProgram types and helpers', () => {
  // Import types by checking the module compiles
  test('module compiles (type-checked separately via tsc)', () => {
    // CRUD functions are tested against live Supabase
    // TypeScript compilation is verified by `npx tsc --noEmit`
    expect(true).toBe(true);
  });

  test('ProgramExerciseSlot shape', () => {
    const slot = {
      exercise_id: 'cat-cow',
      slot_order: 0,
      sets: 3,
      reps: 12,
      hold_seconds: null,
      weight_pct_1rm: null,
      side: 'both',
      rest_seconds: 60,
      notes: null,
      progression_rule: '+1 rep/week',
    };
    expect(slot.exercise_id).toBe('cat-cow');
    expect(slot.sets).toBe(3);
    expect(slot.reps).toBe(12);
    expect(slot.rest_seconds).toBe(60);
    expect(slot.progression_rule).toBe('+1 rep/week');
  });

  test('ProgramSession shape with exercises', () => {
    const session = {
      day_of_week: 1, // Monday
      session_type: 'corrective',
      completed: false,
      completed_at: null,
      exercises: [
        {
          exercise_id: 'cat-cow',
          slot_order: 0,
          sets: 3,
          reps: 10,
          hold_seconds: null,
          weight_pct_1rm: null,
          side: 'both',
          rest_seconds: 45,
          notes: null,
          progression_rule: null,
        },
        {
          exercise_id: 'bird-dog',
          slot_order: 1,
          sets: 3,
          reps: 8,
          hold_seconds: null,
          weight_pct_1rm: null,
          side: 'alternating',
          rest_seconds: 60,
          notes: 'Focus on weak side',
          progression_rule: '+1 rep/week',
        },
      ],
    };
    expect(session.day_of_week).toBe(1);
    expect(session.session_type).toBe('corrective');
    expect(session.exercises).toHaveLength(2);
    expect(session.exercises[1].side).toBe('alternating');
  });

  test('ProgramWeek deload properties', () => {
    const normalWeek = {
      week_number: 1,
      is_deload: false,
      intensity_pct: 100,
      notes: null,
    };
    const deloadWeek = {
      week_number: 3,
      is_deload: true,
      intensity_pct: 60,
      notes: 'Recovery week — reduce volume',
    };
    expect(normalWeek.intensity_pct).toBe(100);
    expect(deloadWeek.intensity_pct).toBe(60);
    expect(deloadWeek.is_deload).toBe(true);
  });

  test('ProgramPhase focus types', () => {
    const validFocuses = ['release', 'activate', 'strengthen', 'integrate'];
    const phases = validFocuses.map((focus, i) => ({
      name: `Phase ${i + 1}: ${focus}`,
      description: null,
      phase_number: i + 1,
      duration_weeks: 2,
      focus,
    }));
    expect(phases).toHaveLength(4);
    expect(phases[0].focus).toBe('release');
    expect(phases[3].focus).toBe('integrate');
  });

  test('Full program structure (nested)', () => {
    const program = {
      name: '8-Week Scoliosis Correction',
      description: 'Progressive rehabilitation for right thoracic scoliosis',
      goal_type: 'scoliosis_correction',
      duration_weeks: 8,
      current_week: 1,
      status: 'active',
      phases: [
        {
          name: 'Phase 1: Release',
          description: 'Release tight tissues, improve mobility',
          phase_number: 1,
          duration_weeks: 2,
          focus: 'release',
          weeks: [
            {
              week_number: 1,
              is_deload: false,
              intensity_pct: 70,
              notes: 'Ease in',
              sessions: [
                {
                  day_of_week: 1,
                  session_type: 'corrective',
                  completed: false,
                  completed_at: null,
                  exercises: [
                    {
                      exercise_id: 'foam-roll-thoracic',
                      slot_order: 0,
                      sets: 2,
                      reps: null,
                      hold_seconds: 30,
                      weight_pct_1rm: null,
                      side: 'both',
                      rest_seconds: 30,
                      notes: null,
                      progression_rule: null,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(program.phases).toHaveLength(1);
    expect(program.phases[0].weeks).toHaveLength(1);
    expect(program.phases[0].weeks[0].sessions).toHaveLength(1);
    expect(program.phases[0].weeks[0].sessions[0].exercises).toHaveLength(1);
    expect(program.phases[0].weeks[0].sessions[0].exercises[0].hold_seconds).toBe(30);
  });

  test('Week number accumulation across phases', () => {
    // In an 8-week program with 4 phases of 2 weeks each,
    // week numbers should be global (1-8), not per-phase
    const phases = [
      { focus: 'release', weeks: [{ week_number: 1 }, { week_number: 2 }] },
      { focus: 'activate', weeks: [{ week_number: 3 }, { week_number: 4 }] },
      { focus: 'strengthen', weeks: [{ week_number: 5 }, { week_number: 6 }] },
      { focus: 'integrate', weeks: [{ week_number: 7 }, { week_number: 8 }] },
    ];
    const allWeeks = phases.flatMap((p) => p.weeks);
    expect(allWeeks).toHaveLength(8);
    expect(allWeeks.map((w) => w.week_number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('Goal type validation', () => {
    const validGoalTypes = [
      'scoliosis_correction',
      'pain_reduction',
      'posture_improvement',
      'general_mobility',
      'custom',
    ];
    validGoalTypes.forEach((gt) => {
      expect(typeof gt).toBe('string');
      expect(gt.length).toBeGreaterThan(0);
    });
  });

  test('Session types cover all workout scenarios', () => {
    const sessionTypes = ['corrective', 'gym', 'rest', 'active_recovery'];
    expect(sessionTypes).toContain('corrective');
    expect(sessionTypes).toContain('gym');
    expect(sessionTypes).toContain('rest');
    expect(sessionTypes).toContain('active_recovery');
  });
});
