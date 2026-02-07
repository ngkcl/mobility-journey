import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWeeklyMetricChanges,
  buildWeeklySummaryFallback,
} from '../src/lib/weeklySummary.js';

const sampleRows = [
  { entry_date: '2026-01-01', pain_level: 6, posture_score: 4, energy_level: 5 },
  { entry_date: '2026-01-03', pain_level: 5, posture_score: 5, energy_level: 6 },
  { entry_date: '2026-01-07', pain_level: 4, posture_score: 6, energy_level: 7 },
];

test('computeWeeklyMetricChanges calculates direction and change', () => {
  const changes = computeWeeklyMetricChanges(sampleRows);
  const pain = changes.find((metric) => metric.metric_key === 'pain_level');
  const posture = changes.find((metric) => metric.metric_key === 'posture_score');

  assert.equal(pain.start, 6);
  assert.equal(pain.end, 4);
  assert.equal(pain.change, -2);
  assert.equal(pain.direction, 'improving');

  assert.equal(posture.start, 4);
  assert.equal(posture.end, 6);
  assert.equal(posture.change, 2);
  assert.equal(posture.direction, 'improving');
});

test('buildWeeklySummaryFallback formats summary text', () => {
  const summary = buildWeeklySummaryFallback({
    weekStart: '2026-01-01',
    weekEnd: '2026-01-07',
    metricsChanges: [
      {
        label: 'Pain level',
        start: 6,
        end: 4,
        change: -2,
      },
    ],
    photosTaken: 3,
    exercisesCompleted: 5,
    aiHighlights: ['Shoulders more level', 'Improved symmetry score'],
  });

  assert.ok(summary.includes('Weekly Summary (2026-01-01 to 2026-01-07)'));
  assert.ok(summary.includes('Photos taken: 3'));
  assert.ok(summary.includes('Exercises completed: 5'));
  assert.ok(summary.includes('Pain level: 6 -> 4 (-2)'));
  assert.ok(summary.includes('Shoulders more level'));
});
