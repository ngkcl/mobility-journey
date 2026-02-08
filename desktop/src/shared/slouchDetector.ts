export const SlouchState = {
  GOOD_POSTURE: 'GOOD_POSTURE',
  WARNING: 'WARNING',
  SLOUCHING: 'SLOUCHING',
} as const;

export type SlouchState = (typeof SlouchState)[keyof typeof SlouchState];

export type SlouchSeverity = 'warning' | 'slouching';

export interface SlouchEvent {
  timestamp: number;
  durationMs: number;
  severity: SlouchSeverity;
  baselinePitch: number;
  pitch: number;
  thresholdDeg: number;
}

export interface SlouchDetectorOptions {
  thresholdDeg?: number;
  warningMs?: number;
  slouchMs?: number;
  debounceMs?: number;
}

export interface SlouchDetectorUpdateResult {
  state: SlouchState;
  event: SlouchEvent | null;
}

export interface SlouchDetectorSnapshot {
  state: SlouchState;
  baselinePitch: number | null;
  isCalibrated: boolean;
  lastPitch: number | null;
}

const DEFAULTS = {
  thresholdDeg: 15,
  warningMs: 5000,
  slouchMs: 10000,
  debounceMs: 1000,
};

const isFiniteNumber = (value: number) => Number.isFinite(value);

export function createSlouchDetector(options: SlouchDetectorOptions = {}) {
  const config = { ...DEFAULTS, ...options };
  let baselinePitch: number | null = null;
  let state: SlouchState = SlouchState.GOOD_POSTURE;
  let debounceStart: number | null = null;
  let badPostureStart: number | null = null;
  let lastPitch: number | null = null;

  const resetTimers = () => {
    debounceStart = null;
    badPostureStart = null;
  };

  const reset = () => {
    baselinePitch = null;
    lastPitch = null;
    state = SlouchState.GOOD_POSTURE;
    resetTimers();
  };

  const calibrate = (pitch: number, timestamp: number = Date.now()) => {
    if (!isFiniteNumber(pitch)) {
      return baselinePitch;
    }

    baselinePitch = pitch;
    lastPitch = pitch;
    state = SlouchState.GOOD_POSTURE;
    debounceStart = null;
    badPostureStart = null;

    return baselinePitch;
  };

  const update = (
    pitch: number | null,
    timestamp: number = Date.now(),
  ): SlouchDetectorUpdateResult => {
    if (pitch === null || !isFiniteNumber(pitch) || baselinePitch === null) {
      lastPitch = pitch ?? null;
      resetTimers();
      state = SlouchState.GOOD_POSTURE;
      return { state, event: null };
    }

    lastPitch = pitch;

    const delta = pitch - baselinePitch;
    const isBadPosture = delta <= -config.thresholdDeg;

    if (!isBadPosture) {
      resetTimers();
      state = SlouchState.GOOD_POSTURE;
      return { state, event: null };
    }

    if (debounceStart === null) {
      debounceStart = timestamp;
    }

    const debounceElapsed = timestamp - debounceStart;
    if (debounceElapsed < config.debounceMs) {
      return { state: SlouchState.GOOD_POSTURE, event: null };
    }

    if (badPostureStart === null) {
      badPostureStart = debounceStart;
    }

    const badDuration = timestamp - badPostureStart;

    let nextState: SlouchState = SlouchState.GOOD_POSTURE;
    if (badDuration >= config.slouchMs) {
      nextState = SlouchState.SLOUCHING;
    } else if (badDuration >= config.warningMs) {
      nextState = SlouchState.WARNING;
    }

    let event: SlouchEvent | null = null;
    if (nextState !== state) {
      if (nextState === SlouchState.WARNING || nextState === SlouchState.SLOUCHING) {
        event = {
          timestamp,
          durationMs: badDuration,
          severity: nextState === SlouchState.WARNING ? 'warning' : 'slouching',
          baselinePitch,
          pitch,
          thresholdDeg: config.thresholdDeg,
        };
      }
      state = nextState;
    }

    return { state, event };
  };

  const getSnapshot = (): SlouchDetectorSnapshot => ({
    state,
    baselinePitch,
    isCalibrated: baselinePitch !== null,
    lastPitch,
  });

  return {
    calibrate,
    update,
    reset,
    getSnapshot,
    getState: () => state,
    getBaseline: () => baselinePitch,
  };
}
