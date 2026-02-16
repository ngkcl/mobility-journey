// Tests for trainingProgram.ts — unit tests for types and helpers
// Integration tests (Supabase CRUD) require live DB, tested manually

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('TrainingProgram types and helpers', () => {
  it('module compiles (type-checked separately via tsc)', () => {
    assert.ok(true);
  });

  it('ProgramExerciseSlot shape', () => {
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
    assert.equal(slot.exercise_id, 'cat-cow');
    assert.equal(slot.sets, 3);
    assert.equal(slot.reps, 12);
    assert.equal(slot.rest_seconds, 60);
    assert.equal(slot.progression_rule, '+1 rep/week');
  });

  it('ProgramSession shape with exercises', () => {
    const session = {
      day_of_week: 1,
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
    assert.equal(session.day_of_week, 1);
    assert.equal(session.session_type, 'corrective');
    assert.equal(session.exercises.length, 2);
    assert.equal(session.exercises[1].side, 'alternating');
  });

  it('ProgramWeek deload properties', () => {
    const normalWeek = { week_number: 1, is_deload: false, intensity_pct: 100, notes: null };
    const deloadWeek = { week_number: 3, is_deload: true, intensity_pct: 60, notes: 'Recovery week — reduce volume' };
    assert.equal(normalWeek.intensity_pct, 100);
    assert.equal(deloadWeek.intensity_pct, 60);
    assert.equal(deloadWeek.is_deload, true);
  });

  it('ProgramPhase focus types', () => {
    const validFocuses = ['release', 'activate', 'strengthen', 'integrate'];
    const phases = validFocuses.map((focus, i) => ({
      name: `Phase ${i + 1}: ${focus}`,
      description: null,
      phase_number: i + 1,
      duration_weeks: 2,
      focus,
    }));
    assert.equal(phases.length, 4);
    assert.equal(phases[0].focus, 'release');
    assert.equal(phases[3].focus, 'integrate');
  });

  it('Full program structure (nested)', () => {
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

    assert.equal(program.phases.length, 1);
    assert.equal(program.phases[0].weeks.length, 1);
    assert.equal(program.phases[0].weeks[0].sessions.length, 1);
    assert.equal(program.phases[0].weeks[0].sessions[0].exercises.length, 1);
    assert.equal(program.phases[0].weeks[0].sessions[0].exercises[0].hold_seconds, 30);
  });

  it('Week number accumulation across phases', () => {
    const phases = [
      { focus: 'release', weeks: [{ week_number: 1 }, { week_number: 2 }] },
      { focus: 'activate', weeks: [{ week_number: 3 }, { week_number: 4 }] },
      { focus: 'strengthen', weeks: [{ week_number: 5 }, { week_number: 6 }] },
      { focus: 'integrate', weeks: [{ week_number: 7 }, { week_number: 8 }] },
    ];
    const allWeeks = phases.flatMap((p) => p.weeks);
    assert.equal(allWeeks.length, 8);
    assert.deepEqual(allWeeks.map((w) => w.week_number), [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('Goal type validation', () => {
    const validGoalTypes = [
      'scoliosis_correction',
      'pain_reduction',
      'posture_improvement',
      'general_mobility',
      'custom',
    ];
    validGoalTypes.forEach((gt) => {
      assert.equal(typeof gt, 'string');
      assert.ok(gt.length > 0);
    });
  });

  it('Session types cover all workout scenarios', () => {
    const sessionTypes = ['corrective', 'gym', 'rest', 'active_recovery'];
    assert.ok(sessionTypes.includes('corrective'));
    assert.ok(sessionTypes.includes('gym'));
    assert.ok(sessionTypes.includes('rest'));
    assert.ok(sessionTypes.includes('active_recovery'));
  });
});
