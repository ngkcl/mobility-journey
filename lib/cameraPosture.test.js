const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  computePoseMetrics,
  createCameraPostureDetector,
  CameraPostureState,
} = require('./cameraPosture');

const buildLandmarks = (overrides = {}) => ({
  nose: { x: 0.5, y: 0.3, z: -0.1 },
  leftEar: { x: 0.4, y: 0.3, z: -0.08 },
  rightEar: { x: 0.6, y: 0.3, z: -0.08 },
  leftShoulder: { x: 0.35, y: 0.6, z: 0 },
  rightShoulder: { x: 0.65, y: 0.6, z: 0 },
  ...overrides,
});

test('computePoseMetrics returns deltas when baseline provided', () => {
  const baseline = computePoseMetrics(buildLandmarks());
  const metrics = computePoseMetrics(buildLandmarks({ nose: { x: 0.5, y: 0.25, z: -0.2 } }), {
    headForwardDeg: baseline.headForwardDeg,
    shoulderTiltDeg: baseline.shoulderTiltDeg,
  });

  assert.ok(metrics.headForwardDeltaDeg > 0);
  assert.equal(metrics.shoulderTiltDeltaDeg, 0);
});

test('createCameraPostureDetector transitions through warning to slouching', () => {
  const detector = createCameraPostureDetector({
    headForwardThresholdDeg: 1,
    shoulderTiltThresholdDeg: 1,
    warningMs: 2000,
    slouchMs: 4000,
  });

  const baseline = buildLandmarks();
  detector.calibrate(baseline);

  let update = detector.update(buildLandmarks({ nose: { x: 0.5, y: 0.2, z: -0.3 } }), 0);
  assert.equal(update.state, CameraPostureState.GOOD_POSTURE);

  update = detector.update(buildLandmarks({ nose: { x: 0.5, y: 0.2, z: -0.3 } }), 2500);
  assert.equal(update.state, CameraPostureState.WARNING);
  assert.equal(update.event.severity, 'warning');

  update = detector.update(buildLandmarks({ nose: { x: 0.5, y: 0.2, z: -0.3 } }), 5000);
  assert.equal(update.state, CameraPostureState.SLOUCHING);
  assert.equal(update.event.severity, 'slouching');
});
