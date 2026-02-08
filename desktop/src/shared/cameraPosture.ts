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
};

export type CameraPostureMetrics = {
  headForwardDeg: number;
  shoulderTiltDeg: number;
  headForwardDeltaDeg: number;
  shoulderTiltDeltaDeg: number;
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
  warningMs?: number;
  slouchMs?: number;
};

const DEFAULT_OPTIONS: Required<CameraPostureOptions> = {
  headForwardThresholdDeg: 12,
  shoulderTiltThresholdDeg: 8,
  warningMs: 5000,
  slouchMs: 10000,
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
  const dz = (landmarks.nose.z ?? 0) - (shoulderMid.z ?? 0);
  const dy = landmarks.nose.y - shoulderMid.y;
  const dx = landmarks.leftShoulder.x - landmarks.rightShoulder.x;
  const dyShoulder = landmarks.leftShoulder.y - landmarks.rightShoulder.y;

  const headForwardDeg = toDegrees(Math.atan2(Math.abs(dz), Math.abs(dy || 1e-5)));
  const shoulderTiltDeg = toDegrees(Math.atan2(dyShoulder, dx || 1e-5));

  const headForwardDeltaDeg = baseline
    ? Math.abs(headForwardDeg - baseline.headForwardDeg)
    : 0;
  const shoulderTiltDeltaDeg = baseline
    ? Math.abs(shoulderTiltDeg - baseline.shoulderTiltDeg)
    : 0;

  return {
    headForwardDeg,
    shoulderTiltDeg,
    headForwardDeltaDeg,
    shoulderTiltDeltaDeg,
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
      metrics.shoulderTiltDeltaDeg >= config.shoulderTiltThresholdDeg;

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
