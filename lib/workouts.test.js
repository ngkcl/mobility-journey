const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { computeSetVolume, computeWorkoutSummary } = require('./workouts');

test('computeSetVolume returns 0 when reps or weight missing', () => {
  assert.equal(computeSetVolume({ reps: null, weight_kg: 20 }), 0);
  assert.equal(computeSetVolume({ reps: 10, weight_kg: null }), 0);
  assert.equal(computeSetVolume({ reps: 10, weight_kg: 20 }), 200);
});

test('computeWorkoutSummary totals volume and left/right splits', () => {
  const summary = computeWorkoutSummary([
    {
      sets: [
        { reps: 10, weight_kg: 20, duration_seconds: null, side: 'left', rpe: null, notes: null },
        { reps: 8, weight_kg: 20, duration_seconds: null, side: 'right', rpe: null, notes: null },
        { reps: null, weight_kg: null, duration_seconds: 30, side: null, rpe: null, notes: null },
      ],
    },
  ]);

  assert.equal(summary.totalSets, 3);
  assert.equal(summary.totalReps, 18);
  assert.equal(summary.totalVolumeKg, 360);
  assert.equal(summary.totalDurationSeconds, 30);
  assert.equal(summary.leftVolumeKg, 200);
  assert.equal(summary.rightVolumeKg, 160);
  assert.equal(summary.leftSets, 1);
  assert.equal(summary.rightSets, 1);
  assert.equal(summary.imbalancePct, 20);
});
