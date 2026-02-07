const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  formatDuration,
  computePercentage,
  formatAngle,
} = require('./postureSession');

test('formatDuration renders mm:ss for under one hour', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(65000), '01:05');
});

test('formatDuration renders hh:mm:ss for long durations', () => {
  assert.equal(formatDuration(3661000), '01:01:01');
});

test('computePercentage handles edge cases', () => {
  assert.equal(computePercentage(0, 0), 0);
  assert.equal(computePercentage(5, 10), 50);
});

test('formatAngle handles null values', () => {
  assert.equal(formatAngle(null), '-');
  assert.equal(formatAngle(12.345), '12.3 deg');
});
