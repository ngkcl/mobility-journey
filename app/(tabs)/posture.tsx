import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHeadphoneMotion } from '../../lib/useHeadphoneMotion';
import { createSlouchDetector, SlouchState } from '../../lib/slouchDetector';
import { computePercentage, formatAngle, formatDuration } from '../../lib/postureSession';

const STATUS_CONFIG = {
  [SlouchState.GOOD_POSTURE]: {
    label: 'Good posture',
    color: '#22c55e',
    bg: 'bg-emerald-500/15',
  },
  [SlouchState.WARNING]: {
    label: 'Warning',
    color: '#f59e0b',
    bg: 'bg-amber-500/15',
  },
  [SlouchState.SLOUCHING]: {
    label: 'Slouching',
    color: '#ef4444',
    bg: 'bg-rose-500/15',
  },
};

const ANGLE_HELP = {
  pitch: 'Forward/back tilt',
  roll: 'Side tilt',
  yaw: 'Left/right turn',
};

export default function PostureScreen() {
  const {
    isAvailable,
    isTracking,
    pitch,
    roll,
    yaw,
    startTracking,
    stopTracking,
  } = useHeadphoneMotion();

  const detectorRef = useRef(createSlouchDetector());
  const wasTrackingRef = useRef(false);
  const lastSampleRef = useRef<number | null>(null);
  const lastStateRef = useRef<SlouchState>(SlouchState.GOOD_POSTURE);
  const goodMsRef = useRef(0);
  const goodStreakRef = useRef(0);
  const longestGoodMsRef = useRef(0);
  const slouchCountRef = useRef(0);

  const [slouchState, setSlouchState] = useState<SlouchState>(SlouchState.GOOD_POSTURE);
  const [baselinePitch, setBaselinePitch] = useState<number | null>(null);
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [goodMs, setGoodMs] = useState(0);
  const [longestGoodMs, setLongestGoodMs] = useState(0);
  const [slouchCount, setSlouchCount] = useState(0);

  const resetSessionStats = () => {
    lastSampleRef.current = null;
    lastStateRef.current = SlouchState.GOOD_POSTURE;
    goodMsRef.current = 0;
    goodStreakRef.current = 0;
    longestGoodMsRef.current = 0;
    slouchCountRef.current = 0;
    setElapsedMs(0);
    setGoodMs(0);
    setLongestGoodMs(0);
    setSlouchCount(0);
    setSlouchState(SlouchState.GOOD_POSTURE);

    const baseline = detectorRef.current.getBaseline();
    if (baseline !== null) {
      detectorRef.current.calibrate(baseline);
    }
  };

  const handleToggle = async () => {
    if (isTracking) {
      await stopTracking();
      return;
    }

    await startTracking();
  };

  const handleCalibrate = () => {
    if (pitch === null || !Number.isFinite(pitch)) {
      return;
    }

    const baseline = detectorRef.current.calibrate(pitch);
    setBaselinePitch(baseline);
    setSlouchState(SlouchState.GOOD_POSTURE);
  };

  useEffect(() => {
    if (isTracking && !wasTrackingRef.current) {
      resetSessionStats();
      setSessionStart(Date.now());
    }

    if (!isTracking && wasTrackingRef.current) {
      setSessionStart(null);
      lastSampleRef.current = null;
    }

    wasTrackingRef.current = isTracking;
  }, [isTracking]);

  useEffect(() => {
    if (!isTracking || sessionStart === null) {
      return;
    }

    const timer = setInterval(() => {
      setElapsedMs(Date.now() - sessionStart);
    }, 1000);

    return () => clearInterval(timer);
  }, [isTracking, sessionStart]);

  useEffect(() => {
    if (!isTracking || sessionStart === null) {
      return;
    }

    if (pitch === null || !Number.isFinite(pitch)) {
      return;
    }

    const now = Date.now();
    const lastSample = lastSampleRef.current ?? now;
    const delta = Math.max(0, now - lastSample);

    const prevState = lastStateRef.current;
    if (prevState === SlouchState.GOOD_POSTURE) {
      goodMsRef.current += delta;
      goodStreakRef.current += delta;
      if (goodStreakRef.current > longestGoodMsRef.current) {
        longestGoodMsRef.current = goodStreakRef.current;
      }
      setGoodMs(goodMsRef.current);
      setLongestGoodMs(longestGoodMsRef.current);
    } else {
      goodStreakRef.current = 0;
    }

    const result = detectorRef.current.update(pitch, now);
    lastStateRef.current = result.state;
    setSlouchState(result.state);

    if (result.event?.severity === 'slouching') {
      slouchCountRef.current += 1;
      setSlouchCount(slouchCountRef.current);
    }

    lastSampleRef.current = now;
  }, [pitch, isTracking, sessionStart]);

  const status = STATUS_CONFIG[slouchState];
  const goodPct = useMemo(() => computePercentage(goodMs, elapsedMs), [goodMs, elapsedMs]);

  const angles = [
    { key: 'pitch', label: 'Pitch', value: pitch, hint: ANGLE_HELP.pitch },
    { key: 'roll', label: 'Roll', value: roll, hint: ANGLE_HELP.roll },
    { key: 'yaw', label: 'Yaw', value: yaw, hint: ANGLE_HELP.yaw },
  ];

  return (
    <ScrollView
      className="flex-1 bg-[#0b1020]"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-semibold text-white">Posture Monitor</Text>
          <Text className="text-slate-400 text-sm">
            Live AirPods head tracking with slouch alerts
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="text-slate-400 text-xs">Tracking</Text>
          <Switch
            value={isTracking}
            onValueChange={handleToggle}
            trackColor={{ false: '#334155', true: '#14b8a6' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {!isAvailable ? (
        <View className="bg-slate-900 rounded-2xl p-5 border border-slate-800 mb-6">
          <View className="flex-row items-center gap-3 mb-2">
            <Ionicons name="headset" size={18} color="#f59e0b" />
            <Text className="text-white font-semibold">AirPods required</Text>
          </View>
          <Text className="text-slate-400 text-sm leading-6">
            Connect compatible AirPods to enable head tracking. The monitor will
            automatically detect them when connected.
          </Text>
        </View>
      ) : null}

      <View className="items-center mb-6">
        <View
          className="w-44 h-44 rounded-full items-center justify-center border-4"
          style={{ borderColor: status.color, backgroundColor: `${status.color}33` }}
        >
          <Ionicons name="body" size={44} color={status.color} />
          <Text className="text-white font-semibold mt-2">{status.label}</Text>
        </View>
        <Text className="text-slate-400 text-xs mt-3">
          Calibrate for your neutral posture before monitoring.
        </Text>
      </View>

      <View className="bg-slate-900 rounded-2xl p-5 border border-slate-800 mb-6">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-white font-semibold">Session</Text>
            <Text className="text-slate-400 text-xs">Timer and baseline</Text>
          </View>
          <Pressable
            onPress={handleCalibrate}
            className="bg-teal-500 px-3 py-2 rounded-xl flex-row items-center gap-2"
          >
            <Ionicons name="checkmark" size={14} color="#fff" />
            <Text className="text-white text-xs font-semibold">Calibrate</Text>
          </Pressable>
        </View>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-slate-400 text-xs">Elapsed</Text>
            <Text className="text-white text-xl font-semibold">
              {formatDuration(elapsedMs)}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-slate-400 text-xs">Baseline pitch</Text>
            <Text className="text-white text-xl font-semibold">
              {baselinePitch !== null ? formatAngle(baselinePitch) : '-'}
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-3 mb-6">
        {angles.map((angle) => (
          <View
            key={angle.key}
            className="flex-1 min-w-[140px] bg-slate-900 rounded-2xl p-4 border border-slate-800"
          >
            <Text className="text-slate-400 text-xs">{angle.label}</Text>
            <Text className="text-white text-lg font-semibold">
              {formatAngle(angle.value)}
            </Text>
            <Text className="text-slate-500 text-xs mt-1">{angle.hint}</Text>
          </View>
        ))}
      </View>

      <View className="bg-slate-900 rounded-2xl p-5 border border-slate-800 mb-6">
        <Text className="text-white font-semibold mb-4">Session stats</Text>
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-slate-400 text-sm">Good posture</Text>
          <Text className="text-white font-semibold">{goodPct}%</Text>
        </View>
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-slate-400 text-sm">Slouch events</Text>
          <Text className="text-white font-semibold">{slouchCount}</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-slate-400 text-sm">Longest good streak</Text>
          <Text className="text-white font-semibold">{formatDuration(longestGoodMs)}</Text>
        </View>
      </View>

      <View className="bg-slate-900 rounded-2xl p-5 border border-slate-800">
        <View className="flex-row items-center gap-3 mb-2">
          <Ionicons name="information-circle" size={18} color="#38bdf8" />
          <Text className="text-white font-semibold">Background monitoring</Text>
        </View>
        <Text className="text-slate-400 text-sm leading-6">
          Tracking stays active while the app is minimized. Keep AirPods connected and
          return to see your updated session stats.
        </Text>
      </View>
    </ScrollView>
  );
}
