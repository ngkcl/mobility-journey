const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { buildWorkoutCSV, computeWorkoutSummary, buildWorkoutExportPayload } = require('./exportData');

const baseWorkout = (overrides = {}) => ({
  id: 'w1',
  date: '2026-02-07',
  type: 'gym',
  started_at: null,
  ended_at: null,
  duration_minutes: 45,
  notes: null,
  energy_level_before: 7,
  energy_level_after: 8,
  pain_level_before: 3,
  pain_level_after: 2,
  ...overrides,
});

const baseExercise = (overrides = {}) => ({
  id: 'e1',
  workout_id: 'w1',
  exercise_id: 'ex1',
  order_index: 0,
  sets: [],
  ...overrides,
});

test('buildWorkoutCSV generates valid CSV with header', () => {
  const history = [
    {
      workout: baseWorkout({ id: 'w1', date: '2026-02-07' }),
      exercises: [
        baseExercise({
          exercise_id: 'ex1',
          sets: [
            { reps: 10, weight_kg: 50, duration_seconds: null, side: 'left', rpe: 7, notes: null },
            { reps: 8, weight_kg: 55, duration_seconds: null, side: 'right', rpe: 8, notes: 'felt strong' },
          ],
        }),
      ],
    },
  ];

  const exerciseMap = new Map([
    ['ex1', { id: 'ex1', name: 'Dumbbell Row' }],
  ]);

  const csv = buildWorkoutCSV(history, exerciseMap);
  const lines = csv.split('\n');

  // Check header
  assert.ok(lines[0].includes('Date'));
  assert.ok(lines[0].includes('Exercise'));
  assert.ok(lines[0].includes('Weight (kg)'));

  // Check data rows
  assert.equal(lines.length, 3); // header + 2 sets
  assert.ok(lines[1].includes('Dumbbell Row'));
  assert.ok(lines[1].includes('left'));
  assert.ok(lines[2].includes('right'));
});

test('buildWorkoutCSV escapes commas and quotes in set notes', () => {
  const history = [
    {
      workout: baseWorkout(),
      exercises: [
        baseExercise({
          sets: [
            { reps: 10, weight_kg: 50, duration_seconds: null, side: null, rpe: null, notes: 'Test, with comma' },
            { reps: 8, weight_kg: 55, duration_seconds: null, side: null, rpe: null, notes: 'Note "quoted"' },
          ],
        }),
      ],
    },
  ];

  const exerciseMap = new Map();
  const csv = buildWorkoutCSV(history, exerciseMap);

  // Commas should be quoted
  assert.ok(csv.includes('"Test, with comma"'));
  // Quotes should be escaped
  assert.ok(csv.includes('""quoted""'));
});

test('computeWorkoutSummary calculates correct totals', () => {
  const history = [
    {
      workout: baseWorkout({ duration_minutes: 30, pain_level_before: 4, pain_level_after: 2 }),
      exercises: [
        baseExercise({
          sets: [
            { reps: 10, weight_kg: 20, duration_seconds: null, side: 'left', rpe: null, notes: null },
            { reps: 10, weight_kg: 20, duration_seconds: null, side: 'right', rpe: null, notes: null },
          ],
        }),
      ],
    },
    {
      workout: baseWorkout({ id: 'w2', date: '2026-02-08', duration_minutes: 45, pain_level_before: 3, pain_level_after: 2, type: 'corrective' }),
      exercises: [
        baseExercise({
          sets: [
            { reps: 12, weight_kg: 15, duration_seconds: null, side: 'left', rpe: null, notes: null },
          ],
        }),
      ],
    },
  ];

  const summary = computeWorkoutSummary(history);

  assert.equal(summary.totalWorkouts, 2);
  assert.equal(summary.totalDuration, 75); // 30 + 45
  assert.equal(summary.totalSets, 3); // 2 + 1
  assert.equal(summary.totalReps, 32); // 10 + 10 + 12
  assert.equal(summary.totalVolume, 580); // (10*20) + (10*20) + (12*15)
  assert.equal(summary.leftVolumeTotal, 380); // (10*20) + (12*15)
  assert.equal(summary.rightVolumeTotal, 200); // 10*20
  assert.equal(summary.avgPainChange, -1.5); // avg of -2 and -1
  assert.deepEqual(summary.workoutsByType, { gym: 1, corrective: 1 });
});

test('buildWorkoutExportPayload includes summary and workouts', () => {
  const history = [
    {
      workout: baseWorkout(),
      exercises: [
        baseExercise({
          exercise_id: 'ex1',
          sets: [{ reps: 10, weight_kg: 50, duration_seconds: null, side: null, rpe: null, notes: null }],
        }),
      ],
    },
  ];

  const exerciseMap = new Map([
    ['ex1', { id: 'ex1', name: 'Bench Press', category: 'gym_compound' }],
  ]);

  const payload = buildWorkoutExportPayload(history, exerciseMap);

  assert.ok(payload.exportedAt);
  assert.ok(payload.summary);
  assert.equal(payload.workouts.length, 1);
  assert.equal(payload.workouts[0].exercises[0].name, 'Bench Press');
  assert.equal(payload.workouts[0].exercises[0].sets.length, 1);
});
