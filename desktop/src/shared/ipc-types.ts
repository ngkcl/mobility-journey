export type PostureState = 'GOOD_POSTURE' | 'WARNING' | 'SLOUCHING';

export interface PostureMetrics {
  headForwardDeg: number;
  shoulderTiltDeg: number;
  headForwardDeltaDeg: number;
  shoulderTiltDeltaDeg: number;
  shoulderSymmetryDeg: number;
  shoulderSymmetryDeltaDeg: number;
  backRoundingDeg: number;
  backRoundingDeltaDeg: number;
  compositeScore: number;
}

export interface PostureEvent {
  timestamp: number;
  severity: 'warning' | 'slouching';
  durationMs: number;
  headForwardDeltaDeg: number;
  shoulderTiltDeltaDeg: number;
}

export interface PostureUpdate {
  state: PostureState;
  metrics: PostureMetrics | null;
  event?: PostureEvent;
}

export interface CalibrationData {
  headForwardDeg: number;
  shoulderTiltDeg: number;
  shoulderSymmetryDeg: number;
  backRoundingDeg: number;
  timestamp: number;
}

export const IPC_CHANNELS = {
  POSTURE_UPDATE: 'posture:update',
  POSTURE_EVENT: 'posture:event',
  CALIBRATION_REQUEST: 'calibration:request',
  CALIBRATION_COMPLETE: 'calibration:complete',
  CAMERA_START: 'camera:start',
  CAMERA_STOP: 'camera:stop',
  CAMERA_ERROR: 'camera:error',
} as const;
