// Type declarations for @mediapipe/pose and @mediapipe/camera_utils
// These packages don't ship their own types

declare module '@mediapipe/pose' {
  export interface NormalizedLandmark {
    x: number;
    y: number;
    z?: number;
    visibility?: number;
  }

  export interface Results {
    poseLandmarks?: NormalizedLandmark[];
    poseWorldLandmarks?: NormalizedLandmark[];
    segmentationMask?: ImageData;
    image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
  }

  export interface PoseOptions {
    modelComplexity?: 0 | 1 | 2;
    smoothLandmarks?: boolean;
    enableSegmentation?: boolean;
    smoothSegmentation?: boolean;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
  }

  export interface PoseConfig {
    locateFile?: (file: string) => string;
  }

  export class Pose {
    constructor(config?: PoseConfig);
    setOptions(options: PoseOptions): void;
    onResults(callback: (results: Results) => void): void;
    send(inputs: { image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement }): Promise<void>;
    close(): void;
    reset(): void;
  }

  // Landmark indices for reference
  export const POSE_LANDMARKS: {
    NOSE: 0;
    LEFT_EYE_INNER: 1;
    LEFT_EYE: 2;
    LEFT_EYE_OUTER: 3;
    RIGHT_EYE_INNER: 4;
    RIGHT_EYE: 5;
    RIGHT_EYE_OUTER: 6;
    LEFT_EAR: 7;
    RIGHT_EAR: 8;
    MOUTH_LEFT: 9;
    MOUTH_RIGHT: 10;
    LEFT_SHOULDER: 11;
    RIGHT_SHOULDER: 12;
    LEFT_ELBOW: 13;
    RIGHT_ELBOW: 14;
    LEFT_WRIST: 15;
    RIGHT_WRIST: 16;
    LEFT_PINKY: 17;
    RIGHT_PINKY: 18;
    LEFT_INDEX: 19;
    RIGHT_INDEX: 20;
    LEFT_THUMB: 21;
    RIGHT_THUMB: 22;
    LEFT_HIP: 23;
    RIGHT_HIP: 24;
    LEFT_KNEE: 25;
    RIGHT_KNEE: 26;
    LEFT_ANKLE: 27;
    RIGHT_ANKLE: 28;
    LEFT_HEEL: 29;
    RIGHT_HEEL: 30;
    LEFT_FOOT_INDEX: 31;
    RIGHT_FOOT_INDEX: 32;
  };
}

declare module '@mediapipe/camera_utils' {
  export interface CameraOptions {
    onFrame: () => Promise<void>;
    width?: number;
    height?: number;
    facingMode?: string;
  }

  export class Camera {
    constructor(
      videoElement: HTMLVideoElement,
      options: CameraOptions
    );
    start(): Promise<void>;
    stop(): void;
  }
}
