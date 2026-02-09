const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'Node16',
  moduleResolution: 'Node16',
});
require('ts-node/register/transpile-only');

const {
  buildGreeting,
  buildNextSessionSummary,
  formatSessionTime,
  getTimeOfDay,
  pickDailyTip,
} = require('./homeSummary');
const { DEFAULT_WORKOUT_SCHEDULE } = require('./workoutSchedule');

const buildDate = (iso) => new Date(iso);

test('getTimeOfDay returns morning/afternoon/evening', () => {
  assert.equal(getTimeOfDay(buildDate('2026-02-08T08:00:00')), 'morning');
  assert.equal(getTimeOfDay(buildDate('2026-02-08T15:00:00')), 'afternoon');
  assert.equal(getTimeOfDay(buildDate('2026-02-08T20:00:00')), 'evening');
});

test('buildGreeting uses time of day', () => {
  assert.equal(buildGreeting(buildDate('2026-02-08T08:00:00')), 'Good morning');
});

test('formatSessionTime renders 12-hour clock', () => {
  assert.equal(formatSessionTime('09:00'), '9:00 AM');
  assert.equal(formatSessionTime('13:30'), '1:30 PM');
  assert.equal(formatSessionTime('00:15'), '12:15 AM');
});

test('pickDailyTip rotates based on day of year', () => {
  const tips = ['Tip A', 'Tip B'];
  const day1 = buildDate('2026-01-01T08:00:00');
  const day2 = buildDate('2026-01-02T08:00:00');
  const day3 = buildDate('2026-01-03T08:00:00');
  const tip1 = pickDailyTip(tips, day1);
  const tip2 = pickDailyTip(tips, day2);
  const tip3 = pickDailyTip(tips, day3);
  assert.notEqual(tip1, tip2);
  assert.equal(tip1, tip3);
});

test('buildNextSessionSummary picks upcoming corrective session', () => {
  const schedule = {
    ...DEFAULT_WORKOUT_SCHEDULE,
    sessions: {
      morning: '09:00',
      midday: '13:30',
      evening: '21:00',
    },
  };

  const summary = buildNextSessionSummary(
    buildDate('2026-02-08T14:00:00'),
    schedule,
    {},
  );

  assert.equal(summary.sessionKey, 'evening');
  assert.equal(summary.label, 'Evening Corrective');
});

test('buildNextSessionSummary rolls to tomorrow when late', () => {
  const schedule = {
    ...DEFAULT_WORKOUT_SCHEDULE,
    sessions: {
      morning: '09:00',
      midday: '13:30',
      evening: '21:00',
    },
  };

  const summary = buildNextSessionSummary(
    buildDate('2026-02-08T23:00:00'),
    schedule,
    {},
  );

  assert.equal(summary.sessionKey, 'morning');
  assert.equal(summary.isTomorrow, true);
});

test('buildNextSessionSummary uses gym session on non-corrective gym day', () => {
  const schedule = {
    ...DEFAULT_WORKOUT_SCHEDULE,
    correctiveDays: {
      ...DEFAULT_WORKOUT_SCHEDULE.correctiveDays,
      sunday: false,
    },
    gymDays: {
      ...DEFAULT_WORKOUT_SCHEDULE.gymDays,
      sunday: true,
    },
  };

  const summary = buildNextSessionSummary(
    buildDate('2026-02-08T10:00:00'),
    schedule,
    {},
  );

  assert.equal(summary.sessionKey, 'gym');
  assert.equal(summary.label, 'Gym Session');
});
