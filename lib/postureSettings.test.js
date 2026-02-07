const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  normalizePostureSettings,
  DEFAULT_POSTURE_SETTINGS,
} = require('./postureSettings');

test('normalizePostureSettings returns defaults for empty input', () => {
  assert.deepEqual(normalizePostureSettings(), DEFAULT_POSTURE_SETTINGS);
  assert.deepEqual(normalizePostureSettings(null), DEFAULT_POSTURE_SETTINGS);
});

test('normalizePostureSettings clamps numeric ranges', () => {
  const result = normalizePostureSettings({
    thresholdDeg: 100,
    alertDelaySec: 1,
    hapticsEnabled: true,
    soundEnabled: true,
  });

  assert.equal(result.thresholdDeg, 30);
  assert.equal(result.alertDelaySec, 3);
});

test('normalizePostureSettings ignores invalid values', () => {
  const result = normalizePostureSettings({
    thresholdDeg: Number.NaN,
    alertDelaySec: Infinity,
    hapticsEnabled: 'no',
    soundEnabled: 0,
  });

  assert.deepEqual(result, DEFAULT_POSTURE_SETTINGS);
});
