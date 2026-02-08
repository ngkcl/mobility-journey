import { MediaPipeDetector } from './mediapipe-detector';
import { WebcamCapture } from './webcam-capture';
import {
  createCameraPostureDetector,
  CameraPostureState,
  type CameraPoseLandmarks,
  type CameraPostureBaseline,
  type CameraPostureUpdate,
} from '../../shared/cameraPosture';
import type { PostureUpdate, CalibrationData } from '../../shared/ipc-types';

export interface PostureMonitorOptions {
  frameCaptureIntervalMs?: number;
  headForwardThresholdDeg?: number;
  shoulderTiltThresholdDeg?: number;
  warningMs?: number;
  slouchMs?: number;
}

const DEFAULT_OPTIONS: Required<PostureMonitorOptions> = {
  frameCaptureIntervalMs: 1500,
  headForwardThresholdDeg: 12,
  shoulderTiltThresholdDeg: 8,
  warningMs: 5000,
  slouchMs: 30000,
};

export class PostureMonitor {
  private webcam: WebcamCapture;
  private detector: MediaPipeDetector;
  private postureDetector: ReturnType<typeof createCameraPostureDetector>;
  private videoElement: HTMLVideoElement | null = null;
  private analysisInterval: NodeJS.Timeout | null = null;
  private currentLandmarks: CameraPoseLandmarks | null = null;
  private isRunning = false;
  private options: Required<PostureMonitorOptions>;

  private onUpdateCallback: ((update: PostureUpdate) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  constructor(options: PostureMonitorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.webcam = new WebcamCapture();
    this.detector = new MediaPipeDetector({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    this.postureDetector = createCameraPostureDetector({
      headForwardThresholdDeg: this.options.headForwardThresholdDeg,
      shoulderTiltThresholdDeg: this.options.shoulderTiltThresholdDeg,
      warningMs: this.options.warningMs,
      slouchMs: this.options.slouchMs,
    });
  }

  async initialize(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement;

    try {
      const hasPermission = await this.webcam.requestPermission();
      if (!hasPermission) {
        throw new Error('Webcam permission denied');
      }

      await this.webcam.start(videoElement);
      await this.detector.initialize(videoElement);

      this.detector.onResults((landmarks) => {
        this.currentLandmarks = landmarks;
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to initialize posture monitor');
      this.handleError(err);
      throw err;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      await this.detector.start();
      this.isRunning = true;

      this.analysisInterval = setInterval(() => {
        this.analyzeFrame();
      }, this.options.frameCaptureIntervalMs);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to start posture monitor');
      this.handleError(err);
      throw err;
    }
  }

  stop(): void {
    this.isRunning = false;

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    this.detector.stop();
  }

  calibrate(): CalibrationData | null {
    if (!this.currentLandmarks) {
      return null;
    }

    const baseline = this.postureDetector.calibrate(this.currentLandmarks);
    return {
      headForwardDeg: baseline.headForwardDeg,
      shoulderTiltDeg: baseline.shoulderTiltDeg,
      shoulderSymmetryDeg: baseline.shoulderSymmetryDeg,
      backRoundingDeg: baseline.backRoundingDeg,
      timestamp: Date.now(),
    };
  }

  private analyzeFrame(): void {
    if (!this.currentLandmarks) {
      return;
    }

    const timestamp = Date.now();
    const update = this.postureDetector.update(this.currentLandmarks, timestamp);

    const postureUpdate: PostureUpdate = {
      state: this.mapPostureState(update.state),
      metrics: update.metrics,
      event: update.event,
    };

    if (this.onUpdateCallback) {
      this.onUpdateCallback(postureUpdate);
    }
  }

  private mapPostureState(state: CameraPostureState): PostureUpdate['state'] {
    switch (state) {
      case CameraPostureState.GOOD_POSTURE:
        return 'GOOD_POSTURE';
      case CameraPostureState.WARNING:
        return 'WARNING';
      case CameraPostureState.SLOUCHING:
        return 'SLOUCHING';
    }
  }

  private handleError(error: Error): void {
    console.error('PostureMonitor error:', error);
    if (this.onErrorCallback) {
      this.onErrorCallback(error);
    }
  }

  onUpdate(callback: (update: PostureUpdate) => void): void {
    this.onUpdateCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  getBaseline(): CameraPostureBaseline | null {
    return this.postureDetector.getBaseline();
  }

  getCurrentState(): PostureUpdate['state'] {
    return this.mapPostureState(this.postureDetector.getState());
  }

  isCalibrated(): boolean {
    return this.postureDetector.getBaseline() !== null;
  }

  dispose(): void {
    this.stop();
    this.detector.dispose();
    this.webcam.stop();
    this.currentLandmarks = null;
    this.onUpdateCallback = null;
    this.onErrorCallback = null;
  }
}
