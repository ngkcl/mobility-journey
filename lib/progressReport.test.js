/**
 * Tests for progress report pure functions.
 * Uses node:test + node:assert/strict (NOT Jest).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'Node16',
  moduleResolution: 'Node16',
});
require('ts-node/register/transpile-only');

const {
  computeTrend,
  aggregateMetrics,
  aggregateWorkouts,
  aggregateBodyMap,
  formatZoneName,
  formatSensation,
  generateReportHTML,
} = require('./progressReport');

// ─── computeTrend ─────────────────────────────────────

describe('computeTrend', () => {
  it('returns stable for single value', () => {
    const result = computeTrend([5], 'lower_is_better');
    assert.equal(result.direction, 'stable');
    assert.equal(result.changePercent, 0);
  });

  it('returns stable for empty array', () => {
    const result = computeTrend([], 'higher_is_better');
    assert.equal(result.direction, 'stable');
    assert.equal(result.firstHalfAvg, null);
  });

  it('detects improving pain (lower is better, values decreasing)', () => {
    // First half avg: 7, second half avg: 4
    const result = computeTrend([8, 6, 5, 3], 'lower_is_better');
    assert.equal(result.direction, 'improving');
    assert.ok(result.changePercent > 0);
    assert.equal(result.firstHalfAvg, 7);
    assert.equal(result.secondHalfAvg, 4);
  });

  it('detects declining pain (lower is better, values increasing)', () => {
    // First half avg: 3, second half avg: 7
    const result = computeTrend([2, 4, 6, 8], 'lower_is_better');
    assert.equal(result.direction, 'declining');
  });

  it('detects improving posture (higher is better, values increasing)', () => {
    // First half avg: 50, second half avg: 75
    const result = computeTrend([40, 60, 70, 80], 'higher_is_better');
    assert.equal(result.direction, 'improving');
  });

  it('detects declining posture (higher is better, values decreasing)', () => {
    const result = computeTrend([80, 70, 50, 40], 'higher_is_better');
    assert.equal(result.direction, 'declining');
  });

  it('returns stable for small changes within threshold', () => {
    // First half: 50, second half: 51 → 2% change < 5% threshold
    const result = computeTrend([50, 50, 51, 51], 'higher_is_better');
    assert.equal(result.direction, 'stable');
  });
});

// ─── aggregateMetrics ─────────────────────────────────

describe('aggregateMetrics', () => {
  it('computes averages correctly', () => {
    const entries = [
      { pain_level: 6, posture_score: 70, symmetry_score: 80, energy_level: 5, recorded_at: '2026-02-01T10:00:00' },
      { pain_level: 4, posture_score: 75, symmetry_score: 85, energy_level: 7, recorded_at: '2026-02-10T10:00:00' },
    ];
    const result = aggregateMetrics(entries, 30);
    assert.equal(result.avgPain, 5);
    assert.equal(result.avgPosture, 72.5);
    assert.equal(result.avgSymmetry, 82.5);
    assert.equal(result.avgEnergy, 6);
  });

  it('handles entries with null fields', () => {
    const entries = [
      { pain_level: null, posture_score: 70, symmetry_score: null, energy_level: null, recorded_at: '2026-02-01T10:00:00' },
      { pain_level: 5, posture_score: null, symmetry_score: 80, energy_level: null, recorded_at: '2026-02-10T10:00:00' },
    ];
    const result = aggregateMetrics(entries, 30);
    assert.equal(result.avgPain, 5); // only one entry
    assert.equal(result.avgPosture, 70); // only one entry
    assert.equal(result.avgSymmetry, 80);
    assert.equal(result.avgEnergy, null);
  });

  it('returns nulls for empty entries', () => {
    const result = aggregateMetrics([], 30);
    assert.equal(result.avgPain, null);
    assert.equal(result.avgPosture, null);
    assert.equal(result.avgSymmetry, null);
    assert.equal(result.avgEnergy, null);
  });
});

// ─── aggregateWorkouts ────────────────────────────────

describe('aggregateWorkouts', () => {
  it('counts workout types correctly', () => {
    const workouts = [
      { id: '1', workout_type: 'corrective', started_at: '2026-02-01T08:00:00', completed_at: '2026-02-01T08:30:00', pain_before: null, pain_after: null },
      { id: '2', workout_type: 'morning', started_at: '2026-02-02T07:00:00', completed_at: '2026-02-02T07:20:00', pain_before: null, pain_after: null },
      { id: '3', workout_type: 'gym', started_at: '2026-02-03T10:00:00', completed_at: '2026-02-03T11:00:00', pain_before: null, pain_after: null },
      { id: '4', workout_type: 'stretching', started_at: '2026-02-04T18:00:00', completed_at: '2026-02-04T18:15:00', pain_before: null, pain_after: null },
    ];
    const result = aggregateWorkouts(workouts, 30);
    assert.equal(result.total, 4);
    assert.equal(result.corrective, 2); // corrective + morning
    assert.equal(result.gym, 1);
    assert.equal(result.stretch, 1);
  });

  it('excludes incomplete workouts', () => {
    const workouts = [
      { id: '1', workout_type: 'gym', started_at: '2026-02-01T10:00:00', completed_at: null, pain_before: null, pain_after: null },
      { id: '2', workout_type: 'gym', started_at: '2026-02-02T10:00:00', completed_at: '2026-02-02T11:00:00', pain_before: null, pain_after: null },
    ];
    const result = aggregateWorkouts(workouts, 30);
    assert.equal(result.total, 1);
  });

  it('computes average pain reduction', () => {
    const workouts = [
      { id: '1', workout_type: 'corrective', started_at: '2026-02-01T08:00:00', completed_at: '2026-02-01T08:30:00', pain_before: 7, pain_after: 4 },
      { id: '2', workout_type: 'corrective', started_at: '2026-02-02T08:00:00', completed_at: '2026-02-02T08:30:00', pain_before: 6, pain_after: 5 },
    ];
    const result = aggregateWorkouts(workouts, 30);
    // (7-4 + 6-5) / 2 = (3 + 1) / 2 = 2.0
    assert.equal(result.avgPainReduction, 2);
  });

  it('returns null pain reduction when no pain data', () => {
    const workouts = [
      { id: '1', workout_type: 'gym', started_at: '2026-02-01T10:00:00', completed_at: '2026-02-01T11:00:00', pain_before: null, pain_after: null },
    ];
    const result = aggregateWorkouts(workouts, 30);
    assert.equal(result.avgPainReduction, null);
  });

  it('computes consistency percentage', () => {
    // 3 unique workout days out of 10 period days = 30%
    const workouts = [
      { id: '1', workout_type: 'gym', started_at: '2026-02-01T10:00:00', completed_at: '2026-02-01T11:00:00', pain_before: null, pain_after: null },
      { id: '2', workout_type: 'gym', started_at: '2026-02-03T10:00:00', completed_at: '2026-02-03T11:00:00', pain_before: null, pain_after: null },
      { id: '3', workout_type: 'gym', started_at: '2026-02-05T10:00:00', completed_at: '2026-02-05T11:00:00', pain_before: null, pain_after: null },
    ];
    const result = aggregateWorkouts(workouts, 10);
    assert.equal(result.consistencyPct, 30);
  });
});

// ─── aggregateBodyMap ─────────────────────────────────

describe('aggregateBodyMap', () => {
  it('returns empty for no entries', () => {
    const result = aggregateBodyMap([]);
    assert.equal(result.totalEntries, 0);
    assert.equal(result.topZones.length, 0);
    assert.equal(result.asymmetries.length, 0);
  });

  it('computes top zones by average intensity', () => {
    const entries = [
      { id: '1', zone: 'lower_back', intensity: 8, sensation: 'pain', recorded_at: '2026-02-01T10:00:00' },
      { id: '2', zone: 'lower_back', intensity: 6, sensation: 'pain', recorded_at: '2026-02-02T10:00:00' },
      { id: '3', zone: 'upper_back', intensity: 3, sensation: 'tension', recorded_at: '2026-02-01T10:00:00' },
    ];
    const result = aggregateBodyMap(entries);
    assert.equal(result.totalEntries, 3);
    assert.equal(result.topZones.length, 2);
    assert.equal(result.topZones[0].zone, 'lower_back'); // highest avg intensity
    assert.equal(result.topZones[0].avgIntensity, 7);
    assert.equal(result.topZones[0].dominantSensation, 'pain');
    assert.equal(result.topZones[1].zone, 'upper_back');
    assert.equal(result.topZones[1].avgIntensity, 3);
  });

  it('detects left/right asymmetries', () => {
    const entries = [
      { id: '1', zone: 'left_shoulder', intensity: 7, sensation: 'pain', recorded_at: '2026-02-01T10:00:00' },
      { id: '2', zone: 'left_shoulder', intensity: 8, sensation: 'pain', recorded_at: '2026-02-02T10:00:00' },
      { id: '3', zone: 'right_shoulder', intensity: 3, sensation: 'tension', recorded_at: '2026-02-01T10:00:00' },
      { id: '4', zone: 'right_shoulder', intensity: 2, sensation: 'tension', recorded_at: '2026-02-02T10:00:00' },
    ];
    const result = aggregateBodyMap(entries);
    assert.equal(result.asymmetries.length, 1);
    assert.equal(result.asymmetries[0].leftZone, 'left_shoulder');
    assert.equal(result.asymmetries[0].rightZone, 'right_shoulder');
    assert.equal(result.asymmetries[0].leftAvg, 7.5);
    assert.equal(result.asymmetries[0].rightAvg, 2.5);
    assert.equal(result.asymmetries[0].difference, 5);
  });

  it('ignores small asymmetries below threshold', () => {
    const entries = [
      { id: '1', zone: 'left_hip', intensity: 5, sensation: 'pain', recorded_at: '2026-02-01T10:00:00' },
      { id: '2', zone: 'right_hip', intensity: 4, sensation: 'pain', recorded_at: '2026-02-01T10:00:00' },
    ];
    const result = aggregateBodyMap(entries);
    assert.equal(result.asymmetries.length, 0); // difference of 1 < threshold of 1.5
  });
});

// ─── formatZoneName ───────────────────────────────────

describe('formatZoneName', () => {
  it('formats snake_case zone names', () => {
    assert.equal(formatZoneName('lower_back'), 'Lower Back');
    assert.equal(formatZoneName('left_shoulder'), 'Left Shoulder');
    assert.equal(formatZoneName('upper_back'), 'Upper Back');
  });

  it('handles single word', () => {
    assert.equal(formatZoneName('neck'), 'Neck');
  });
});

// ─── formatSensation ──────────────────────────────────

describe('formatSensation', () => {
  it('formats known sensations with emoji', () => {
    assert.equal(formatSensation('pain'), '⚡ Pain');
    assert.equal(formatSensation('tension'), '🔗 Tension');
    assert.equal(formatSensation('numbness'), '❄️ Numbness');
    assert.equal(formatSensation('stiffness'), '🔒 Stiffness');
    assert.equal(formatSensation('weakness'), '📉 Weakness');
  });

  it('returns raw value for unknown sensations', () => {
    assert.equal(formatSensation('other'), 'other');
  });
});

// ─── generateReportHTML ───────────────────────────────

describe('generateReportHTML', () => {
  it('generates valid HTML with all sections', () => {
    const data = {
      generatedAt: 'February 22, 2026 at 3:00 AM',
      periodStart: 'January 23, 2026',
      periodEnd: 'February 22, 2026',
      periodDays: 30,
      metrics: {
        entries: [{ pain_level: 5, posture_score: 70, symmetry_score: 80, energy_level: 6, recorded_at: '2026-02-01' }],
        avgPain: 5,
        avgPosture: 70,
        avgSymmetry: 80,
        avgEnergy: 6,
        painTrend: { direction: 'improving', changePercent: 15, firstHalfAvg: 6, secondHalfAvg: 4 },
        postureTrend: { direction: 'stable', changePercent: 2, firstHalfAvg: 70, secondHalfAvg: 71 },
        symmetryTrend: { direction: 'improving', changePercent: 10, firstHalfAvg: 75, secondHalfAvg: 82 },
      },
      workouts: {
        total: 15,
        corrective: 10,
        gym: 5,
        stretch: 3,
        totalVolume: 0,
        avgPainReduction: 1.5,
        consistencyPct: 50,
        currentStreak: 4,
      },
      bodyMap: {
        totalEntries: 20,
        topZones: [
          { zone: 'lower_back', avgIntensity: 7.5, entryCount: 12, dominantSensation: 'pain' },
          { zone: 'right_hip', avgIntensity: 5.2, entryCount: 8, dominantSensation: 'stiffness' },
        ],
        asymmetries: [
          { leftZone: 'left_shoulder', rightZone: 'right_shoulder', leftAvg: 6, rightAvg: 2, difference: 4 },
        ],
      },
      goals: {
        active: [
          { id: '1', type: 'pain_reduction', title: 'Reduce lower back pain', starting_value: 8, current_value: 5, target_value: 3, status: 'active', deadline: '2026-03-15', created_at: '2026-01-15' },
        ],
        completed: [
          { id: '2', type: 'workout_consistency', title: 'Exercise 4x/week', starting_value: 0, current_value: 80, target_value: 80, status: 'completed', deadline: null, created_at: '2026-01-01' },
        ],
      },
      program: {
        id: 'p1',
        name: 'Scoliosis Phase 1',
        goal_type: 'scoliosis_correction',
        status: 'active',
        total_weeks: 8,
        current_week: 3,
        sessions_per_week: 4,
        created_at: '2026-02-01',
      },
      correlations: [
        { exerciseName: 'Hip Flexor Stretch', zone: 'lower_back', deltaPct: -35, occurrences: 8, helpful: true },
        { exerciseName: 'Heavy Deadlift', zone: 'lower_back', deltaPct: 20, occurrences: 4, helpful: false },
      ],
    };

    const html = generateReportHTML(data);

    // Should contain key sections
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('Health Metrics Overview'));
    assert.ok(html.includes('Workout Activity'));
    assert.ok(html.includes('Pain & Tension Map'));
    assert.ok(html.includes('Goals Progress'));
    assert.ok(html.includes('Training Program'));
    assert.ok(html.includes('Exercise Effectiveness'));
    assert.ok(html.includes('Recommendations'));

    // Should contain data
    assert.ok(html.includes('15')); // total workouts
    assert.ok(html.includes('Lower Back'));
    assert.ok(html.includes('Hip Flexor Stretch'));
    assert.ok(html.includes('Scoliosis Phase 1'));
    assert.ok(html.includes('Reduce lower back pain'));
  });

  it('handles empty data gracefully', () => {
    const data = {
      generatedAt: 'February 22, 2026 at 3:00 AM',
      periodStart: 'January 23, 2026',
      periodEnd: 'February 22, 2026',
      periodDays: 30,
      metrics: { entries: [], avgPain: null, avgPosture: null, avgSymmetry: null, avgEnergy: null,
        painTrend: { direction: 'stable', changePercent: 0, firstHalfAvg: null, secondHalfAvg: null },
        postureTrend: { direction: 'stable', changePercent: 0, firstHalfAvg: null, secondHalfAvg: null },
        symmetryTrend: { direction: 'stable', changePercent: 0, firstHalfAvg: null, secondHalfAvg: null },
      },
      workouts: { total: 0, corrective: 0, gym: 0, stretch: 0, totalVolume: 0, avgPainReduction: null, consistencyPct: 0, currentStreak: 0 },
      bodyMap: { totalEntries: 0, topZones: [], asymmetries: [] },
      goals: { active: [], completed: [] },
      program: null,
      correlations: [],
    };

    const html = generateReportHTML(data);
    assert.ok(html.includes('No metric entries recorded'));
    assert.ok(html.includes('No body map entries recorded'));
    assert.ok(html.includes('No goals set yet'));
    assert.ok(html.includes('No active training program'));
  });
});
