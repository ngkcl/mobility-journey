const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { buildPostureTrend } = require('./postureSessions');

test('buildPostureTrend groups daily averages', () => {
  const sessions = [
    { id: '1', started_at: '2026-02-01T10:00:00Z', good_posture_pct: 60 },
    { id: '2', started_at: '2026-02-01T12:00:00Z', good_posture_pct: 80 },
    { id: '3', started_at: '2026-02-02T09:00:00Z', good_posture_pct: 90 },
  ];

  const trend = buildPostureTrend(sessions, 'daily');

  assert.equal(trend.length, 2);
  assert.equal(trend[0].value, 70);
  assert.equal(trend[1].value, 90);
});

test('buildPostureTrend groups weekly averages starting Monday', () => {
  const sessions = [
    { id: '1', started_at: '2026-02-02T10:00:00Z', good_posture_pct: 70 },
    { id: '2', started_at: '2026-02-04T10:00:00Z', good_posture_pct: 90 },
    { id: '3', started_at: '2026-02-08T10:00:00Z', good_posture_pct: 50 },
  ];

  const trend = buildPostureTrend(sessions, 'weekly');

  assert.equal(trend.length, 1);
  assert.equal(trend[0].value, 70);
});
