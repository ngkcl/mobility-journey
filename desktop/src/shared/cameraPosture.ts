export type PoseLandmark = {
  x: number;
  y: number;
  z?: number | null;
  score?: number | null;
};

export type CameraPoseLandmarks = {
  nose: PoseLandmark;
  leftEar: PoseLandmark;
  rightEar: PoseLandmark;
  leftShoulder: PoseLandmark;
  rightShoulder: PoseLandmark;
};

export type CameraPostureBaseline = {
  headForwardDeg: number;
  shoulderTiltDeg: number;
  shoulderSymmetryDeg: number;
  backRoundingDeg: number;
};

export type CameraPostureMetrics = {
  headForwardDeg: number;
  shoulderTiltDeg: number;
  headForwardDeltaDeg: number;
  shoulderTiltDeltaDeg: number;
  shoulderSymmetryDeg: number;
  shoulderSymmetryDeltaDeg: number;
  backRoundingDeg: number;
  backRoundingDeltaDeg: number;
  compositeScore: number;
};

export enum CameraPostureState {
  GOOD_POSTURE = 'GOOD_POSTURE',
  WARNING = 'WARNING',
  SLOUCHING = 'SLOUCHING',
}

export type CameraPostureEvent = {
  timestamp: number;
  severity: 'warning' | 'slouching';
  durationMs: number;
  headForwardDeltaDeg: number;
  shoulderTiltDeltaDeg: number;
};

export type CameraPostureUpdate = {
  state: CameraPostureState;
  metrics: CameraPostureMetrics | null;
  event?: CameraPostureEvent;
};

export type CameraPostureOptions = {
  headForwardThresholdDeg?: number;
  shoulderTiltThresholdDeg?: number;
  shoulderSymmetryThresholdDeg?: number;
  backRoundingThresholdDeg?: number;
  warningMs?: number;
  slouchMs?: number;
  adaptiveThresholds?: boolean;
};

const DEFAULT_OPTIONS: Required<CameraPostureOptions> = {
  headForwardThresholdDeg: 12,
  shoulderTiltThresholdDeg: 8,
  shoulderSymmetryThresholdDeg: 5,
  backRoundingThresholdDeg: 15,
  warningMs: 5000,
  slouchMs: 10000,
  adaptiveThresholds: false,
};

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const midpoint = (a: PoseLandmark, b: PoseLandmark) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z:
    a.z === undefined || a.z === null || b.z === undefined || b.z === null
      ? 0
      : (a.z + b.z) / 2,
});

export const computePoseMetrics = (
  landmarks: CameraPoseLandmarks,
  baseline?: CameraPostureBaseline | null,
): CameraPostureMetrics => {
  const shoulderMid = midpoint(landmarks.leftShoulder, landmarks.rightShoulder);
  const earMid = midpoint(landmarks.leftEar, landmarks.rightEar);

  // Head forward calculation (ear to shoulder alignment)
  const dz = (landmarks.nose.z ?? 0) - (shoulderMid.z ?? 0);
  const dy = landmarks.nose.y - shoulderMid.y;
  const headForwardDeg = toDegrees(Math.atan2(Math.abs(dz), Math.abs(dy || 1e-5)));

  // Shoulder tilt (left vs right shoulder height difference)
  const dx = landmarks.leftShoulder.x - landmarks.rightShoulder.x;
  const dyShoulder = landmarks.leftShoulder.y - landmarks.rightShoulder.y;
  const shoulderTiltDeg = toDegrees(Math.atan2(dyShoulder, dx || 1e-5));

  // Shoulder symmetry (absolute height difference between shoulders)
  const shoulderSymmetryDeg = Math.abs(shoulderTiltDeg);

  // Back rounding (ear-to-shoulder angle - estimates spine curvature)
  // When slouching, ear moves forward relative to shoulder
  const earToShoulderDx = (earMid.z ?? 0) - (shoulderMid.z ?? 0);
  const earToShoulderDy = earMid.y - shoulderMid.y;
  const backRoundingDeg = toDegrees(Math.atan2(Math.abs(earToShoulderDx), Math.abs(earToShoulderDy || 1e-5)));

  const headForwardDeltaDeg = baseline
    ? Math.abs(headForwardDeg - baseline.headForwardDeg)
    : 0;
  const shoulderTiltDeltaDeg = baseline
    ? Math.abs(shoulderTiltDeg - baseline.shoulderTiltDeg)
    : 0;
  const shoulderSymmetryDeltaDeg = baseline
    ? Math.abs(shoulderSymmetryDeg - baseline.shoulderSymmetryDeg)
    : 0;
  const backRoundingDeltaDeg = baseline
    ? Math.abs(backRoundingDeg - baseline.backRoundingDeg)
    : 0;

  // Composite score: weighted average (head 40%, shoulder symmetry 30%, back rounding 30%)
  // Score is 100 - weighted sum of deltas (clamped to 0-100)
  const compositeScore = baseline
    ? Math.max(0, Math.min(100,
        100 - (
          headForwardDeltaDeg * 0.4 * 2 +
          shoulderSymmetryDeltaDeg * 0.3 * 3 +
          backRoundingDeltaDeg * 0.3 * 2
        )
      ))
    : 100;

  return {
    headForwardDeg,
    shoulderTiltDeg,
    headForwardDeltaDeg,
    shoulderTiltDeltaDeg,
    shoulderSymmetryDeg,
    shoulderSymmetryDeltaDeg,
    backRoundingDeg,
    backRoundingDeltaDeg,
    compositeScore,
  };
};

export const createCameraPostureDetector = (options: CameraPostureOptions = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let baseline: CameraPostureBaseline | null = null;
  let badStart: number | null = null;
  let state: CameraPostureState = CameraPostureState.GOOD_POSTURE;

  const calibrate = (landmarks: CameraPoseLandmarks) => {
    const metrics = computePoseMetrics(landmarks);
    baseline = {
      headForwardDeg: metrics.headForwardDeg,
      shoulderTiltDeg: metrics.shoulderTiltDeg,
      shoulderSymmetryDeg: metrics.shoulderSymmetryDeg,
      backRoundingDeg: metrics.backRoundingDeg,
    };
    badStart = null;
    state = CameraPostureState.GOOD_POSTURE;
    return baseline;
  };

  const update = (landmarks: CameraPoseLandmarks, timestamp: number): CameraPostureUpdate => {
    if (!baseline) {
      return { state, metrics: null };
    }

    const metrics = computePoseMetrics(landmarks, baseline);
    const isBad =
      metrics.headForwardDeltaDeg >= config.headForwardThresholdDeg ||
      metrics.shoulderSymmetryDeltaDeg >= config.shoulderSymmetryThresholdDeg ||
      metrics.backRoundingDeltaDeg >= config.backRoundingThresholdDeg;

    if (!isBad) {
      badStart = null;
      state = CameraPostureState.GOOD_POSTURE;
      return { state, metrics };
    }

    if (badStart === null) {
      badStart = timestamp;
    }

    const duration = timestamp - badStart;
    if (duration >= config.slouchMs) {
      const prev = state;
      state = CameraPostureState.SLOUCHING;
      return {
        state,
        metrics,
        event:
          prev !== CameraPostureState.SLOUCHING
            ? {
                timestamp,
                severity: 'slouching',
                durationMs: duration,
                headForwardDeltaDeg: metrics.headForwardDeltaDeg,
                shoulderTiltDeltaDeg: metrics.shoulderTiltDeltaDeg,
              }
            : undefined,
      };
    }

    if (duration >= config.warningMs) {
      const prev = state;
      state = CameraPostureState.WARNING;
      return {
        state,
        metrics,
        event:
          prev !== CameraPostureState.WARNING
            ? {
                timestamp,
                severity: 'warning',
                durationMs: duration,
                headForwardDeltaDeg: metrics.headForwardDeltaDeg,
                shoulderTiltDeltaDeg: metrics.shoulderTiltDeltaDeg,
              }
            : undefined,
      };
    }

    return { state, metrics };
  };

  return {
    calibrate,
    update,
    getBaseline: () => baseline,
    getState: () => state,
  };
};
