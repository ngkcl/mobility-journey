import { useCallback, useEffect, useRef, useState } from 'react';
import type { EmitterSubscription } from 'react-native';
import Constants from 'expo-constants';

type MotionValue = number | null;

// Only attempt native import in development builds (not Expo Go)
const isExpoGo = Constants.appOwnership === 'expo';

let headphoneMotion: any = null;
if (!isExpoGo) {
  try {
    headphoneMotion = require('react-native-headphone-motion');
  } catch {
    // Native module not available
  }
}

const clearSubscription = (subscription: EmitterSubscription | null) => {
  subscription?.remove();
};

export function useHeadphoneMotion() {
  const nativeAvailable = !!headphoneMotion;
  const [isAvailable, setIsAvailable] = useState(
    nativeAvailable ? headphoneMotion.isHeadphoneMotionAvailable : false
  );
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
    if (!isTrackingRef.current || !headphoneMotion) return;

    isTrackingRef.current = false;
    setIsTracking(false);
    resetMotion();

    try {
      await headphoneMotion.stopDeviceMotionUpdates();
    } catch {
      // Ignore native teardown errors.
    }

    clearSubscription(motionSubRef.current);
    clearSubscription(errorSubRef.current);
    motionSubRef.current = null;
    errorSubRef.current = null;
  }, [resetMotion]);

  const startTracking = useCallback(async () => {
    if (!headphoneMotion) return;

    if (!headphoneMotion.isHeadphoneMotionAvailable) {
      setIsAvailable(false);
      return;
    }

    if (isTrackingRef.current) return;

    const status = await headphoneMotion.requestPermission();
    if (status !== headphoneMotion.AuthorizationStatus.authorized) {
      setIsTracking(false);
      return;
    }

    await headphoneMotion.startListenDeviceMotionUpdates();

    isTrackingRef.current = true;
    setIsTracking(true);

    clearSubscription(motionSubRef.current);
    clearSubscription(errorSubRef.current);

    motionSubRef.current = headphoneMotion.onDeviceMotionUpdates((data: any) => {
      setPitch(data.attitude.pitchDeg);
      setRoll(data.attitude.rollDeg);
      setYaw(data.attitude.yawDeg);
    });

    errorSubRef.current = headphoneMotion.onDeviceMotionUpdatesError(() => {
      stopTracking();
    });
  }, [stopTracking]);

  useEffect(() => {
    if (!headphoneMotion) return;

    connectSubRef.current = headphoneMotion.onHeadphoneConnected(() => {
      setIsAvailable(true);
    });

    disconnectSubRef.current = headphoneMotion.onHeadphoneDisconnected(() => {
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
    nativeAvailable,
    isAvailable,
    isTracking,
    pitch,
    roll,
    yaw,
    startTracking,
    stopTracking,
  };
}
