const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  DEFAULT_WORKOUT_SCHEDULE,
  normalizeWorkoutSchedule,
} = require('./workoutSchedule');

test('normalizeWorkoutSchedule returns defaults for empty input', () => {
  assert.deepEqual(normalizeWorkoutSchedule(), DEFAULT_WORKOUT_SCHEDULE);
  assert.deepEqual(normalizeWorkoutSchedule(null), DEFAULT_WORKOUT_SCHEDULE);
});

test('normalizeWorkoutSchedule keeps valid session times', () => {
  const result = normalizeWorkoutSchedule({
    sessions: {
      morning: '06:15',
      midday: '12:05',
      evening: '22:45',
    },
  });

  assert.equal(result.sessions.morning, '06:15');
  assert.equal(result.sessions.midday, '12:05');
  assert.equal(result.sessions.evening, '22:45');
});

test('normalizeWorkoutSchedule falls back for invalid values', () => {
  const result = normalizeWorkoutSchedule({
    sessions: {
      morning: '6am',
      midday: '25:00',
      evening: 10,
    },
    correctiveDays: {
      monday: 'yes',
    },
    gymDays: {
      friday: 1,
    },
    notificationsEnabled: 'true',
  });

  assert.deepEqual(result, DEFAULT_WORKOUT_SCHEDULE);
});
