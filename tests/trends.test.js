import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMetricTrends, computeTrend } from '../src/lib/trends.js';

test('computeTrend detects improving for lower-is-better metrics', () => {
  const points = [
    { date: '2026-01-01', value: 8 },
    { date: '2026-01-02', value: 7 },
    { date: '2026-01-03', value: 6 },
    { date: '2026-01-04', value: 5 },
  ];

  const trend = computeTrend(points, { key: 'pain_level', lowerIsBetter: true, minChange: 0.5 });

  assert.equal(trend.trend, 'improving');
  assert.equal(trend.metric_key, 'pain_level');
});

test('computeTrend detects stable when change is below threshold', () => {
  const points = [
    { date: '2026-01-01', value: 5 },
    { date: '2026-01-02', value: 5.1 },
    { date: '2026-01-03', value: 5.05 },
    { date: '2026-01-04', value: 5.02 },
  ];

  const trend = computeTrend(points, { key: 'posture_score', lowerIsBetter: false, minChange: 0.5 });

  assert.equal(trend.trend, 'stable');
});

test('analyzeMetricTrends filters metrics with insufficient data', () => {
  const rows = [
    { entry_date: '2026-01-01', pain_level: 6 },
    { entry_date: '2026-01-02', pain_level: 5 },
    { entry_date: '2026-01-03', pain_level: 4 },
  ];

  const trends = analyzeMetricTrends(rows, [
    { key: 'pain_level', lowerIsBetter: true, minChange: 0.5 },
  ]);

  assert.equal(trends.length, 0);
});
