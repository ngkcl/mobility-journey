import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { getSupabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';
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
    bgDim: colors.successDim,
  },
  [SlouchState.WARNING]: {
    label: 'Warning',
    color: colors.warning,
    bgDim: colors.warningDim,
  },
  [SlouchState.SLOUCHING]: {
    label: 'Slouching',
    color: colors.error,
    bgDim: colors.errorDim,
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
    if (pitch === null || !Number.isFinite(pitch)) return;
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
        .select('id, started_at, ended_at, duration_seconds, good_posture_pct, slouch_count, avg_pitch, baseline_pitch')
        .order('started_at', { ascending: false })
        .limit(6);
      if (error) {
        pushToast('Failed to load posture history.', 'error');
        setHistoryLoading(false);
        return;
      }
      setSessionHistory((data ?? []) as PostureSession[]);
    } catch {
      pushToast('Failed to load posture history.', 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [pushToast]);

  const saveSession = useCallback(
    async (startedAt: number, endedAt: number) => {
      const durationMs = Math.max(0, endedAt - startedAt);
      if (durationMs <= 0) return;
      const durationSeconds = Math.round(durationMs / 1000);
      const goodPct = computePercentage(goodMsRef.current, durationMs);
      const avgPitch = pitchCountRef.current > 0 ? pitchSumRef.current / pitchCountRef.current : null;
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
      } catch {
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

  useEffect(() => { loadSessionHistory().catch(() => null); }, [loadSessionHistory]);

  useEffect(() => {
    if (!settingsLoaded) return;
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
    if (baseline !== null) detectorRef.current.calibrate(baseline);
  }, [settings.alertDelaySec, settings.thresholdDeg]);

  useEffect(() => { Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => null); }, []);

  useEffect(() => {
    let active = true;
    const syncSound = async () => {
      if (!settings.soundEnabled) {
        if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; }
        return;
      }
      if (soundRef.current) return;
      const { sound } = await Audio.Sound.createAsync(require('../../assets/sounds/alert.wav'));
      if (!active) { await sound.unloadAsync(); return; }
      await sound.setVolumeAsync(0.7);
      soundRef.current = sound;
    };
    syncSound().catch(() => null);
    return () => { active = false; };
  }, [settings.soundEnabled]);

  useEffect(() => {
    return () => { if (soundRef.current) soundRef.current.unloadAsync().catch(() => null); };
  }, []);

  const triggerAlert = async (severity: 'warning' | 'slouching') => {
    if (settings.hapticsEnabled) {
      const style = severity === 'slouching' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light;
      await Haptics.impactAsync(style);
    }
    if (settings.soundEnabled && soundRef.current) await soundRef.current.replayAsync();
  };

  const updateSettings = (partial: Partial<typeof settings>) => {
    setSettings((prev) => normalizePostureSettings({ ...prev, ...partial }));
  };

  const adjustSetting = (key: 'thresholdDeg' | 'alertDelaySec', delta: number) => {
    if (key === 'thresholdDeg') { updateSettings({ thresholdDeg: settings.thresholdDeg + delta }); return; }
    updateSettings({ alertDelaySec: settings.alertDelaySec + delta });
  };

  useEffect(() => {
    if (isTracking && !wasTrackingRef.current) { resetSessionStats(); setSessionStart(Date.now()); }
    if (!isTracking && wasTrackingRef.current) {
      if (sessionStart !== null) saveSession(sessionStart, Date.now()).catch(() => null);
      setSessionStart(null);
      lastSampleRef.current = null;
    }
    wasTrackingRef.current = isTracking;
  }, [isTracking, saveSession, sessionStart]);

  useEffect(() => {
    if (!isTracking || sessionStart === null) return;
    const timer = setInterval(() => setElapsedMs(Date.now() - sessionStart), 1000);
    return () => clearInterval(timer);
  }, [isTracking, sessionStart]);

  useEffect(() => {
    if (!isTracking || sessionStart === null) return;
    if (pitch === null || !Number.isFinite(pitch)) return;
    pitchSumRef.current += pitch;
    pitchCountRef.current += 1;
    const now = Date.now();
    const lastSample = lastSampleRef.current ?? now;
    const delta = Math.max(0, now - lastSample);
    const prevState = lastStateRef.current;
    if (prevState === SlouchState.GOOD_POSTURE) {
      goodMsRef.current += delta;
      goodStreakRef.current += delta;
      if (goodStreakRef.current > longestGoodMsRef.current) longestGoodMsRef.current = goodStreakRef.current;
      setGoodMs(goodMsRef.current);
      setLongestGoodMs(longestGoodMsRef.current);
    } else {
      goodStreakRef.current = 0;
    }
    const result = detectorRef.current.update(pitch, now);
    lastStateRef.current = result.state;
    setSlouchState(result.state);
    if (result.event?.severity === 'slouching') { slouchCountRef.current += 1; setSlouchCount(slouchCountRef.current); }
    if (result.event) {
      const eventNow = result.event.timestamp;
      const lastAlert = lastAlertRef.current ?? 0;
      if (eventNow - lastAlert >= ALERT_COOLDOWN_MS) {
        lastAlertRef.current = eventNow;
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
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <ScrollView style={shared.screen} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={[shared.rowBetween, { marginBottom: spacing['2xl'] }]}>
        <View>
          <Text style={shared.pageTitle}>Posture Monitor</Text>
          <Text style={shared.pageSubtitle}>Live AirPods head tracking with slouch alerts</Text>
        </View>
        <View style={[shared.row, { gap: spacing.sm }]}>
          <Text style={{ ...typography.caption, color: colors.textTertiary }}>Tracking</Text>
          <Switch value={isTracking} onValueChange={handleToggle} trackColor={{ false: '#334155', true: colors.teal }} thumbColor="#fff" />
        </View>
      </View>

      {/* Availability warnings */}
      {!nativeAvailable ? (
        <View style={[shared.card, { marginBottom: spacing.lg }]}>
          <View style={[shared.row, { gap: spacing.md, marginBottom: spacing.sm }]}>
            <Ionicons name="headset" size={18} color={colors.error} />
            <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>Development Build Required</Text>
          </View>
          <Text style={{ ...typography.caption, color: colors.textTertiary, lineHeight: 22 }}>
            AirPods head tracking requires a native development build. This feature is not available in Expo Go. Other features work normally.
          </Text>
        </View>
      ) : !isAvailable ? (
        <View style={[shared.card, { marginBottom: spacing.lg }]}>
          <View style={[shared.row, { gap: spacing.md, marginBottom: spacing.sm }]}>
            <Ionicons name="headset" size={18} color={colors.warning} />
            <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>AirPods required</Text>
          </View>
          <Text style={{ ...typography.caption, color: colors.textTertiary, lineHeight: 22 }}>
            Connect compatible AirPods to enable head tracking. The monitor will automatically detect them when connected.
          </Text>
        </View>
      ) : null}

      {/* Status ring */}
      <View style={s.ringWrap}>
        <View style={[s.ring, { borderColor: status.color, backgroundColor: `${status.color}33` }]}>
          <Ionicons name="body" size={44} color={status.color} />
          <Text style={[s.ringLabel, { color: colors.textPrimary }]}>{status.label}</Text>
        </View>
        <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: spacing.md }}>
          Calibrate for your neutral posture before monitoring.
        </Text>
      </View>

      {/* Session card */}
      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
          <View>
            <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>Session</Text>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Timer and baseline</Text>
          </View>
          <Pressable onPress={handleCalibrate} style={[shared.btnPrimary, shared.btnSmall]}>
            <Ionicons name="checkmark" size={14} color="#fff" />
            <Text style={{ ...typography.small, color: '#fff', fontWeight: '600' }}>Calibrate</Text>
          </Pressable>
        </View>
        <View style={shared.rowBetween}>
          <View>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Elapsed</Text>
            <Text style={{ ...typography.h2, color: colors.textPrimary }}>{formatDuration(elapsedMs)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Baseline pitch</Text>
            <Text style={{ ...typography.h2, color: colors.textPrimary }}>{baselinePitch !== null ? formatAngle(baselinePitch) : '-'}</Text>
          </View>
        </View>
      </View>

      {/* Angle cards */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg }}>
        {angles.map((angle) => (
          <View key={angle.key} style={[shared.card, { flex: 1, minWidth: 140 }]}>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>{angle.label}</Text>
            <Text style={{ ...typography.h2, color: colors.textPrimary }}>{formatAngle(angle.value)}</Text>
            <Text style={{ ...typography.small, color: colors.textMuted, marginTop: spacing.xs }}>{angle.hint}</Text>
          </View>
        ))}
      </View>

      {/* Session stats */}
      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <Text style={{ ...typography.bodySemibold, color: colors.textPrimary, marginBottom: spacing.lg }}>Session stats</Text>
        <View style={[shared.rowBetween, { marginBottom: spacing.md }]}>
          <Text style={{ ...typography.body, color: colors.textTertiary }}>Good posture</Text>
          <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>{goodPct}%</Text>
        </View>
        <View style={[shared.rowBetween, { marginBottom: spacing.md }]}>
          <Text style={{ ...typography.body, color: colors.textTertiary }}>Slouch events</Text>
          <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>{slouchCount}</Text>
        </View>
        <View style={shared.rowBetween}>
          <Text style={{ ...typography.body, color: colors.textTertiary }}>Longest good streak</Text>
          <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>{formatDuration(longestGoodMs)}</Text>
        </View>
      </View>

      {/* Session history */}
      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
          <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>Session history</Text>
          <Pressable onPress={loadSessionHistory} style={[shared.btnSecondary, shared.btnSmall]}>
            <Text style={{ ...typography.small, color: colors.textSecondary }}>Refresh</Text>
          </Pressable>
        </View>

        {historyLoading ? (
          <View style={shared.emptyState}>
            <ActivityIndicator color={colors.tealLight} />
            <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm }}>Loading sessions...</Text>
          </View>
        ) : sessionHistory.length === 0 ? (
          <Text style={{ ...typography.body, color: colors.textTertiary }}>
            No sessions yet. Start monitoring to build your history.
          </Text>
        ) : (
          sessionHistory.map((session) => (
            <View key={session.id} style={[shared.rowBetween, { marginBottom: spacing.md }]}>
              <View>
                <Text style={{ ...typography.body, color: colors.textSecondary }}>{formatSessionDate(session.started_at)}</Text>
                <Text style={{ ...typography.small, color: colors.textMuted }}>Duration {formatDuration(session.duration_seconds * 1000)}</Text>
                <Text style={{ ...typography.small, color: colors.textMuted }}>Avg pitch {formatAngle(session.avg_pitch)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>{session.good_posture_pct ?? 0}%</Text>
                <Text style={{ ...typography.small, color: colors.textMuted }}>{session.slouch_count ?? 0} slouch{session.slouch_count === 1 ? '' : 'es'}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Alerts & sensitivity */}
      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <Text style={{ ...typography.bodySemibold, color: colors.textPrimary, marginBottom: spacing.lg }}>Alerts & sensitivity</Text>

        <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
          <View>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Sensitivity</Text>
            <Text style={{ ...typography.h2, color: colors.textPrimary }}>{settings.thresholdDeg} deg</Text>
            <Text style={{ ...typography.small, color: colors.textMuted, marginTop: spacing.xs }}>{thresholdLimits.min}-{thresholdLimits.max} deg</Text>
          </View>
          <View style={[shared.row, { gap: spacing.sm }]}>
            <Pressable onPress={() => adjustSetting('thresholdDeg', -1)} style={s.adjBtn}>
              <Text style={s.adjBtnText}>-</Text>
            </Pressable>
            <Pressable onPress={() => adjustSetting('thresholdDeg', 1)} style={s.adjBtn}>
              <Text style={s.adjBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
          <View>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Alert delay</Text>
            <Text style={{ ...typography.h2, color: colors.textPrimary }}>{settings.alertDelaySec}s</Text>
            <Text style={{ ...typography.small, color: colors.textMuted, marginTop: spacing.xs }}>{alertDelayLimits.min}-{alertDelayLimits.max} seconds</Text>
          </View>
          <View style={[shared.row, { gap: spacing.sm }]}>
            <Pressable onPress={() => adjustSetting('alertDelaySec', -1)} style={s.adjBtn}>
              <Text style={s.adjBtnText}>-</Text>
            </Pressable>
            <Pressable onPress={() => adjustSetting('alertDelaySec', 1)} style={s.adjBtn}>
              <Text style={s.adjBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={[shared.rowBetween, { marginBottom: spacing.md }]}>
          <Text style={{ ...typography.body, color: colors.textTertiary }}>Haptics</Text>
          <Switch value={settings.hapticsEnabled} onValueChange={(value) => updateSettings({ hapticsEnabled: value })} trackColor={{ false: '#334155', true: colors.teal }} thumbColor="#fff" />
        </View>
        <View style={shared.rowBetween}>
          <Text style={{ ...typography.body, color: colors.textTertiary }}>Sound alert</Text>
          <Switch value={settings.soundEnabled} onValueChange={(value) => updateSettings({ soundEnabled: value })} trackColor={{ false: '#334155', true: colors.teal }} thumbColor="#fff" />
        </View>
      </View>

      {/* Info card */}
      <View style={shared.card}>
        <View style={[shared.row, { gap: spacing.md, marginBottom: spacing.sm }]}>
          <Ionicons name="information-circle" size={18} color={colors.info} />
          <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>Background monitoring</Text>
        </View>
        <Text style={{ ...typography.caption, color: colors.textTertiary, lineHeight: 22 }}>
          Tracking stays active while the app is minimized. Keep AirPods connected and return to see your updated session stats.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  ringWrap: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  ring: {
    width: 176,
    height: 176,
    borderRadius: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
  },
  ringLabel: {
    ...typography.bodySemibold,
    marginTop: spacing.sm,
  },
  adjBtn: {
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  adjBtnText: {
    ...typography.h2,
    color: colors.textPrimary,
  },
});
