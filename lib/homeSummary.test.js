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

const buildLocalDate = (year, month, day, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute, 0, 0);

test('getTimeOfDay returns morning/afternoon/evening', () => {
  assert.equal(getTimeOfDay(buildLocalDate(2026, 2, 8, 8, 0)), 'morning');
  assert.equal(getTimeOfDay(buildLocalDate(2026, 2, 8, 15, 0)), 'afternoon');
  assert.equal(getTimeOfDay(buildLocalDate(2026, 2, 8, 20, 0)), 'evening');
});

test('buildGreeting uses time of day', () => {
  assert.equal(buildGreeting(buildLocalDate(2026, 2, 8, 8, 0)), 'Good morning');
});

test('formatSessionTime renders 12-hour clock', () => {
  assert.equal(formatSessionTime('09:00'), '9:00 AM');
  assert.equal(formatSessionTime('13:30'), '1:30 PM');
  assert.equal(formatSessionTime('00:15'), '12:15 AM');
});

test('pickDailyTip rotates based on day of year', () => {
  const tips = ['Tip A', 'Tip B'];
  const day1 = buildLocalDate(2026, 1, 1, 8, 0);
  const day2 = buildLocalDate(2026, 1, 2, 8, 0);
  const day3 = buildLocalDate(2026, 1, 3, 8, 0);
  assert.equal(pickDailyTip(tips, day1), 'Tip B');
  assert.equal(pickDailyTip(tips, day2), 'Tip A');
  assert.equal(pickDailyTip(tips, day3), 'Tip B');
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
    buildLocalDate(2026, 2, 8, 14, 0),
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
    buildLocalDate(2026, 2, 8, 23, 0),
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
    buildLocalDate(2026, 2, 8, 10, 0),
    schedule,
    {},
  );

  assert.equal(summary.sessionKey, 'gym');
  assert.equal(summary.label, 'Gym Session');
});
