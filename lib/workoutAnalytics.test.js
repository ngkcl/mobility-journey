const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  buildWeeklyConsistency,
  computeWorkoutStreak,
  buildWeeklyWorkoutVolume,
  buildExerciseWeightTrend,
  buildSideVolumeTrend,
} = require('./workoutAnalytics');

const baseWorkout = (overrides = {}) => ({
  id: 'w1',
  date: '2026-02-03',
  type: 'corrective',
  started_at: null,
  ended_at: null,
  duration_minutes: null,
  notes: null,
  energy_level_before: null,
  energy_level_after: null,
  pain_level_before: null,
  pain_level_after: null,
  ...overrides,
});

const baseExercise = (overrides = {}) => ({
  id: 'we1',
  workout_id: 'w1',
  exercise_id: 'e1',
  order_index: 0,
  sets: [],
  ...overrides,
});

const getWeekStartKey = (value) => {
  const date = new Date(`${value}T00:00:00`);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
};

test('buildWeeklyConsistency counts corrective sessions per week', () => {
  const history = [
    { workout: baseWorkout({ id: 'w1', date: '2026-02-03', type: 'corrective' }), exercises: [] },
    { workout: baseWorkout({ id: 'w2', date: '2026-02-04', type: 'corrective' }), exercises: [] },
    { workout: baseWorkout({ id: 'w3', date: '2026-02-05', type: 'gym' }), exercises: [] },
  ];

  const points = buildWeeklyConsistency(history);
  assert.equal(points.length, 1);
  assert.equal(points[0].weekStart, getWeekStartKey('2026-02-03'));
  assert.equal(points[0].sessions, 2);
  assert.equal(points[0].completionPct, Math.round((2 / 21) * 100));
});

test('computeWorkoutStreak counts consecutive workout days', () => {
  // Use dates relative to today so the streak is considered "active"
  const today = new Date();
  const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  
  const todayStr = formatDate(today);
  const yesterdayStr = formatDate(new Date(today.getTime() - 24 * 60 * 60 * 1000));
  const twoDaysAgoStr = formatDate(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000));
  const fourDaysAgoStr = formatDate(new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000));
  
  const history = [
    { workout: baseWorkout({ id: 'w1', date: todayStr }), exercises: [] },
    { workout: baseWorkout({ id: 'w2', date: yesterdayStr }), exercises: [] },
    { workout: baseWorkout({ id: 'w3', date: fourDaysAgoStr }), exercises: [] }, // gap
  ];

  assert.equal(computeWorkoutStreak(history), 2);
  
  // Test broken streak (no recent workouts)
  const oldHistory = [
    { workout: baseWorkout({ id: 'w1', date: '2020-01-05' }), exercises: [] },
    { workout: baseWorkout({ id: 'w2', date: '2020-01-04' }), exercises: [] },
  ];
  assert.equal(computeWorkoutStreak(oldHistory), 0); // Streak broken because not recent
});

test('buildWeeklyWorkoutVolume aggregates sets, reps, and volume', () => {
  const history = [
    {
      workout: baseWorkout({ id: 'w1', date: '2026-02-03' }),
      exercises: [
        baseExercise({
          sets: [
            { reps: 10, weight_kg: 20, duration_seconds: null, side: null, rpe: null, notes: null },
            { reps: 8, weight_kg: 20, duration_seconds: null, side: null, rpe: null, notes: null },
          ],
        }),
      ],
    },
  ];

  const points = buildWeeklyWorkoutVolume(history);
  assert.equal(points.length, 1);
  assert.equal(points[0].weekStart, getWeekStartKey('2026-02-03'));
  assert.equal(points[0].totalSets, 2);
  assert.equal(points[0].totalReps, 18);
  assert.equal(points[0].totalVolumeKg, 360);
});

test('buildExerciseWeightTrend returns max weight per day', () => {
  const history = [
    {
      workout: baseWorkout({ id: 'w1', date: '2026-02-03' }),
      exercises: [
        baseExercise({
          exercise_id: 'e1',
          sets: [
            { reps: 5, weight_kg: 20, duration_seconds: null, side: null, rpe: null, notes: null },
            { reps: 5, weight_kg: 30, duration_seconds: null, side: null, rpe: null, notes: null },
          ],
        }),
      ],
    },
    {
      workout: baseWorkout({ id: 'w2', date: '2026-02-04' }),
      exercises: [
        baseExercise({
          exercise_id: 'e1',
          sets: [{ reps: 5, weight_kg: 25, duration_seconds: null, side: null, rpe: null, notes: null }],
        }),
      ],
    },
  ];

  const points = buildExerciseWeightTrend(history, 'e1');
  assert.deepEqual(points, [
    { date: '2026-02-03', weightKg: 30 },
    { date: '2026-02-04', weightKg: 25 },
  ]);
});

test('buildSideVolumeTrend splits left vs right volume per week', () => {
  const history = [
    {
      workout: baseWorkout({ id: 'w1', date: '2026-02-03' }),
      exercises: [
        baseExercise({
          exercise_id: 'e2',
          sets: [
            { reps: 10, weight_kg: 10, duration_seconds: null, side: 'left', rpe: null, notes: null },
            { reps: 8, weight_kg: 10, duration_seconds: null, side: 'right', rpe: null, notes: null },
          ],
        }),
      ],
    },
  ];

  const points = buildSideVolumeTrend(history, 'e2');
  assert.equal(points.length, 1);
  assert.equal(points[0].weekStart, getWeekStartKey('2026-02-03'));
  assert.equal(points[0].leftVolumeKg, 100);
  assert.equal(points[0].rightVolumeKg, 80);
});
