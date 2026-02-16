/**
 * Tests for TP-005: Weekly Review and Progression
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'Node16',
  moduleResolution: 'Node16',
});
require('ts-node/register/transpile-only');

const {
  computeWeekReview,
  compareWeeks,
  suggestAdjustments,
  isWeekReadyForReview,
  getWeekNeedingReview,
} = require('./weeklyReview');

// ── Helpers ────────────────────────────────────────────────────────

function makeWeek(overrides = {}) {
  return {
    id: 'w1',
    phase_id: 'p1',
    week_number: 1,
    is_deload: false,
    intensity_pct: 70,
    notes: null,
    sessions: [
      { id: 's1', day_of_week: 1, session_type: 'corrective', completed: true, completed_at: '2026-02-10', exercises: [] },
      { id: 's2', day_of_week: 3, session_type: 'gym', completed: true, completed_at: '2026-02-12', exercises: [] },
      { id: 's3', day_of_week: 5, session_type: 'corrective', completed: false, completed_at: null, exercises: [] },
    ],
    ...overrides,
  };
}

function makePhase(overrides = {}) {
  return {
    id: 'p1',
    program_id: 'prog1',
    name: 'Phase 1: Release',
    description: null,
    phase_number: 1,
    duration_weeks: 2,
    focus: 'release',
    ...overrides,
  };
}

function makeWorkoutData(overrides = {}) {
  return { total_volume: 5000, total_sets: 30, total_reps: 200, ...overrides };
}

function makePainData(overrides = {}) {
  return { pain_before: [5, 6], pain_after: [4, 4], energy: [7, 8], ...overrides };
}

// ── computeWeekReview ──────────────────────────────────────────────

describe('computeWeekReview', () => {
  it('computes adherence correctly', () => {
    const week = makeWeek();
    const review = computeWeekReview('prog1', week, makePhase(), makeWorkoutData(), makePainData());
    assert.equal(review.sessions_completed, 2);
    assert.equal(review.sessions_total, 3);
    assert.equal(review.sessions_missed, 1);
    assert.equal(review.adherence_pct, 67);
  });

  it('computes 100% adherence when all sessions done', () => {
    const week = makeWeek({
      sessions: [
        { id: 's1', completed: true, completed_at: '2026-02-10', day_of_week: 1, session_type: 'corrective', exercises: [] },
        { id: 's2', completed: true, completed_at: '2026-02-12', day_of_week: 3, session_type: 'gym', exercises: [] },
      ],
    });
    const review = computeWeekReview('prog1', week, makePhase(), makeWorkoutData(), makePainData());
    assert.equal(review.adherence_pct, 100);
    assert.equal(review.sessions_missed, 0);
  });

  it('detects pain improvement', () => {
    const painData = makePainData({ pain_before: [6, 7], pain_after: [4, 3] });
    const review = computeWeekReview('prog1', makeWeek(), makePhase(), makeWorkoutData(), painData);
    assert.equal(review.pain_trend, 'improved');
  });

  it('detects pain worsening', () => {
    const painData = makePainData({ pain_before: [3, 4], pain_after: [6, 7] });
    const review = computeWeekReview('prog1', makeWeek(), makePhase(), makeWorkoutData(), painData);
    assert.equal(review.pain_trend, 'worsened');
  });

  it('detects stable pain', () => {
    const painData = makePainData({ pain_before: [5, 5], pain_after: [5, 5] });
    const review = computeWeekReview('prog1', makeWeek(), makePhase(), makeWorkoutData(), painData);
    assert.equal(review.pain_trend, 'stable');
  });

  it('returns unknown pain trend with no data', () => {
    const painData = makePainData({ pain_before: [], pain_after: [] });
    const review = computeWeekReview('prog1', makeWeek(), makePhase(), makeWorkoutData(), painData);
    assert.equal(review.pain_trend, 'unknown');
    assert.equal(review.pain_before_avg, null);
    assert.equal(review.pain_after_avg, null);
  });

  it('includes volume and workout data', () => {
    const workoutData = makeWorkoutData({ total_volume: 10000, total_sets: 50, total_reps: 300 });
    const review = computeWeekReview('prog1', makeWeek(), makePhase(), workoutData, makePainData());
    assert.equal(review.total_volume, 10000);
    assert.equal(review.total_sets, 50);
    assert.equal(review.total_reps, 300);
  });

  it('includes week metadata', () => {
    const week = makeWeek({ is_deload: true, intensity_pct: 60, week_number: 3 });
    const phase = makePhase({ focus: 'strengthen' });
    const review = computeWeekReview('prog1', week, phase, makeWorkoutData(), makePainData());
    assert.equal(review.is_deload, true);
    assert.equal(review.intensity_pct, 60);
    assert.equal(review.weekNumber, 3);
    assert.equal(review.phase_focus, 'strengthen');
  });
});

// ── compareWeeks ───────────────────────────────────────────────────

describe('compareWeeks', () => {
  it('calculates changes between weeks', () => {
    const current = computeWeekReview('prog1', makeWeek(), makePhase(), makeWorkoutData({ total_volume: 6000 }), makePainData({ pain_after: [3, 3] }));
    const previous = computeWeekReview('prog1', makeWeek({ week_number: 0 }), makePhase(), makeWorkoutData({ total_volume: 5000 }), makePainData({ pain_after: [5, 5] }));
    const comparison = compareWeeks(current, previous);

    assert.ok(comparison.volume_change_pct !== null);
    assert.equal(comparison.volume_change_pct, 20); // 6000 vs 5000
    assert.ok(comparison.pain_change !== null);
    assert.ok(comparison.pain_change < 0); // pain decreased
  });

  it('handles null previous week', () => {
    const current = computeWeekReview('prog1', makeWeek(), makePhase(), makeWorkoutData(), makePainData());
    const comparison = compareWeeks(current, null);
    assert.equal(comparison.previous, null);
    assert.equal(comparison.adherence_change, null);
    assert.equal(comparison.volume_change_pct, null);
    assert.equal(comparison.pain_change, null);
  });
});

// ── suggestAdjustments ────────────────────────────────────────────

describe('suggestAdjustments', () => {
  it('suggests repeat_week for very low adherence (<40%)', () => {
    const review = computeWeekReview(
      'prog1',
      makeWeek({
        sessions: [
          { id: 's1', completed: true, completed_at: '2026-02-10', day_of_week: 1, session_type: 'corrective', exercises: [] },
          { id: 's2', completed: false, completed_at: null, day_of_week: 3, session_type: 'gym', exercises: [] },
          { id: 's3', completed: false, completed_at: null, day_of_week: 5, session_type: 'corrective', exercises: [] },
          { id: 's4', completed: false, completed_at: null, day_of_week: 6, session_type: 'gym', exercises: [] },
        ],
      }),
      makePhase(),
      makeWorkoutData(),
      makePainData()
    );
    const suggestions = suggestAdjustments(review, null);
    assert.ok(suggestions.some((s) => s.type === 'repeat_week'));
  });

  it('suggests reduce_intensity for low adherence (40-60%)', () => {
    const review = computeWeekReview(
      'prog1',
      makeWeek({
        sessions: [
          { id: 's1', completed: true, completed_at: '2026-02-10', day_of_week: 1, session_type: 'corrective', exercises: [] },
          { id: 's2', completed: false, completed_at: null, day_of_week: 3, session_type: 'gym', exercises: [] },
        ],
      }),
      makePhase(),
      makeWorkoutData(),
      makePainData({ pain_before: [], pain_after: [] })
    );
    const suggestions = suggestAdjustments(review, null);
    assert.ok(suggestions.some((s) => s.type === 'reduce_intensity'));
  });

  it('suggests reduce_intensity for worsened pain', () => {
    const review = computeWeekReview(
      'prog1',
      makeWeek(),
      makePhase(),
      makeWorkoutData(),
      makePainData({ pain_before: [3, 3], pain_after: [7, 8] })
    );
    const suggestions = suggestAdjustments(review, null);
    assert.ok(suggestions.some((s) => s.type === 'reduce_intensity'));
    const painSuggestion = suggestions.find((s) => s.reason.includes('Pain'));
    assert.ok(painSuggestion.intensity_modifier < 0);
  });

  it('suggests advance for improved pain + high adherence', () => {
    const week = makeWeek({
      sessions: [
        { id: 's1', completed: true, completed_at: '2026-02-10', day_of_week: 1, session_type: 'corrective', exercises: [] },
        { id: 's2', completed: true, completed_at: '2026-02-12', day_of_week: 3, session_type: 'gym', exercises: [] },
        { id: 's3', completed: true, completed_at: '2026-02-14', day_of_week: 5, session_type: 'corrective', exercises: [] },
      ],
    });
    const review = computeWeekReview(
      'prog1',
      week,
      makePhase(),
      makeWorkoutData(),
      makePainData({ pain_before: [6, 7], pain_after: [3, 3] })
    );
    const suggestions = suggestAdjustments(review, null);
    assert.ok(suggestions.some((s) => s.type === 'advance'));
  });

  it('suggests continue for solid adherence + stable pain', () => {
    const week = makeWeek({
      sessions: [
        { id: 's1', completed: true, completed_at: '2026-02-10', day_of_week: 1, session_type: 'corrective', exercises: [] },
        { id: 's2', completed: true, completed_at: '2026-02-12', day_of_week: 3, session_type: 'gym', exercises: [] },
        { id: 's3', completed: false, completed_at: null, day_of_week: 5, session_type: 'corrective', exercises: [] },
      ],
    });
    const review = computeWeekReview(
      'prog1',
      week,
      makePhase(),
      makeWorkoutData(),
      makePainData({ pain_before: [5, 5], pain_after: [5, 5] })
    );
    const suggestions = suggestAdjustments(review, null);
    assert.ok(suggestions.some((s) => s.type === 'continue'));
  });

  it('suggests increase_intensity after good deload week', () => {
    const week = makeWeek({
      is_deload: true,
      intensity_pct: 60,
      sessions: [
        { id: 's1', completed: true, completed_at: '2026-02-10', day_of_week: 1, session_type: 'corrective', exercises: [] },
        { id: 's2', completed: true, completed_at: '2026-02-12', day_of_week: 3, session_type: 'gym', exercises: [] },
      ],
    });
    const review = computeWeekReview(
      'prog1',
      week,
      makePhase(),
      makeWorkoutData(),
      makePainData({ pain_before: [4, 4], pain_after: [3, 3] })
    );
    const suggestions = suggestAdjustments(review, null);
    assert.ok(suggestions.some((s) => s.type === 'increase_intensity'));
    const deloadSuggestion = suggestions.find((s) => s.type === 'increase_intensity');
    assert.equal(deloadSuggestion.intensity_modifier, 5);
  });

  it('returns suggestions sorted by priority', () => {
    const review = computeWeekReview(
      'prog1',
      makeWeek({
        sessions: [
          { id: 's1', completed: true, completed_at: '2026-02-10', day_of_week: 1, session_type: 'corrective', exercises: [] },
          { id: 's2', completed: false, completed_at: null, day_of_week: 3, session_type: 'gym', exercises: [] },
          { id: 's3', completed: false, completed_at: null, day_of_week: 5, session_type: 'corrective', exercises: [] },
          { id: 's4', completed: false, completed_at: null, day_of_week: 6, session_type: 'gym', exercises: [] },
        ],
      }),
      makePhase(),
      makeWorkoutData(),
      makePainData({ pain_before: [3, 3], pain_after: [7, 8] })
    );
    const suggestions = suggestAdjustments(review, null);
    for (let i = 1; i < suggestions.length; i++) {
      assert.ok(suggestions[i].priority >= suggestions[i - 1].priority);
    }
  });
});

// ── isWeekReadyForReview ──────────────────────────────────────────

describe('isWeekReadyForReview', () => {
  it('returns false for current/future weeks', () => {
    assert.equal(isWeekReadyForReview(makeWeek({ week_number: 2 }), '2026-02-01', 2), false);
    assert.equal(isWeekReadyForReview(makeWeek({ week_number: 3 }), '2026-02-01', 2), false);
  });

  it('returns true when all sessions are completed', () => {
    const week = makeWeek({
      week_number: 1,
      sessions: [
        { id: 's1', completed: true, completed_at: '2026-02-10', day_of_week: 1, session_type: 'corrective', exercises: [] },
        { id: 's2', completed: true, completed_at: '2026-02-12', day_of_week: 3, session_type: 'gym', exercises: [] },
      ],
    });
    assert.equal(isWeekReadyForReview(week, '2026-02-01', 2), true);
  });

  it('returns true when week has elapsed even with incomplete sessions', () => {
    const week = makeWeek({ week_number: 1 });
    // Program started long ago, week 1 has definitely elapsed
    assert.equal(isWeekReadyForReview(week, '2025-01-01', 3), true);
  });

  it('returns true for empty weeks', () => {
    const week = makeWeek({ week_number: 1, sessions: [] });
    assert.equal(isWeekReadyForReview(week, '2026-02-01', 2), true);
  });
});

// ── getWeekNeedingReview ──────────────────────────────────────────

describe('getWeekNeedingReview', () => {
  it('returns null for week 1 (no previous week)', () => {
    const program = {
      id: 'prog1',
      current_week: 1,
      status: 'active',
      phases: [{ weeks: [makeWeek({ week_number: 1 })] }],
    };
    assert.equal(getWeekNeedingReview(program), null);
  });

  it('returns previous week when all its sessions are complete', () => {
    const program = {
      id: 'prog1',
      current_week: 2,
      status: 'active',
      phases: [{
        weeks: [
          makeWeek({
            week_number: 1,
            sessions: [
              { id: 's1', completed: true, completed_at: '2026-02-10', day_of_week: 1, session_type: 'corrective', exercises: [] },
              { id: 's2', completed: true, completed_at: '2026-02-12', day_of_week: 3, session_type: 'gym', exercises: [] },
              { id: 's3', completed: true, completed_at: '2026-02-14', day_of_week: 5, session_type: 'corrective', exercises: [] },
            ],
          }),
          makeWeek({ week_number: 2 }),
        ],
      }],
    };
    assert.equal(getWeekNeedingReview(program), 1);
  });

  it('returns null when previous week has incomplete sessions', () => {
    const program = {
      id: 'prog1',
      current_week: 2,
      status: 'active',
      phases: [{
        weeks: [
          makeWeek({ week_number: 1 }), // has incomplete sessions by default
          makeWeek({ week_number: 2 }),
        ],
      }],
    };
    assert.equal(getWeekNeedingReview(program), null);
  });

  it('returns null for non-active programs', () => {
    const program = {
      id: 'prog1',
      current_week: 3,
      status: 'completed',
      phases: [],
    };
    assert.equal(getWeekNeedingReview(program), null);
  });
});
