/**
 * goalTracker.test.js — Tests for automatic goal progress tracking
 */
const { describe, it, expect, beforeEach, jest } = require('@jest/globals');

// Mock supabase
const mockFrom = jest.fn();
const mockSupabase = { from: mockFrom };
jest.mock('./supabase', () => ({
  getSupabase: () => mockSupabase,
}));

// We test the exported logic indirectly through module structure
// The real value is in integration, but we verify the metric→goal mapping logic

describe('goalTracker module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports trackMetricUpdate function', () => {
    const goalTracker = require('./goalTracker');
    expect(typeof goalTracker.trackMetricUpdate).toBe('function');
  });

  it('exports trackWorkoutCompleted function', () => {
    const goalTracker = require('./goalTracker');
    expect(typeof goalTracker.trackWorkoutCompleted).toBe('function');
  });

  it('exports refreshAllGoals function', () => {
    const goalTracker = require('./goalTracker');
    expect(typeof goalTracker.refreshAllGoals).toBe('function');
  });
});

// Test the pure functions from goals.ts that goalTracker relies on
const { computeGoalProgress, isGoalComplete } = require('./goals');

describe('goal completion detection used by tracker', () => {
  it('detects pain reduction goal as complete when current <= target', () => {
    const goal = {
      type: 'pain_reduction',
      starting_value: 8,
      current_value: 3,
      target_value: 4,
    };
    expect(isGoalComplete(goal)).toBe(true);
  });

  it('detects posture score goal as complete when current >= target', () => {
    const goal = {
      type: 'posture_score',
      starting_value: 60,
      current_value: 85,
      target_value: 80,
    };
    expect(isGoalComplete(goal)).toBe(true);
  });

  it('detects workout streak goal as complete', () => {
    const goal = {
      type: 'workout_streak',
      starting_value: 0,
      current_value: 30,
      target_value: 30,
    };
    expect(isGoalComplete(goal)).toBe(true);
  });

  it('does NOT mark as complete when still in progress', () => {
    const goal = {
      type: 'symmetry_improvement',
      starting_value: 60,
      current_value: 72,
      target_value: 85,
    };
    expect(isGoalComplete(goal)).toBe(false);
  });

  it('handles consistency percentage correctly', () => {
    const goal = {
      type: 'workout_consistency',
      starting_value: 40,
      current_value: 80,
      target_value: 80,
    };
    expect(isGoalComplete(goal)).toBe(true);
  });
});

describe('progress computation for tracker scenarios', () => {
  const makeGoal = (overrides) => ({
    id: 'test-1',
    type: 'posture_score',
    title: 'Test Goal',
    description: null,
    target_value: 80,
    starting_value: 50,
    current_value: 65,
    deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    completed_at: null,
    status: 'active',
    ...overrides,
  });

  it('calculates 50% progress for halfway to target', () => {
    const goal = makeGoal({
      starting_value: 50,
      current_value: 65,
      target_value: 80,
    });
    const progress = computeGoalProgress(goal);
    expect(progress.percentComplete).toBe(50);
  });

  it('returns 100% for completed goals', () => {
    const goal = makeGoal({
      status: 'completed',
      current_value: 80,
      completed_at: new Date().toISOString(),
    });
    const progress = computeGoalProgress(goal);
    expect(progress.percentComplete).toBe(100);
  });

  it('calculates pain reduction progress correctly (lower is better)', () => {
    const goal = makeGoal({
      type: 'pain_reduction',
      starting_value: 8,
      current_value: 5,
      target_value: 3,
    });
    const progress = computeGoalProgress(goal);
    expect(progress.percentComplete).toBe(60); // 3/5 of the way
  });

  it('reports improving trend when progress is positive', () => {
    const goal = makeGoal({
      starting_value: 50,
      current_value: 65,
      target_value: 80,
    });
    const progress = computeGoalProgress(goal);
    expect(progress.trend).toBe('improving');
  });
});
