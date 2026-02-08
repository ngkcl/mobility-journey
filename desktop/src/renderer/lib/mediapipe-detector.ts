import { Pose, Results } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import type { CameraPoseLandmarks, PoseLandmark } from '../../shared/cameraPosture';

export interface MediaPipeDetectorOptions {
  modelComplexity?: 0 | 1 | 2;
  smoothLandmarks?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

const DEFAULT_OPTIONS: Required<MediaPipeDetectorOptions> = {
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

export class MediaPipeDetector {
  private pose: Pose | null = null;
  private camera: Camera | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private onResultsCallback: ((landmarks: CameraPoseLandmarks | null) => void) | null = null;
  private isRunning = false;

  constructor(private options: MediaPipeDetectorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async initialize(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement;

    this.pose = new Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      },
    });

    this.pose.setOptions({
      modelComplexity: this.options.modelComplexity,
      smoothLandmarks: this.options.smoothLandmarks,
      minDetectionConfidence: this.options.minDetectionConfidence,
      minTrackingConfidence: this.options.minTrackingConfidence,
    });

    this.pose.onResults((results) => this.handleResults(results));

    this.camera = new Camera(videoElement, {
      onFrame: async () => {
        if (this.pose && this.isRunning) {
          await this.pose.send({ image: videoElement });
        }
      },
      width: 640,
      height: 480,
    });
  }

  private handleResults(results: Results): void {
    if (!this.onResultsCallback) return;

    if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
      this.onResultsCallback(null);
      return;
    }

    const landmarks = results.poseLandmarks;

    const nose = landmarks[0];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    if (!nose || !leftEar || !rightEar || !leftShoulder || !rightShoulder) {
      this.onResultsCallback(null);
      return;
    }

    const cameraPoseLandmarks: CameraPoseLandmarks = {
      nose: this.toLandmark(nose),
      leftEar: this.toLandmark(leftEar),
      rightEar: this.toLandmark(rightEar),
      leftShoulder: this.toLandmark(leftShoulder),
      rightShoulder: this.toLandmark(rightShoulder),
    };

    this.onResultsCallback(cameraPoseLandmarks);
  }

  private toLandmark(landmark: any): PoseLandmark {
    return {
      x: landmark.x,
      y: landmark.y,
      z: landmark.z ?? null,
      score: landmark.visibility ?? null,
    };
  }

  async start(): Promise<void> {
    if (!this.camera) {
      throw new Error('Detector not initialized. Call initialize() first.');
    }
    this.isRunning = true;
    await this.camera.start();
  }

  stop(): void {
    this.isRunning = false;
    if (this.camera) {
      this.camera.stop();
    }
  }

  onResults(callback: (landmarks: CameraPoseLandmarks | null) => void): void {
    this.onResultsCallback = callback;
  }

  dispose(): void {
    this.stop();
    if (this.pose) {
      this.pose.close();
      this.pose = null;
    }
    this.camera = null;
    this.videoElement = null;
    this.onResultsCallback = null;
  }
}
