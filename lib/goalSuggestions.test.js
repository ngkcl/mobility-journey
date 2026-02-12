/**
 * Tests for goalSuggestions.ts — suggestion logic (GL-007)
 */
const { describe, it, expect, beforeEach, jest } = require('@jest/globals');

// Mock supabase
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockGte = jest.fn();
const mockLt = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockSingle = jest.fn();

const chainMethods = () => ({
  select: mockSelect,
  eq: mockEq,
  gte: mockGte,
  lt: mockLt,
  order: mockOrder,
  limit: mockLimit,
  single: mockSingle,
});

// Each method returns the chain
[mockSelect, mockEq, mockGte, mockLt, mockOrder, mockLimit].forEach((fn) => {
  fn.mockReturnValue(chainMethods());
});
mockSingle.mockResolvedValue({ data: null, error: null });

const mockFrom = jest.fn().mockReturnValue(chainMethods());
const mockSupabase = { from: mockFrom };

jest.mock('./supabase', () => ({
  getSupabase: () => mockSupabase,
  isSupabaseConfigured: () => true,
}));

// Mock goals module
jest.mock('./goals', () => ({
  getGoals: jest.fn().mockResolvedValue([]),
  createGoal: jest.fn().mockResolvedValue(null),
  updateGoal: jest.fn().mockResolvedValue(null),
  isGoalComplete: jest.fn().mockReturnValue(false),
  computeGoalProgress: jest.fn().mockReturnValue({
    percentComplete: 0,
    onTrack: true,
    projectedCompletion: null,
    trend: 'stable',
  }),
}));

const { suggestionToGoalInput } = require('./goalSuggestions');

describe('goalSuggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-set chain mocks
    [mockSelect, mockEq, mockGte, mockLt, mockOrder, mockLimit].forEach((fn) => {
      fn.mockReturnValue(chainMethods());
    });
    mockSingle.mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue(chainMethods());
  });

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

      expect(input.type).toBe('pain_reduction');
      expect(input.title).toBe('Reduce pain to 3/10');
      expect(input.starting_value).toBe(7);
      expect(input.target_value).toBe(3);
      expect(input.current_value).toBe(7);
      expect(input.status).toBe('active');
      expect(input.description).toBe('Your average pain is 6.5.');

      // Deadline should be ~8 weeks from now
      const deadline = new Date(input.deadline);
      const now = new Date();
      const diffDays = Math.round((deadline - now) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(54);
      expect(diffDays).toBeLessThanOrEqual(58);
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

      expect(input.type).toBe('symmetry_improvement');
      expect(input.target_value).toBe(85);
      expect(input.starting_value).toBe(70);
      expect(input.current_value).toBe(70);
      expect(input.status).toBe('active');
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

      expect(input.type).toBe('workout_streak');
      expect(input.target_value).toBe(7);
      expect(input.starting_value).toBe(1);

      const deadline = new Date(input.deadline);
      const now = new Date();
      const diffDays = Math.round((deadline - now) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(12);
      expect(diffDays).toBeLessThanOrEqual(16);
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

      expect(input.type).toBe('workout_consistency');
      expect(input.target_value).toBe(70);
      expect(input.current_value).toBe(29);
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

      expect(input.type).toBe('posture_score');
      expect(input.target_value).toBe(75);
      expect(input.starting_value).toBe(55);
    });
  });

  describe('module exports', () => {
    it('exports suggestGoals function', () => {
      const mod = require('./goalSuggestions');
      expect(typeof mod.suggestGoals).toBe('function');
    });

    it('exports fetchUserMetrics function', () => {
      const mod = require('./goalSuggestions');
      expect(typeof mod.fetchUserMetrics).toBe('function');
    });

    it('exports suggestionToGoalInput function', () => {
      const mod = require('./goalSuggestions');
      expect(typeof mod.suggestionToGoalInput).toBe('function');
    });
  });
});
