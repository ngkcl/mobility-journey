import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Switch, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import {
  CameraPostureState,
  computePoseMetrics,
  createCameraPostureDetector,
  type CameraPoseLandmarks,
  type CameraPostureMetrics,
} from '../lib/cameraPosture';

const STATUS_CONFIG = {
  [CameraPostureState.GOOD_POSTURE]: {
    label: 'Good posture',
    color: '#22c55e',
  },
  [CameraPostureState.WARNING]: {
    label: 'Warning',
    color: '#f59e0b',
  },
  [CameraPostureState.SLOUCHING]: {
    label: 'Slouching',
    color: '#ef4444',
  },
};

const ALERT_COOLDOWN_MS = 30000;
const WEB_FRAME_THROTTLE_MS = 200;
const NATIVE_SAMPLE_MS = 1200;
const MIN_CONFIDENCE = 0.3;

type PoseKeypoint = {
  name?: string;
  part?: string;
  x: number;
  y: number;
  z?: number;
  score?: number;
  confidence?: number;
};

const KEYPOINT_ALIASES: Record<keyof CameraPoseLandmarks, string[]> = {
  nose: ['nose'],
  leftEar: ['left_ear', 'leftEar'],
  rightEar: ['right_ear', 'rightEar'],
  leftShoulder: ['left_shoulder', 'leftShoulder'],
  rightShoulder: ['right_shoulder', 'rightShoulder'],
};

const getKeypoint = (
  keypoints: PoseKeypoint[],
  keypoints3D: PoseKeypoint[] | undefined,
  names: string[],
): PoseKeypoint | null => {
  const match = keypoints.find((point) => names.includes(point.name ?? point.part ?? ''));
  if (!match) {
    return null;
  }
  const match3d = keypoints3D?.find((point) =>
    names.includes(point.name ?? point.part ?? ''),
  );
  return {
    ...match,
    z: match3d?.z ?? match.z ?? 0,
    score: match.score ?? match.confidence ?? 1,
  };
};

const extractLandmarks = (pose: any): CameraPoseLandmarks | null => {
  if (!pose) {
    return null;
  }

  const keypoints: PoseKeypoint[] = pose.keypoints ?? [];
  const keypoints3D: PoseKeypoint[] | undefined = pose.keypoints3D ?? undefined;

  const nose = getKeypoint(keypoints, keypoints3D, KEYPOINT_ALIASES.nose);
  const leftEar = getKeypoint(keypoints, keypoints3D, KEYPOINT_ALIASES.leftEar);
  const rightEar = getKeypoint(keypoints, keypoints3D, KEYPOINT_ALIASES.rightEar);
  const leftShoulder = getKeypoint(keypoints, keypoints3D, KEYPOINT_ALIASES.leftShoulder);
  const rightShoulder = getKeypoint(keypoints, keypoints3D, KEYPOINT_ALIASES.rightShoulder);

  if (!nose || !leftEar || !rightEar || !leftShoulder || !rightShoulder) {
    return null;
  }

  const required = [nose, leftEar, rightEar, leftShoulder, rightShoulder];
  if (required.some((point) => (point.score ?? 1) < MIN_CONFIDENCE)) {
    return null;
  }

  return { nose, leftEar, rightEar, leftShoulder, rightShoulder };
};

const formatDegrees = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return '-';
  }
  return `${value.toFixed(1)} deg`;
};

export default function CameraPostureMonitor() {
  const detectorRef = useRef(createCameraPostureDetector());
  const tfRef = useRef<any>(null);
  const decodeJpegRef = useRef<((data: Uint8Array) => any) | null>(null);
  const poseDetectorRef = useRef<any>(null);
  const lastAlertRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastLandmarksRef = useRef<CameraPoseLandmarks | null>(null);
  const cameraRef = useRef<React.ElementRef<typeof CameraView> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [state, setState] = useState<CameraPostureState>(CameraPostureState.GOOD_POSTURE);
  const [metrics, setMetrics] = useState<CameraPostureMetrics | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);

  const status = STATUS_CONFIG[state];
  const WebVideo = Platform.OS === 'web' ? ('video' as any) : View;
  const WebCanvas = Platform.OS === 'web' ? ('canvas' as any) : View;

  const ensurePermissions = useCallback(async () => {
    if (Platform.OS === 'web') {
      return true;
    }
    if (permission?.granted) {
      return true;
    }
    const result = await requestPermission();
    return result.granted;
  }, [permission, requestPermission]);

  useEffect(() => {
    let active = true;
    const setup = async () => {
      try {
        const tf = await import('@tensorflow/tfjs');
        if (Platform.OS !== 'web') {
          const tfNative = await import('@tensorflow/tfjs-react-native');
          decodeJpegRef.current = tfNative.decodeJpeg;
          if (tf.getBackend() !== 'rn-webgl') {
            await tf.setBackend('rn-webgl');
          }
          await tf.ready();
        } else {
          if (tf.getBackend() !== 'webgl') {
            await tf.setBackend('webgl');
          }
          await tf.ready();
        }

        const poseDetection = await import('@tensorflow-models/pose-detection');
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.BlazePose,
          {
            runtime: 'tfjs',
            modelType: 'full',
            enableSmoothing: true,
          },
        );

        if (!active) {
          detector.dispose?.();
          return;
        }

        tfRef.current = tf;
        poseDetectorRef.current = detector;
        setReady(true);
      } catch (err) {
        setError('Unable to initialize posture detection.');
      }
    };

    setup();

    return () => {
      active = false;
      poseDetectorRef.current?.dispose?.();
    };
  }, []);

  const triggerAlert = useCallback(async (severity: 'warning' | 'slouching') => {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(severity === 'slouching' ? 300 : 150);
      }
      return;
    }

    const style =
      severity === 'slouching'
        ? Haptics.ImpactFeedbackStyle.Heavy
        : Haptics.ImpactFeedbackStyle.Light;
    await Haptics.impactAsync(style);
  }, []);

  const handleLandmarks = useCallback(
    (landmarks: CameraPoseLandmarks, timestamp: number) => {
      lastLandmarksRef.current = landmarks;
      const result = detectorRef.current.update(landmarks, timestamp);
      setState(result.state);
      setMetrics(result.metrics);

      if (result.event) {
        const lastAlert = lastAlertRef.current ?? 0;
        if (timestamp - lastAlert >= ALERT_COOLDOWN_MS) {
          lastAlertRef.current = timestamp;
          triggerAlert(result.event.severity).catch(() => null);
        }
      }
    },
    [triggerAlert],
  );

  useEffect(() => {
    if (!isRunning || Platform.OS !== 'web' || !ready) {
      return;
    }

    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    let active = true;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
        });
        if (!active || !videoRef.current) {
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      } catch (err) {
        setError('Camera access denied.');
      }
    };

    const drawOverlay = (pose: any) => {
      if (!showOverlay || !canvasRef.current || !videoRef.current) {
        return;
      }
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) {
        return;
      }
      const width = videoRef.current.videoWidth;
      const height = videoRef.current.videoHeight;
      canvasRef.current.width = width;
      canvasRef.current.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(94,234,212,0.8)';
      ctx.strokeStyle = 'rgba(94,234,212,0.8)';
      ctx.lineWidth = 2;

      const keypoints: PoseKeypoint[] = pose?.keypoints ?? [];
      keypoints.forEach((point) => {
        if ((point.score ?? 1) < MIN_CONFIDENCE) {
          return;
        }
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      const landmarks = extractLandmarks(pose);
      if (landmarks) {
        ctx.beginPath();
        ctx.moveTo(landmarks.leftShoulder.x, landmarks.leftShoulder.y);
        ctx.lineTo(landmarks.rightShoulder.x, landmarks.rightShoulder.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(landmarks.nose.x, landmarks.nose.y);
        ctx.lineTo(
          (landmarks.leftShoulder.x + landmarks.rightShoulder.x) / 2,
          (landmarks.leftShoulder.y + landmarks.rightShoulder.y) / 2,
        );
        ctx.stroke();
      }
    };

    const detect = async (timestamp: number) => {
      if (!active || !poseDetectorRef.current || !videoRef.current) {
        return;
      }

      if (timestamp - lastFrameRef.current < WEB_FRAME_THROTTLE_MS) {
        rafId = requestAnimationFrame(detect);
        return;
      }
      lastFrameRef.current = timestamp;

      const video = videoRef.current;
      if (video.readyState < 2) {
        rafId = requestAnimationFrame(detect);
        return;
      }

      try {
        const poses = await poseDetectorRef.current.estimatePoses(video);
        const pose = poses?.[0];
        drawOverlay(pose);
        const landmarks = extractLandmarks(pose);
        if (landmarks) {
          handleLandmarks(landmarks, Date.now());
        }
      } catch (err) {
        setError('Unable to read camera frames.');
      }

      rafId = requestAnimationFrame(detect);
    };

    startCamera().catch(() => null);
    rafId = requestAnimationFrame(detect);

    return () => {
      active = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isRunning, ready, handleLandmarks, showOverlay]);

  useEffect(() => {
    if (!isRunning || Platform.OS === 'web' || !ready) {
      return;
    }

    let active = true;
    const runDetection = async () => {
      if (
        inFlightRef.current ||
        !cameraRef.current ||
        !poseDetectorRef.current ||
        !decodeJpegRef.current ||
        !tfRef.current
      ) {
        return;
      }

      inFlightRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.35,
          skipProcessing: true,
        });
        if (!photo.base64) {
          return;
        }
        const imageBuffer = tfRef.current.util.encodeString(photo.base64, 'base64')
          .buffer;
        const imageTensor = decodeJpegRef.current(new Uint8Array(imageBuffer));
        const poses = await poseDetectorRef.current.estimatePoses(imageTensor);
        imageTensor.dispose?.();
        const pose = poses?.[0];
        const landmarks = extractLandmarks(pose);
        if (landmarks) {
          handleLandmarks(landmarks, Date.now());
        }
      } catch (err) {
        setError('Unable to read camera frames.');
      } finally {
        inFlightRef.current = false;
      }
    };

    const interval = setInterval(() => {
      if (!active) {
        return;
      }
      runDetection().catch(() => null);
    }, NATIVE_SAMPLE_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isRunning, ready, handleLandmarks]);

  const handleStart = useCallback(async () => {
    const allowed = await ensurePermissions();
    if (!allowed) {
      setError('Camera permission is required.');
      return;
    }
    setError(null);
    setIsRunning(true);
  }, [ensurePermissions]);

  const handleStop = useCallback(() => {
    setIsRunning(false);
  }, []);

  const handleCalibration = useCallback(() => {
    const landmarks = lastLandmarksRef.current;
    if (!landmarks) {
      return;
    }
    const baseline = detectorRef.current.calibrate(landmarks);
    setMetrics(computePoseMetrics(landmarks, baseline));
    setState(CameraPostureState.GOOD_POSTURE);
  }, []);

  const summary = useMemo(() => {
    if (!metrics) {
      return { headForward: '-', shoulderTilt: '-' };
    }
    return {
      headForward: formatDegrees(metrics.headForwardDeltaDeg),
      shoulderTilt: formatDegrees(metrics.shoulderTiltDeltaDeg),
    };
  }, [metrics]);

  return (
    <View className="bg-slate-900 rounded-2xl p-5 border border-slate-800">
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-white font-semibold">Camera posture</Text>
          <Text className="text-slate-400 text-xs">
            Web + mobile front camera tracking
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="text-slate-400 text-xs">Overlay</Text>
          <Switch
            value={showOverlay}
            onValueChange={setShowOverlay}
            trackColor={{ false: '#334155', true: '#14b8a6' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {!ready ? (
        <View className="items-center py-6">
          <ActivityIndicator color="#5eead4" />
          <Text className="text-slate-400 text-xs mt-2">Loading pose model...</Text>
        </View>
      ) : null}

      {error ? (
        <Text className="text-rose-300 text-sm mb-3">{error}</Text>
      ) : null}

      {Platform.OS === 'web' ? (
        <View className="rounded-2xl overflow-hidden bg-black mb-4">
          <View
            style={{
              aspectRatio: 4 / 3,
              position: 'relative',
              backgroundColor: '#000',
            }}
          >
            <WebVideo
              ref={videoRef as any}
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <WebCanvas
              ref={canvasRef as any}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
            />
          </View>
        </View>
      ) : (
        <View className="rounded-2xl overflow-hidden bg-black mb-4">
          <CameraView
            ref={cameraRef}
            facing="front"
            style={{ width: '100%', aspectRatio: 4 / 3 }}
            mirror
          />
        </View>
      )}

      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center gap-2">
          <View
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: status.color }}
          />
          <Text className="text-white font-semibold">{status.label}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleCalibration}
            className="bg-slate-800 px-3 py-2 rounded-xl"
          >
            <Text className="text-xs text-white">Calibrate</Text>
          </Pressable>
          <Pressable
            onPress={isRunning ? handleStop : handleStart}
            className="bg-teal-500 px-3 py-2 rounded-xl"
          >
            <Text className="text-xs text-white">
              {isRunning ? 'Stop' : 'Start'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-slate-400 text-sm">Head forward delta</Text>
        <Text className="text-white font-semibold">{summary.headForward}</Text>
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-slate-400 text-sm">Shoulder tilt delta</Text>
        <Text className="text-white font-semibold">{summary.shoulderTilt}</Text>
      </View>
    </View>
  );
}
