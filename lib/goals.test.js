const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'Node16',
  moduleResolution: 'Node16',
});
require('ts-node/register/transpile-only');

const { computeGoalProgress } = require('./goals');

const now = new Date();
const dayMs = 24 * 60 * 60 * 1000;

const buildGoal = (overrides = {}) => ({
  id: 'goal-1',
  type: 'symmetry_improvement',
  title: 'Improve symmetry',
  description: null,
  target_value: 85,
  starting_value: 70,
  current_value: 76,
  deadline: new Date(now.getTime() + 20 * dayMs).toISOString(),
  created_at: new Date(now.getTime() - 10 * dayMs).toISOString(),
  completed_at: null,
  status: 'active',
  ...overrides,
});

test('computeGoalProgress calculates percentage for improvement goals', () => {
  const summary = computeGoalProgress(
    buildGoal({
      type: 'symmetry_improvement',
      starting_value: 70,
      current_value: 76,
      target_value: 85,
    }),
  );

  assert.equal(summary.percentComplete, 40);
  assert.equal(summary.trend, 'improving');
});

test('computeGoalProgress handles pain reduction where lower is better', () => {
  const summary = computeGoalProgress(
    buildGoal({
      type: 'pain_reduction',
      starting_value: 8,
      current_value: 5,
      target_value: 3,
    }),
  );

  assert.equal(summary.percentComplete, 60);
  assert.equal(summary.trend, 'improving');
});

test('computeGoalProgress marks completed goals at 100%', () => {
  const summary = computeGoalProgress(
    buildGoal({
      type: 'posture_score',
      starting_value: 70,
      current_value: 85,
      target_value: 85,
      status: 'completed',
      completed_at: now.toISOString(),
    }),
  );

  assert.equal(summary.percentComplete, 100);
  assert.equal(summary.onTrack, true);
  assert.ok(summary.projectedCompletion);
});

test('computeGoalProgress reports worsening trend when moving away from target', () => {
  const summary = computeGoalProgress(
    buildGoal({
      type: 'symmetry_improvement',
      starting_value: 70,
      current_value: 66,
      target_value: 85,
    }),
  );

  assert.equal(summary.percentComplete, 0);
  assert.equal(summary.trend, 'worsening');
});

test('computeGoalProgress marks overdue incomplete goals as off track', () => {
  const summary = computeGoalProgress(
    buildGoal({
      starting_value: 70,
      current_value: 73,
      target_value: 85,
      created_at: new Date(now.getTime() - 20 * dayMs).toISOString(),
      deadline: new Date(now.getTime() - 1 * dayMs).toISOString(),
    }),
  );

  assert.equal(summary.onTrack, false);
});

test('computeGoalProgress predicts completion when progress trend is positive', () => {
  const summary = computeGoalProgress(
    buildGoal({
      starting_value: 60,
      current_value: 70,
      target_value: 80,
      created_at: new Date(now.getTime() - 10 * dayMs).toISOString(),
      deadline: new Date(now.getTime() + 20 * dayMs).toISOString(),
    }),
  );

  assert.ok(summary.projectedCompletion);
});
