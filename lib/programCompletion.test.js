// @ts-check
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'Node16',
  moduleResolution: 'Node16',
});
require('ts-node/register/transpile-only');

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  countTotalSessions,
  countCompletedSessions,
  computeProgramAdherence,
  daysBetween,
  computeMetricChange,
  didPrimaryMetricImprove,
  buildOutcomeSummary,
  buildProgramOutcome,
  suggestNextProgram,
  formatMetricValue,
  getMetricInfo,
} = require('./programCompletion');

// ── Helper ──────────────────────────────────────────────────────────

function makePhases(sessionCounts, completedCounts) {
  return sessionCounts.map((count, pi) => ({
    name: `Phase ${pi + 1}`,
    phase_number: pi + 1,
    duration_weeks: 2,
    focus: 'strengthen',
    weeks: [
      {
        week_number: pi * 2 + 1,
        is_deload: false,
        intensity_pct: 80,
        notes: null,
        sessions: Array.from({ length: count }, (_, si) => ({
          day_of_week: si + 1,
          session_type: 'corrective',
          completed: si < (completedCounts?.[pi] ?? 0),
          completed_at: si < (completedCounts?.[pi] ?? 0) ? '2026-02-10T00:00:00Z' : null,
          exercises: [],
        })),
      },
    ],
  }));
}

// ── countTotalSessions ──────────────────────────────────────────────

describe('countTotalSessions', () => {
  it('counts all sessions across phases and weeks', () => {
    const phases = makePhases([3, 4, 2], []);
    assert.equal(countTotalSessions(phases), 9);
  });

  it('returns 0 for empty phases', () => {
    assert.equal(countTotalSessions([]), 0);
  });
});

// ── countCompletedSessions ──────────────────────────────────────────

describe('countCompletedSessions', () => {
  it('counts only completed sessions', () => {
    const phases = makePhases([3, 4], [2, 3]);
    assert.equal(countCompletedSessions(phases), 5);
  });

  it('returns 0 when none completed', () => {
    const phases = makePhases([3, 4], [0, 0]);
    assert.equal(countCompletedSessions(phases), 0);
  });
});

// ── computeProgramAdherence ─────────────────────────────────────────

describe('computeProgramAdherence', () => {
  it('computes correct percentage', () => {
    const phases = makePhases([5, 5], [4, 3]);
    assert.equal(computeProgramAdherence(phases), 70);
  });

  it('returns 0 for no sessions', () => {
    assert.equal(computeProgramAdherence([]), 0);
  });

  it('returns 100 for all completed', () => {
    const phases = makePhases([3, 2], [3, 2]);
    assert.equal(computeProgramAdherence(phases), 100);
  });
});

// ── daysBetween ─────────────────────────────────────────────────────

describe('daysBetween', () => {
  it('computes days between two dates', () => {
    assert.equal(daysBetween('2026-01-01T00:00:00Z', '2026-01-15T00:00:00Z'), 14);
  });

  it('returns at least 1 for same day', () => {
    assert.equal(daysBetween('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'), 1);
  });
});

// ── computeMetricChange ─────────────────────────────────────────────

describe('computeMetricChange', () => {
  it('detects improvement when lower is better (pain decreased)', () => {
    const result = computeMetricChange(7, 4, true);
    assert.equal(result.changed, true);
    assert.equal(result.improved, true);
    assert.equal(result.delta, -3);
  });

  it('detects worsening when lower is better (pain increased)', () => {
    const result = computeMetricChange(4, 6, true);
    assert.equal(result.changed, true);
    assert.equal(result.improved, false);
    assert.equal(result.delta, 2);
  });

  it('detects improvement when higher is better (posture improved)', () => {
    const result = computeMetricChange(60, 75, false);
    assert.equal(result.changed, true);
    assert.equal(result.improved, true);
    assert.equal(result.delta, 15);
  });

  it('returns not changed for null values', () => {
    const result = computeMetricChange(null, 5, true);
    assert.equal(result.changed, false);
  });
});

// ── didPrimaryMetricImprove ─────────────────────────────────────────

describe('didPrimaryMetricImprove', () => {
  it('checks pain for pain_reduction goal', () => {
    const before = { pain_level: 7, posture_score: null, symmetry_score: null };
    const after = { pain_level: 4, posture_score: null, symmetry_score: null };
    assert.equal(didPrimaryMetricImprove('pain_reduction', before, after), true);
  });

  it('checks posture for posture_improvement goal', () => {
    const before = { pain_level: null, posture_score: 50, symmetry_score: null };
    const after = { pain_level: null, posture_score: 70, symmetry_score: null };
    assert.equal(didPrimaryMetricImprove('posture_improvement', before, after), true);
  });

  it('checks symmetry for scoliosis_correction goal', () => {
    const before = { pain_level: null, posture_score: null, symmetry_score: 60 };
    const after = { pain_level: null, posture_score: null, symmetry_score: 80 };
    assert.equal(didPrimaryMetricImprove('scoliosis_correction', before, after), true);
  });

  it('checks any metric for general_mobility goal', () => {
    const before = { pain_level: 5, posture_score: 50, symmetry_score: 50 };
    const after = { pain_level: 5, posture_score: 50, symmetry_score: 55 };
    assert.equal(didPrimaryMetricImprove('general_mobility', before, after), true);
  });

  it('returns false when nothing improved for general_mobility', () => {
    const before = { pain_level: 5, posture_score: 50, symmetry_score: 50 };
    const after = { pain_level: 5, posture_score: 50, symmetry_score: 50 };
    assert.equal(didPrimaryMetricImprove('general_mobility', before, after), false);
  });
});

// ── buildOutcomeSummary ─────────────────────────────────────────────

describe('buildOutcomeSummary', () => {
  it('includes days, adherence, and metric changes', () => {
    const before = { pain_level: 7, posture_score: 50, symmetry_score: null };
    const after = { pain_level: 4, posture_score: 65, symmetry_score: null };
    const summary = buildOutcomeSummary('pain_reduction', before, after, 85, 42);

    assert.ok(summary.includes('42 days'));
    assert.ok(summary.includes('85%'));
    assert.ok(summary.includes('Pain decreased'));
    assert.ok(summary.includes('Posture score improved'));
  });

  it('handles null metrics gracefully', () => {
    const before = { pain_level: null, posture_score: null, symmetry_score: null };
    const after = { pain_level: null, posture_score: null, symmetry_score: null };
    const summary = buildOutcomeSummary('general_mobility', before, after, 70, 30);
    assert.ok(summary.includes('30 days'));
    assert.ok(summary.includes('70%'));
  });
});

// ── buildProgramOutcome ─────────────────────────────────────────────

describe('buildProgramOutcome', () => {
  it('assembles a complete outcome object', () => {
    const program = {
      id: 'prog-1',
      name: '6-Week Pain Relief',
      goal_type: 'pain_reduction',
      duration_weeks: 6,
      current_week: 6,
      status: 'completed',
      created_at: '2026-01-01T00:00:00Z',
      started_at: '2026-01-01T00:00:00Z',
      completed_at: '2026-02-12T00:00:00Z',
      phases: makePhases([4, 4, 4], [4, 4, 3]),
    };
    const before = { pain_level: 7, posture_score: 50, symmetry_score: 60 };
    const after = { pain_level: 3, posture_score: 65, symmetry_score: 70 };

    const outcome = buildProgramOutcome(program, before, after);

    assert.equal(outcome.programId, 'prog-1');
    assert.equal(outcome.programName, '6-Week Pain Relief');
    assert.equal(outcome.goalType, 'pain_reduction');
    assert.equal(outcome.sessionsTotal, 12);
    assert.equal(outcome.sessionsCompleted, 11);
    assert.equal(outcome.adherencePct, 92);
    assert.equal(outcome.daysTaken, 42);
    assert.equal(outcome.primaryMetricImproved, true);
    assert.ok(outcome.outcomeSummary.length > 0);
  });
});

// ── suggestNextProgram ──────────────────────────────────────────────

describe('suggestNextProgram', () => {
  it('suggests same goal when adherence is low', () => {
    const outcome = {
      programId: 'p1',
      programName: 'Test',
      goalType: 'pain_reduction',
      durationWeeks: 6,
      startedAt: '2026-01-01',
      completedAt: '2026-02-12',
      daysTaken: 42,
      metricsBefore: { pain_level: 7, posture_score: null, symmetry_score: null },
      metricsAfter: { pain_level: 5, posture_score: null, symmetry_score: null },
      adherencePct: 45,
      sessionsCompleted: 10,
      sessionsTotal: 24,
      phasesCompleted: 3,
      primaryMetricImproved: true,
      outcomeSummary: 'test',
    };
    const suggestion = suggestNextProgram(outcome);
    assert.equal(suggestion.suggestedGoalType, 'pain_reduction');
    assert.ok(suggestion.reason.includes('adherence'));
  });

  it('progresses from pain to posture when pain is low', () => {
    const outcome = {
      programId: 'p1',
      programName: 'Test',
      goalType: 'pain_reduction',
      durationWeeks: 6,
      startedAt: '2026-01-01',
      completedAt: '2026-02-12',
      daysTaken: 42,
      metricsBefore: { pain_level: 7, posture_score: null, symmetry_score: null },
      metricsAfter: { pain_level: 2, posture_score: null, symmetry_score: null },
      adherencePct: 85,
      sessionsCompleted: 22,
      sessionsTotal: 24,
      phasesCompleted: 4,
      primaryMetricImproved: true,
      outcomeSummary: 'test',
    };
    const suggestion = suggestNextProgram(outcome);
    assert.equal(suggestion.suggestedGoalType, 'posture_improvement');
  });

  it('progresses from scoliosis to general when symmetry is good', () => {
    const outcome = {
      programId: 'p1',
      programName: 'Test',
      goalType: 'scoliosis_correction',
      durationWeeks: 8,
      startedAt: '2026-01-01',
      completedAt: '2026-02-26',
      daysTaken: 56,
      metricsBefore: { pain_level: null, posture_score: null, symmetry_score: 70 },
      metricsAfter: { pain_level: null, posture_score: null, symmetry_score: 88 },
      adherencePct: 90,
      sessionsCompleted: 36,
      sessionsTotal: 40,
      phasesCompleted: 4,
      primaryMetricImproved: true,
      outcomeSummary: 'test',
    };
    const suggestion = suggestNextProgram(outcome);
    assert.equal(suggestion.suggestedGoalType, 'general_mobility');
  });

  it('stays on same goal when primary metric did not improve', () => {
    const outcome = {
      programId: 'p1',
      programName: 'Test',
      goalType: 'posture_improvement',
      durationWeeks: 6,
      startedAt: '2026-01-01',
      completedAt: '2026-02-12',
      daysTaken: 42,
      metricsBefore: { pain_level: null, posture_score: 60, symmetry_score: null },
      metricsAfter: { pain_level: null, posture_score: 58, symmetry_score: null },
      adherencePct: 80,
      sessionsCompleted: 20,
      sessionsTotal: 24,
      phasesCompleted: 4,
      primaryMetricImproved: false,
      outcomeSummary: 'test',
    };
    const suggestion = suggestNextProgram(outcome);
    assert.equal(suggestion.suggestedGoalType, 'posture_improvement');
  });
});

// ── formatMetricValue ───────────────────────────────────────────────

describe('formatMetricValue', () => {
  it('formats pain as X/10', () => {
    assert.equal(formatMetricValue('pain', 5), '5/10');
  });

  it('formats posture as X/100', () => {
    assert.equal(formatMetricValue('posture', 72), '72/100');
  });

  it('formats symmetry as X%', () => {
    assert.equal(formatMetricValue('symmetry', 85), '85%');
  });

  it('returns N/A for null', () => {
    assert.equal(formatMetricValue('pain', null), 'N/A');
  });
});

// ── getMetricInfo ───────────────────────────────────────────────────

describe('getMetricInfo', () => {
  it('pain is lower-is-better', () => {
    const info = getMetricInfo('pain');
    assert.equal(info.lowerIsBetter, true);
    assert.equal(info.label, 'Pain Level');
  });

  it('posture is higher-is-better', () => {
    const info = getMetricInfo('posture');
    assert.equal(info.lowerIsBetter, false);
  });
});
