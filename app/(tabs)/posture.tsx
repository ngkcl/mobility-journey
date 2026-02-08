import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { getSupabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { colors } from '@/lib/theme';
import { useHeadphoneMotion } from '../../lib/useHeadphoneMotion';
import { createSlouchDetector, SlouchState } from '../../lib/slouchDetector';
import { computePercentage, formatAngle, formatDuration } from '../../lib/postureSession';
import type { PostureSession } from '../../lib/types';
import {
  DEFAULT_POSTURE_SETTINGS,
  POSTURE_SETTINGS_LIMITS,
  loadPostureSettings,
  normalizePostureSettings,
  savePostureSettings,
} from '../../lib/postureSettings';

const STATUS_CONFIG = {
  [SlouchState.GOOD_POSTURE]: {
    label: 'Good posture',
    color: colors.success,
    bg: 'bg-emerald-500/15',
  },
  [SlouchState.WARNING]: {
    label: 'Warning',
    color: colors.warning,
    bg: 'bg-amber-500/15',
  },
  [SlouchState.SLOUCHING]: {
    label: 'Slouching',
    color: colors.error,
    bg: 'bg-rose-500/15',
  },
};

const ANGLE_HELP = {
  pitch: 'Forward/back tilt',
  roll: 'Side tilt',
  yaw: 'Left/right turn',
};

const ALERT_COOLDOWN_MS = 30000;
const SLOUCH_EXTRA_MS = 5000;

export default function PostureScreen() {
  const {
    nativeAvailable,
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
  const lastAlertRef = useRef<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const goodMsRef = useRef(0);
  const goodStreakRef = useRef(0);
  const longestGoodMsRef = useRef(0);
  const slouchCountRef = useRef(0);
  const pitchSumRef = useRef(0);
  const pitchCountRef = useRef(0);

  const [slouchState, setSlouchState] = useState<SlouchState>(SlouchState.GOOD_POSTURE);
  const [baselinePitch, setBaselinePitch] = useState<number | null>(null);
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [goodMs, setGoodMs] = useState(0);
  const [longestGoodMs, setLongestGoodMs] = useState(0);
  const [slouchCount, setSlouchCount] = useState(0);
  const [settings, setSettings] = useState(DEFAULT_POSTURE_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<PostureSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const { pushToast } = useToast();

  const resetSessionStats = () => {
    lastSampleRef.current = null;
    lastStateRef.current = SlouchState.GOOD_POSTURE;
    goodMsRef.current = 0;
    goodStreakRef.current = 0;
    longestGoodMsRef.current = 0;
    slouchCountRef.current = 0;
    pitchSumRef.current = 0;
    pitchCountRef.current = 0;
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

  const loadSessionHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('posture_sessions')
        .select(
          'id, started_at, ended_at, duration_seconds, good_posture_pct, slouch_count, avg_pitch, baseline_pitch',
        )
        .order('started_at', { ascending: false })
        .limit(6);

      if (error) {
        pushToast('Failed to load posture history.', 'error');
        setHistoryLoading(false);
        return;
      }

      setSessionHistory((data ?? []) as PostureSession[]);
    } catch (error) {
      pushToast('Failed to load posture history.', 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [pushToast]);

  const saveSession = useCallback(
    async (startedAt: number, endedAt: number) => {
      const durationMs = Math.max(0, endedAt - startedAt);
      if (durationMs <= 0) {
        return;
      }

      const durationSeconds = Math.round(durationMs / 1000);
      const goodPct = computePercentage(goodMsRef.current, durationMs);
      const avgPitch =
        pitchCountRef.current > 0 ? pitchSumRef.current / pitchCountRef.current : null;
      const baseline = detectorRef.current.getBaseline();

      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('posture_sessions').insert({
          started_at: new Date(startedAt).toISOString(),
          ended_at: new Date(endedAt).toISOString(),
          duration_seconds: durationSeconds,
          good_posture_pct: goodPct,
          slouch_count: slouchCountRef.current,
          avg_pitch: avgPitch,
          baseline_pitch: baseline,
        });

        if (error) {
          pushToast('Failed to save posture session.', 'error');
          return;
        }

        loadSessionHistory().catch(() => null);
      } catch (error) {
        pushToast('Failed to save posture session.', 'error');
      }
    },
    [loadSessionHistory, pushToast],
  );

  useEffect(() => {
    const loadSettings = async () => {
      const stored = await loadPostureSettings();
      setSettings(stored);
      setSettingsLoaded(true);
    };

    loadSettings();
  }, []);

  useEffect(() => {
    loadSessionHistory().catch(() => null);
  }, [loadSessionHistory]);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    savePostureSettings(settings);
  }, [settings, settingsLoaded]);

  useEffect(() => {
    const warningMs = settings.alertDelaySec * 1000;
    const slouchMs = warningMs + SLOUCH_EXTRA_MS;
    const baseline = detectorRef.current.getBaseline();
    detectorRef.current = createSlouchDetector({
      thresholdDeg: settings.thresholdDeg,
      warningMs,
      slouchMs,
    });

    if (baseline !== null) {
      detectorRef.current.calibrate(baseline);
    }
  }, [settings.alertDelaySec, settings.thresholdDeg]);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => null);
  }, []);

  useEffect(() => {
    let active = true;
    const syncSound = async () => {
      if (!settings.soundEnabled) {
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }
        return;
      }

      if (soundRef.current) {
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/alert.wav'),
      );
      if (!active) {
        await sound.unloadAsync();
        return;
      }
      await sound.setVolumeAsync(0.7);
      soundRef.current = sound;
    };

    syncSound().catch(() => null);

    return () => {
      active = false;
    };
  }, [settings.soundEnabled]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => null);
      }
    };
  }, []);

  const triggerAlert = async (severity: 'warning' | 'slouching') => {
    if (settings.hapticsEnabled) {
      const style =
        severity === 'slouching'
          ? Haptics.ImpactFeedbackStyle.Heavy
          : Haptics.ImpactFeedbackStyle.Light;
      await Haptics.impactAsync(style);
    }

    if (settings.soundEnabled && soundRef.current) {
      await soundRef.current.replayAsync();
    }
  };

  const updateSettings = (partial: Partial<typeof settings>) => {
    setSettings((prev) => normalizePostureSettings({ ...prev, ...partial }));
  };

  const adjustSetting = (key: 'thresholdDeg' | 'alertDelaySec', delta: number) => {
    if (key === 'thresholdDeg') {
      updateSettings({ thresholdDeg: settings.thresholdDeg + delta });
      return;
    }

    updateSettings({ alertDelaySec: settings.alertDelaySec + delta });
  };


  useEffect(() => {
    if (isTracking && !wasTrackingRef.current) {
      resetSessionStats();
      setSessionStart(Date.now());
    }

    if (!isTracking && wasTrackingRef.current) {
      if (sessionStart !== null) {
        saveSession(sessionStart, Date.now()).catch(() => null);
      }
      setSessionStart(null);
      lastSampleRef.current = null;
    }

    wasTrackingRef.current = isTracking;
  }, [isTracking, saveSession, sessionStart]);

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

    pitchSumRef.current += pitch;
    pitchCountRef.current += 1;

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

    if (result.event) {
      const now = result.event.timestamp;
      const lastAlert = lastAlertRef.current ?? 0;
      if (now - lastAlert >= ALERT_COOLDOWN_MS) {
        lastAlertRef.current = now;
        triggerAlert(result.event.severity).catch(() => null);
      }
    }

    lastSampleRef.current = now;
  }, [pitch, isTracking, sessionStart]);

  const status = STATUS_CONFIG[slouchState];
  const goodPct = useMemo(() => computePercentage(goodMs, elapsedMs), [goodMs, elapsedMs]);
  const thresholdLimits = POSTURE_SETTINGS_LIMITS.threshold;
  const alertDelayLimits = POSTURE_SETTINGS_LIMITS.alertDelay;

  const angles = [
    { key: 'pitch', label: 'Pitch', value: pitch, hint: ANGLE_HELP.pitch },
    { key: 'roll', label: 'Roll', value: roll, hint: ANGLE_HELP.roll },
    { key: 'yaw', label: 'Yaw', value: yaw, hint: ANGLE_HELP.yaw },
  ];

  const formatSessionDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown';
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  };

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

      {!nativeAvailable ? (
        <View className="bg-slate-900 rounded-2xl p-5 border border-slate-800 mb-6">
          <View className="flex-row items-center gap-3 mb-2">
            <Ionicons name="headset" size={18} color="#ef4444" />
            <Text className="text-white font-semibold">Development Build Required</Text>
          </View>
          <Text className="text-slate-400 text-sm leading-6">
            AirPods head tracking requires a native development build. This feature
            is not available in Expo Go. Other features work normally.
          </Text>
        </View>
      ) : !isAvailable ? (
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

      <View className="bg-slate-900 rounded-2xl p-5 border border-slate-800 mb-6">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-white font-semibold">Session history</Text>
          <Pressable
            onPress={loadSessionHistory}
            className="bg-slate-800 px-3 py-1.5 rounded-full"
          >
            <Text className="text-xs text-slate-200">Refresh</Text>
          </Pressable>
        </View>

        {historyLoading ? (
          <View className="items-center py-6">
            <ActivityIndicator color="#5eead4" />
            <Text className="text-slate-400 text-xs mt-2">Loading sessions...</Text>
          </View>
        ) : sessionHistory.length === 0 ? (
          <Text className="text-slate-400 text-sm">
            No sessions yet. Start monitoring to build your history.
          </Text>
        ) : (
          sessionHistory.map((session) => (
            <View
              key={session.id}
              className="flex-row items-center justify-between mb-3"
            >
              <View>
                <Text className="text-slate-200 text-sm">
                  {formatSessionDate(session.started_at)}
                </Text>
                <Text className="text-slate-500 text-xs">
                  Duration {formatDuration(session.duration_seconds * 1000)}
                </Text>
                <Text className="text-slate-500 text-xs">
                  Avg pitch {formatAngle(session.avg_pitch)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-white font-semibold">
                  {session.good_posture_pct ?? 0}%
                </Text>
                <Text className="text-slate-500 text-xs">
                  {session.slouch_count ?? 0} slouch{session.slouch_count === 1 ? '' : 'es'}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View className="bg-slate-900 rounded-2xl p-5 border border-slate-800 mb-6">
        <Text className="text-white font-semibold mb-4">Alerts & sensitivity</Text>
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-slate-400 text-xs">Sensitivity</Text>
            <Text className="text-white text-lg font-semibold">
              {settings.thresholdDeg} deg
            </Text>
            <Text className="text-slate-500 text-xs mt-1">
              {thresholdLimits.min}-{thresholdLimits.max} deg
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => adjustSetting('thresholdDeg', -1)}
              className="bg-slate-800 px-3 py-2 rounded-xl"
            >
              <Text className="text-white text-lg">-</Text>
            </Pressable>
            <Pressable
              onPress={() => adjustSetting('thresholdDeg', 1)}
              className="bg-slate-800 px-3 py-2 rounded-xl"
            >
              <Text className="text-white text-lg">+</Text>
            </Pressable>
          </View>
        </View>
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-slate-400 text-xs">Alert delay</Text>
            <Text className="text-white text-lg font-semibold">
              {settings.alertDelaySec}s
            </Text>
            <Text className="text-slate-500 text-xs mt-1">
              {alertDelayLimits.min}-{alertDelayLimits.max} seconds
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => adjustSetting('alertDelaySec', -1)}
              className="bg-slate-800 px-3 py-2 rounded-xl"
            >
              <Text className="text-white text-lg">-</Text>
            </Pressable>
            <Pressable
              onPress={() => adjustSetting('alertDelaySec', 1)}
              className="bg-slate-800 px-3 py-2 rounded-xl"
            >
              <Text className="text-white text-lg">+</Text>
            </Pressable>
          </View>
        </View>
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-slate-400 text-sm">Haptics</Text>
          <Switch
            value={settings.hapticsEnabled}
            onValueChange={(value) => updateSettings({ hapticsEnabled: value })}
            trackColor={{ false: '#334155', true: '#14b8a6' }}
            thumbColor="#fff"
          />
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-slate-400 text-sm">Sound alert</Text>
          <Switch
            value={settings.soundEnabled}
            onValueChange={(value) => updateSettings({ soundEnabled: value })}
            trackColor={{ false: '#334155', true: '#14b8a6' }}
            thumbColor="#fff"
          />
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
