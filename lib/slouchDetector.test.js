const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  createSlouchDetector,
  SlouchState,
} = require('./slouchDetector');

test('does not emit events before calibration', () => {
  const detector = createSlouchDetector();
  const result = detector.update(-20, 0);

  assert.equal(result.state, SlouchState.GOOD_POSTURE);
  assert.equal(result.event, null);
});

test('debounces quick bad posture glances', () => {
  const detector = createSlouchDetector({ debounceMs: 1000 });
  detector.calibrate(0, 0);

  let result = detector.update(-20, 0);
  assert.equal(result.state, SlouchState.GOOD_POSTURE);
  assert.equal(result.event, null);

  result = detector.update(0, 500);
  assert.equal(result.state, SlouchState.GOOD_POSTURE);
  assert.equal(result.event, null);
});

test('transitions from warning to slouching with events', () => {
  const detector = createSlouchDetector({
    debounceMs: 1000,
    warningMs: 5000,
    slouchMs: 10000,
  });

  detector.calibrate(0, 0);

  detector.update(-20, 0);
  detector.update(-20, 1000);

  let result = detector.update(-20, 6000);
  assert.equal(result.state, SlouchState.WARNING);
  assert.ok(result.event);
  assert.equal(result.event.severity, 'warning');
  assert.equal(result.event.durationMs, 6000);

  result = detector.update(-20, 12000);
  assert.equal(result.state, SlouchState.SLOUCHING);
  assert.ok(result.event);
  assert.equal(result.event.severity, 'slouching');
  assert.equal(result.event.durationMs, 12000);

  result = detector.update(0, 13000);
  assert.equal(result.state, SlouchState.GOOD_POSTURE);
  assert.equal(result.event, null);
});
