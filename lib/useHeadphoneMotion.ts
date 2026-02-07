import { useCallback, useEffect, useRef, useState } from 'react';
import type { EmitterSubscription } from 'react-native';
import {
  AuthorizationStatus,
  isHeadphoneMotionAvailable,
  onDeviceMotionUpdates,
  onDeviceMotionUpdatesError,
  onHeadphoneConnected,
  onHeadphoneDisconnected,
  requestPermission,
  startListenDeviceMotionUpdates,
  stopDeviceMotionUpdates,
} from 'react-native-headphone-motion';

type MotionValue = number | null;

const clearSubscription = (subscription: EmitterSubscription | null) => {
  subscription?.remove();
};

export function useHeadphoneMotion() {
  const [isAvailable, setIsAvailable] = useState(isHeadphoneMotionAvailable);
  const [isTracking, setIsTracking] = useState(false);
  const [pitch, setPitch] = useState<MotionValue>(null);
  const [roll, setRoll] = useState<MotionValue>(null);
  const [yaw, setYaw] = useState<MotionValue>(null);

  const motionSubRef = useRef<EmitterSubscription | null>(null);
  const errorSubRef = useRef<EmitterSubscription | null>(null);
  const connectSubRef = useRef<EmitterSubscription | null>(null);
  const disconnectSubRef = useRef<EmitterSubscription | null>(null);
  const isTrackingRef = useRef(false);

  const resetMotion = useCallback(() => {
    setPitch(null);
    setRoll(null);
    setYaw(null);
  }, []);

  const stopTracking = useCallback(async () => {
    if (!isTrackingRef.current) {
      return;
    }

    isTrackingRef.current = false;
    setIsTracking(false);
    resetMotion();

    try {
      await stopDeviceMotionUpdates();
    } catch {
      // Ignore native teardown errors.
    }

    clearSubscription(motionSubRef.current);
    clearSubscription(errorSubRef.current);
    motionSubRef.current = null;
    errorSubRef.current = null;
  }, [resetMotion]);

  const startTracking = useCallback(async () => {
    if (!isHeadphoneMotionAvailable) {
      setIsAvailable(false);
      return;
    }

    if (isTrackingRef.current) {
      return;
    }

    const status = await requestPermission();
    if (status !== AuthorizationStatus.authorized) {
      setIsTracking(false);
      return;
    }

    await startListenDeviceMotionUpdates();

    isTrackingRef.current = true;
    setIsTracking(true);

    clearSubscription(motionSubRef.current);
    clearSubscription(errorSubRef.current);

    motionSubRef.current = onDeviceMotionUpdates((data) => {
      setPitch(data.attitude.pitchDeg);
      setRoll(data.attitude.rollDeg);
      setYaw(data.attitude.yawDeg);
    });

    errorSubRef.current = onDeviceMotionUpdatesError(() => {
      stopTracking();
    });
  }, [stopTracking]);

  useEffect(() => {
    connectSubRef.current = onHeadphoneConnected(() => {
      setIsAvailable(true);
    });

    disconnectSubRef.current = onHeadphoneDisconnected(() => {
      setIsAvailable(false);
      stopTracking();
    });

    return () => {
      clearSubscription(connectSubRef.current);
      clearSubscription(disconnectSubRef.current);
      connectSubRef.current = null;
      disconnectSubRef.current = null;
      stopTracking();
    };
  }, [stopTracking]);

  return {
    isAvailable,
    isTracking,
    pitch,
    roll,
    yaw,
    startTracking,
    stopTracking,
  };
}
