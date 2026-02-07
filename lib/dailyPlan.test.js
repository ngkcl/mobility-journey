const { test } = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { normalizeDailyPlan, normalizeReasoning } = require('./dailyPlan');

test('normalizeDailyPlan provides defaults for missing sections', () => {
  const plan = normalizeDailyPlan(null);
  assert.equal(plan.morning.title, 'Morning');
  assert.equal(plan.afternoon.title, 'Afternoon');
  assert.equal(plan.evening.title, 'Evening');
  assert.equal(plan.gym, null);
  assert.deepEqual(plan.morning.exercises, []);
});

test('normalizeDailyPlan sanitizes exercise fields', () => {
  const plan = normalizeDailyPlan({
    morning: {
      title: '  AM ',
      exercises: [
        {
          name: '  Side Plank ',
          sets: 3,
          reps: null,
          duration_seconds: 30,
          side: 'left',
          notes: '  hold steady ',
          reason: '  strengthen left side ',
        },
        {
          name: '  ',
          sets: NaN,
          reps: 8,
          duration_seconds: undefined,
          side: 'invalid',
        },
      ],
    },
  });

  assert.equal(plan.morning.title, 'AM');
  assert.equal(plan.morning.exercises.length, 2);
  assert.equal(plan.morning.exercises[0].name, 'Side Plank');
  assert.equal(plan.morning.exercises[0].notes, 'hold steady');
  assert.equal(plan.morning.exercises[1].name, 'Untitled');
  assert.equal(plan.morning.exercises[1].sets, null);
  assert.equal(plan.morning.exercises[1].side, null);
});

test('normalizeReasoning filters empty values', () => {
  const reasoning = normalizeReasoning([' ', 'Keep it light', 12, null, 'Focus on left']);
  assert.deepEqual(reasoning, ['Keep it light', 'Focus on left']);
});
