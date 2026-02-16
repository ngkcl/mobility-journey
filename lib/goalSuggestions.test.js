/**
 * Tests for goalSuggestions.ts — suggestion logic (GL-007)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'Node16',
  moduleResolution: 'Node16',
});
require('ts-node/register/transpile-only');

const { suggestionToGoalInput, suggestGoals, fetchUserMetrics } = require('./goalSuggestions');

describe('suggestionToGoalInput', () => {
  it('converts a pain reduction suggestion to CreateGoalInput', () => {
    const suggestion = {
      type: 'pain_reduction',
      title: 'Reduce pain to 3/10',
      description: 'Your average pain is 6.5.',
      reason: 'Pain is above threshold.',
      startingValue: 7,
      targetValue: 3,
      deadlineWeeks: 8,
      priority: 1,
      icon: 'heart-outline',
    };

    const input = suggestionToGoalInput(suggestion);

    assert.equal(input.type, 'pain_reduction');
    assert.equal(input.title, 'Reduce pain to 3/10');
    assert.equal(input.starting_value, 7);
    assert.equal(input.target_value, 3);
    assert.equal(input.current_value, 7);
    assert.equal(input.status, 'active');
    assert.equal(input.description, 'Your average pain is 6.5.');

    const deadline = new Date(input.deadline);
    const now = new Date();
    const diffDays = Math.round((deadline - now) / (1000 * 60 * 60 * 24));
    assert.ok(diffDays >= 54, `Expected >=54 days, got ${diffDays}`);
    assert.ok(diffDays <= 58, `Expected <=58 days, got ${diffDays}`);
  });

  it('converts a symmetry improvement suggestion', () => {
    const suggestion = {
      type: 'symmetry_improvement',
      title: 'Reach 85% symmetry',
      description: 'Your symmetry score is 70%.',
      reason: 'Improving symmetry reduces injury risk.',
      startingValue: 70,
      targetValue: 85,
      deadlineWeeks: 8,
      priority: 4,
      icon: 'git-compare-outline',
    };

    const input = suggestionToGoalInput(suggestion);
    assert.equal(input.type, 'symmetry_improvement');
    assert.equal(input.target_value, 85);
    assert.equal(input.starting_value, 70);
    assert.equal(input.current_value, 70);
    assert.equal(input.status, 'active');
  });

  it('converts a workout streak suggestion with correct deadline', () => {
    const suggestion = {
      type: 'workout_streak',
      title: 'Build a 7-day streak',
      description: 'Your current streak is 1 day.',
      reason: 'Streaks build momentum.',
      startingValue: 1,
      targetValue: 7,
      deadlineWeeks: 2,
      priority: 7,
      icon: 'flame-outline',
    };

    const input = suggestionToGoalInput(suggestion);
    assert.equal(input.type, 'workout_streak');
    assert.equal(input.target_value, 7);
    assert.equal(input.starting_value, 1);

    const deadline = new Date(input.deadline);
    const now = new Date();
    const diffDays = Math.round((deadline - now) / (1000 * 60 * 60 * 24));
    assert.ok(diffDays >= 12, `Expected >=12 days, got ${diffDays}`);
    assert.ok(diffDays <= 16, `Expected <=16 days, got ${diffDays}`);
  });

  it('converts a consistency suggestion', () => {
    const suggestion = {
      type: 'workout_consistency',
      title: 'Hit 70% weekly consistency',
      description: 'You did 2 workouts this week.',
      reason: 'Building a habit.',
      startingValue: 29,
      targetValue: 70,
      deadlineWeeks: 4,
      priority: 6,
      icon: 'calendar-outline',
    };

    const input = suggestionToGoalInput(suggestion);
    assert.equal(input.type, 'workout_consistency');
    assert.equal(input.target_value, 70);
    assert.equal(input.current_value, 29);
  });

  it('converts a posture score suggestion', () => {
    const suggestion = {
      type: 'posture_score',
      title: 'Improve posture to 75/100',
      description: 'Your posture score is 55.',
      reason: 'Small daily corrections help.',
      startingValue: 55,
      targetValue: 75,
      deadlineWeeks: 8,
      priority: 5,
      icon: 'body-outline',
    };

    const input = suggestionToGoalInput(suggestion);
    assert.equal(input.type, 'posture_score');
    assert.equal(input.target_value, 75);
    assert.equal(input.starting_value, 55);
  });
});

describe('module exports', () => {
  it('exports suggestGoals function', () => {
    assert.equal(typeof suggestGoals, 'function');
  });

  it('exports fetchUserMetrics function', () => {
    assert.equal(typeof fetchUserMetrics, 'function');
  });

  it('exports suggestionToGoalInput function', () => {
    assert.equal(typeof suggestionToGoalInput, 'function');
  });
});
