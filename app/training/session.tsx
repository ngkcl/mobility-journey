/**
 * TP-004: Session Execution Screen
 *
 * Guided workout flow for executing a specific training program session.
 * Shows exercises with target sets/reps/weight, rest timers,
 * and saves results to workout history on completion.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Vibration,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getSupabase } from '../../lib/supabase';
import {
  getProgramDetail,
  completeSession,
  type ProgramSession,
  type ProgramWeek,
  type ProgramPhase,
  type ProgramExerciseSlot,
  type TrainingProgram,
  type PhaseFocus,
} from '../../lib/trainingProgram';
import { trackWorkoutCompleted } from '../../lib/goalTracker';
import type { Exercise, WorkoutSet, WorkoutSetSide } from '../../lib/types';
import { computeWorkoutSummary } from '../../lib/workouts';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';

// ── Types ──────────────────────────────────────────────────────────

type SetLog = {
  completed: boolean;
  reps: string;
  weight: string;
  duration: string;
  side: WorkoutSetSide;
  rpe: string;
};

type ExerciseLog = {
  slot: ProgramExerciseSlot;
  exercise: Exercise | null;
  sets: SetLog[];
  expanded: boolean;
};

type SessionPhase = 'loading' | 'warmup' | 'active' | 'rest' | 'post-session' | 'summary';

// ── Phase Colors ───────────────────────────────────────────────────

const PHASE_COLORS: Record<PhaseFocus, { bg: string; text: string; border: string }> = {
  release: { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' },
  activate: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
  strengthen: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
  integrate: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
};

const SESSION_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  corrective: { label: 'Corrective', icon: 'body-outline', color: '#a855f7' },
  gym: { label: 'Gym', icon: 'barbell-outline', color: '#f59e0b' },
  rest: { label: 'Rest Day', icon: 'bed-outline', color: '#64748b' },
  active_recovery: { label: 'Active Recovery', icon: 'walk-outline', color: '#22c55e' },
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Helpers ────────────────────────────────────────────────────────

const parseNum = (v: string): number | null => {
  const n = Number(v.trim());
  return v.trim() && Number.isFinite(n) ? n : null;
};

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const createSetsForSlot = (slot: ProgramExerciseSlot): SetLog[] => {
  const sets: SetLog[] = [];
  for (let i = 0; i < slot.sets; i++) {
    sets.push({
      completed: false,
      reps: slot.reps != null ? String(slot.reps) : '',
      weight: slot.weight_pct_1rm != null ? String(slot.weight_pct_1rm) : '',
      duration: slot.hold_seconds != null ? String(slot.hold_seconds) : '',
      side: (slot.side as WorkoutSetSide) ?? 'bilateral',
      rpe: '',
    });
  }
  return sets;
};

// ── Main Component ─────────────────────────────────────────────────

export default function SessionExecution() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    programId: string;
    weekNumber: string;
    dayOfWeek: string;
    sessionId?: string;
  }>();

  const [phase, setPhase] = useState<SessionPhase>('loading');
  const [program, setProgram] = useState<TrainingProgram | null>(null);
  const [session, setSession] = useState<ProgramSession | null>(null);
  const [weekData, setWeekData] = useState<ProgramWeek | null>(null);
  const [phaseData, setPhaseData] = useState<ProgramPhase | null>(null);
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [restTime, setRestTime] = useState(0);
  const [restTarget, setRestTarget] = useState(0);
  const [startedAt] = useState(new Date());
  const [painBefore, setPainBefore] = useState('');
  const [painAfter, setPainAfter] = useState('');
  const [energyBefore, setEnergyBefore] = useState('');
  const [energyAfter, setEnergyAfter] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // ── Load Session Data ──────────────────────────────────────────

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      const programId = params.programId;
      const weekNumber = Number(params.weekNumber);
      const dayOfWeek = Number(params.dayOfWeek);

      if (!programId) {
        Alert.alert('Error', 'No program specified');
        router.back();
        return;
      }

      const detail = await getProgramDetail(programId);
      if (!detail?.phases) {
        Alert.alert('Error', 'Program not found');
        router.back();
        return;
      }
      setProgram(detail);

      // Find the week and session
      let foundSession: ProgramSession | null = null;
      let foundWeek: ProgramWeek | null = null;
      let foundPhase: ProgramPhase | null = null;

      for (const p of detail.phases) {
        for (const w of p.weeks ?? []) {
          if (w.week_number === weekNumber) {
            foundWeek = w;
            foundPhase = p;
            // Find by sessionId or dayOfWeek
            for (const s of w.sessions ?? []) {
              if (params.sessionId && s.id === params.sessionId) {
                foundSession = s;
                break;
              }
              if (s.day_of_week === dayOfWeek) {
                foundSession = s;
                break;
              }
            }
            break;
          }
        }
        if (foundSession) break;
      }

      if (!foundSession) {
        Alert.alert('Error', 'Session not found for this day');
        router.back();
        return;
      }

      setSession(foundSession);
      setWeekData(foundWeek);
      setPhaseData(foundPhase);

      // Load exercise details for each slot
      const supabase = getSupabase();
      const exerciseIds = foundSession.exercises.map((e) => e.exercise_id).filter(Boolean);

      let exerciseMap: Record<string, Exercise> = {};
      if (exerciseIds.length > 0) {
        const { data: exData } = await supabase
          .from('exercises')
          .select('*')
          .in('id', exerciseIds);
        if (exData) {
          exerciseMap = Object.fromEntries(exData.map((e: Exercise) => [e.id, e]));
        }
      }

      const sortedSlots = [...foundSession.exercises].sort(
        (a, b) => a.slot_order - b.slot_order
      );

      const logs: ExerciseLog[] = sortedSlots.map((slot, idx) => ({
        slot,
        exercise: exerciseMap[slot.exercise_id] ?? null,
        sets: createSetsForSlot(slot),
        expanded: idx === 0,
      }));

      setExercises(logs);
      setPhase('active');
    } catch (err) {
      Alert.alert('Error', 'Failed to load session');
      router.back();
    }
  };

  // ── Rest Timer ─────────────────────────────────────────────────

  const startRest = useCallback((seconds: number) => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    setRestTarget(seconds);
    setRestTime(seconds);
    setPhase('rest');

    restTimerRef.current = setInterval(() => {
      setRestTime((prev) => {
        if (prev <= 1) {
          if (restTimerRef.current) clearInterval(restTimerRef.current);
          restTimerRef.current = null;
          if (Platform.OS !== 'web') Vibration.vibrate([0, 300, 100, 300]);
          setPhase('active');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const skipRest = useCallback(() => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    restTimerRef.current = null;
    setRestTime(0);
    setPhase('active');
  }, []);

  useEffect(() => {
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    };
  }, []);

  // ── Set Completion ─────────────────────────────────────────────

  const toggleSet = useCallback(
    (exIdx: number, setIdx: number) => {
      setExercises((prev) => {
        const updated = [...prev];
        const ex = { ...updated[exIdx] };
        ex.sets = [...ex.sets];
        const s = { ...ex.sets[setIdx] };
        s.completed = !s.completed;
        ex.sets[setIdx] = s;
        updated[exIdx] = ex;

        // If set just completed and there's rest configured, start rest timer
        if (s.completed) {
          const restSec = ex.slot.rest_seconds ?? 60;
          // Don't start rest on last set of last exercise
          const isLastSetOfExercise = setIdx === ex.sets.length - 1;
          const isLastExercise = exIdx === prev.length - 1;
          if (!(isLastSetOfExercise && isLastExercise)) {
            startRest(restSec);
          }
        }

        return updated;
      });
    },
    [startRest]
  );

  const updateSetField = useCallback(
    (exIdx: number, setIdx: number, field: keyof SetLog, value: string) => {
      setExercises((prev) => {
        const updated = [...prev];
        const ex = { ...updated[exIdx] };
        ex.sets = [...ex.sets];
        ex.sets[setIdx] = { ...ex.sets[setIdx], [field]: value };
        updated[exIdx] = ex;
        return updated;
      });
    },
    []
  );

  const toggleExerciseExpand = useCallback((idx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => (i === idx ? { ...ex, expanded: !ex.expanded } : ex))
    );
  }, []);

  // ── Progress Calculation ───────────────────────────────────────

  const progress = useMemo(() => {
    const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    const completedSets = exercises.reduce(
      (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
      0
    );
    const completedExercises = exercises.filter((ex) =>
      ex.sets.every((s) => s.completed)
    ).length;
    return {
      totalSets,
      completedSets,
      pct: totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0,
      completedExercises,
      totalExercises: exercises.length,
      allDone: totalSets > 0 && completedSets === totalSets,
    };
  }, [exercises]);

  // ── Save & Complete ────────────────────────────────────────────

  const finishSession = useCallback(() => {
    setPhase('post-session');
  }, []);

  const saveSession = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    try {
      const supabase = getSupabase();
      const endedAt = new Date();
      const durationMin = Math.round(
        (endedAt.getTime() - startedAt.getTime()) / 60000
      );

      // Determine workout type from session type
      const workoutType =
        session?.session_type === 'gym'
          ? 'gym'
          : session?.session_type === 'active_recovery'
          ? 'cardio'
          : 'corrective';

      // 1. Save as a workout in workout history
      const { data: workout, error: wErr } = await supabase
        .from('workouts')
        .insert({
          date: startedAt.toISOString().slice(0, 10),
          type: workoutType,
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          duration_minutes: durationMin,
          notes: sessionNotes || `Training Program Session — ${phaseData?.name ?? 'Session'}`,
          energy_level_before: parseNum(energyBefore),
          energy_level_after: parseNum(energyAfter),
          pain_level_before: parseNum(painBefore),
          pain_level_after: parseNum(painAfter),
        })
        .select('id')
        .single();

      if (wErr || !workout) throw new Error(wErr?.message ?? 'Failed to save workout');

      // 2. Save each exercise and its sets
      for (let i = 0; i < exercises.length; i++) {
        const exLog = exercises[i];
        const completedSets: WorkoutSet[] = exLog.sets
          .filter((s) => s.completed)
          .map((s) => ({
            reps: parseNum(s.reps),
            weight_kg: parseNum(s.weight),
            duration_seconds: parseNum(s.duration),
            side: s.side,
            rpe: parseNum(s.rpe),
            notes: null,
          }));

        if (completedSets.length === 0) continue;

        const { error: exErr } = await supabase
          .from('workout_exercises')
          .insert({
            workout_id: workout.id,
            exercise_id: exLog.slot.exercise_id,
            order_index: i,
            sets: completedSets,
          });

        if (exErr) console.warn('Failed to save exercise:', exErr.message);
      }

      // 3. Mark program session as completed
      if (session?.id) {
        await completeSession(session.id);
      }

      // 4. Track for goal progress
      try {
        await trackWorkoutCompleted();
      } catch {
        // Goal tracking is non-critical
      }

      setPhase('summary');
    } catch (err) {
      Alert.alert('Error', 'Failed to save session. Try again.');
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    session,
    exercises,
    startedAt,
    sessionNotes,
    phaseData,
    painBefore,
    painAfter,
    energyBefore,
    energyAfter,
  ]);

  // ── Summary Stats ──────────────────────────────────────────────

  const summaryStats = useMemo(() => {
    const workoutSets: { sets: WorkoutSet[] }[] = exercises.map((ex) => ({
      sets: ex.sets
        .filter((s) => s.completed)
        .map((s) => ({
          reps: parseNum(s.reps),
          weight_kg: parseNum(s.weight),
          duration_seconds: parseNum(s.duration),
          side: s.side,
          rpe: parseNum(s.rpe),
          notes: null,
        })),
    }));
    return computeWorkoutSummary(workoutSets);
  }, [exercises]);

  const programmedStats = useMemo(() => {
    let totalSets = 0;
    let totalReps = 0;
    for (const ex of exercises) {
      totalSets += ex.slot.sets;
      totalReps += (ex.slot.reps ?? 0) * ex.slot.sets;
    }
    return { totalSets, totalReps };
  }, [exercises]);

  // ── Render: Loading ────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.teal} />
        <Text style={styles.loadingText}>Loading session...</Text>
      </View>
    );
  }

  // ── Render: Summary ────────────────────────────────────────────

  if (phase === 'summary') {
    const duration = Math.round(
      (new Date().getTime() - startedAt.getTime()) / 60000
    );
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.summaryHeader}>
          <Ionicons name="trophy" size={48} color={colors.teal} />
          <Text style={styles.summaryTitle}>Session Complete! 💪</Text>
          <Text style={styles.summarySubtitle}>
            {phaseData?.name ?? 'Training'} — Week {weekData?.week_number ?? '?'}
          </Text>
        </View>

        {/* Actual vs Programmed */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Performance</Text>
          <View style={styles.compareRow}>
            <View style={styles.compareCol}>
              <Text style={styles.compareLabel}>Programmed</Text>
              <Text style={styles.compareValue}>
                {programmedStats.totalSets} sets
              </Text>
              <Text style={styles.compareSub}>
                {programmedStats.totalReps} reps
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={colors.textMuted} />
            <View style={styles.compareCol}>
              <Text style={styles.compareLabel}>Actual</Text>
              <Text style={[styles.compareValue, { color: colors.teal }]}>
                {summaryStats.totalSets} sets
              </Text>
              <Text style={styles.compareSub}>
                {summaryStats.totalReps} reps
              </Text>
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statTile}>
            <Ionicons name="time-outline" size={20} color={colors.teal} />
            <Text style={styles.statValue}>{duration} min</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
          <View style={styles.statTile}>
            <Ionicons name="fitness-outline" size={20} color={colors.teal} />
            <Text style={styles.statValue}>
              {progress.completedExercises}/{progress.totalExercises}
            </Text>
            <Text style={styles.statLabel}>Exercises</Text>
          </View>
          <View style={styles.statTile}>
            <Ionicons name="barbell-outline" size={20} color={colors.teal} />
            <Text style={styles.statValue}>
              {summaryStats.totalVolumeKg > 0
                ? `${Math.round(summaryStats.totalVolumeKg)} kg`
                : '-'}
            </Text>
            <Text style={styles.statLabel}>Volume</Text>
          </View>
          <View style={styles.statTile}>
            <Ionicons name="speedometer-outline" size={20} color={colors.teal} />
            <Text style={styles.statValue}>{progress.pct}%</Text>
            <Text style={styles.statLabel}>Completion</Text>
          </View>
        </View>

        {/* L/R Balance */}
        {summaryStats.imbalancePct != null && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Left/Right Balance</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceSide}>L: {Math.round(summaryStats.leftVolumeKg)} kg</Text>
              <Text
                style={[
                  styles.balanceIndicator,
                  {
                    color:
                      Math.abs(summaryStats.imbalancePct) < 10
                        ? colors.success
                        : colors.warning,
                  },
                ]}
              >
                {summaryStats.imbalancePct > 0 ? 'Left dominant' : 'Right dominant'} (
                {Math.abs(summaryStats.imbalancePct)}%)
              </Text>
              <Text style={styles.balanceSide}>R: {Math.round(summaryStats.rightVolumeKg)} kg</Text>
            </View>
          </View>
        )}

        {/* Done Button */}
        <Pressable
          style={styles.doneButton}
          onPress={() => router.back()}
        >
          <Text style={styles.doneButtonText}>Back to Training</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  // ── Render: Post-Session (Pain/Energy) ─────────────────────────

  if (phase === 'post-session') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.postHeader}>
          <Ionicons name="clipboard-outline" size={32} color={colors.teal} />
          <Text style={styles.postTitle}>How Do You Feel?</Text>
          <Text style={styles.postSubtitle}>Quick check-in to track recovery</Text>
        </View>

        {/* Pain Levels */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pain Level (1-10)</Text>
          <View style={styles.levelRow}>
            <View style={styles.levelInput}>
              <Text style={styles.levelLabel}>Before</Text>
              <TextInput
                style={styles.input}
                value={painBefore}
                onChangeText={setPainBefore}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textPlaceholder}
                maxLength={2}
              />
            </View>
            <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
            <View style={styles.levelInput}>
              <Text style={styles.levelLabel}>After</Text>
              <TextInput
                style={styles.input}
                value={painAfter}
                onChangeText={setPainAfter}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textPlaceholder}
                maxLength={2}
              />
            </View>
          </View>
        </View>

        {/* Energy Levels */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Energy Level (1-10)</Text>
          <View style={styles.levelRow}>
            <View style={styles.levelInput}>
              <Text style={styles.levelLabel}>Before</Text>
              <TextInput
                style={styles.input}
                value={energyBefore}
                onChangeText={setEnergyBefore}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textPlaceholder}
                maxLength={2}
              />
            </View>
            <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
            <View style={styles.levelInput}>
              <Text style={styles.levelLabel}>After</Text>
              <TextInput
                style={styles.input}
                value={energyAfter}
                onChangeText={setEnergyAfter}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textPlaceholder}
                maxLength={2}
              />
            </View>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={sessionNotes}
            onChangeText={setSessionNotes}
            multiline
            placeholder="How did the session go? Any pain, discomfort, or wins..."
            placeholderTextColor={colors.textPlaceholder}
          />
        </View>

        {/* Save */}
        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={saveSession}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.bgDeep} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={colors.bgDeep} />
              <Text style={styles.saveButtonText}>Save & Complete</Text>
            </>
          )}
        </Pressable>

        <Pressable style={styles.skipButton} onPress={saveSession}>
          <Text style={styles.skipButtonText}>Skip & Save</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  // ── Render: Rest Timer ─────────────────────────────────────────

  const restOverlay =
    phase === 'rest' ? (
      <View style={styles.restOverlay}>
        <View style={styles.restCard}>
          <Text style={styles.restLabel}>Rest</Text>
          <Text style={styles.restTimer}>{formatTime(restTime)}</Text>
          <View style={styles.restProgressBg}>
            <View
              style={[
                styles.restProgressFill,
                {
                  width: `${restTarget > 0 ? ((restTarget - restTime) / restTarget) * 100 : 0}%`,
                },
              ]}
            />
          </View>
          <Pressable style={styles.skipRestButton} onPress={skipRest}>
            <Text style={styles.skipRestText}>Skip Rest</Text>
          </Pressable>
        </View>
      </View>
    ) : null;

  // ── Render: Active Session ─────────────────────────────────────

  const sessionMeta = session
    ? SESSION_TYPE_LABELS[session.session_type] ?? SESSION_TYPE_LABELS.corrective
    : SESSION_TYPE_LABELS.corrective;

  const phaseMeta = phaseData
    ? PHASE_COLORS[phaseData.focus] ?? PHASE_COLORS.release
    : PHASE_COLORS.release;

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </Pressable>
        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {phaseData?.name ?? 'Session'}
          </Text>
          <Text style={styles.topBarSub}>
            Week {weekData?.week_number ?? '?'} · {DAY_NAMES[session?.day_of_week ?? 0]}
          </Text>
        </View>
        <Pressable
          onPress={finishSession}
          hitSlop={12}
          style={[
            styles.finishBtn,
            progress.allDone && styles.finishBtnReady,
          ]}
        >
          <Text
            style={[
              styles.finishBtnText,
              progress.allDone && styles.finishBtnTextReady,
            ]}
          >
            Finish
          </Text>
        </Pressable>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBar}>
        <View
          style={[styles.progressFill, { width: `${progress.pct}%` }]}
        />
      </View>

      {/* Badges */}
      <View style={styles.badges}>
        {weekData?.is_deload && (
          <View style={styles.deloadBadge}>
            <Ionicons name="leaf-outline" size={12} color="#22c55e" />
            <Text style={styles.deloadText}>Recovery Week</Text>
          </View>
        )}
        <View style={[styles.phaseBadge, { backgroundColor: phaseMeta.bg, borderColor: phaseMeta.border }]}>
          <Text style={[styles.phaseBadgeText, { color: phaseMeta.text }]}>
            {phaseData?.focus ?? 'release'}
          </Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
          <Ionicons name={sessionMeta.icon as any} size={12} color={sessionMeta.color} />
          <Text style={[styles.typeBadgeText, { color: sessionMeta.color }]}>
            {sessionMeta.label}
          </Text>
        </View>
        <Text style={styles.progressText}>
          {progress.completedSets}/{progress.totalSets} sets
        </Text>
      </View>

      {/* Exercise List */}
      <ScrollView
        ref={scrollRef}
        style={styles.exerciseScroll}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {exercises.map((exLog, exIdx) => {
          const ex = exLog.exercise;
          const allCompleted = exLog.sets.every((s) => s.completed);
          const someCompleted = exLog.sets.some((s) => s.completed);

          return (
            <View key={exIdx} style={styles.exerciseCard}>
              {/* Exercise Header */}
              <Pressable
                style={styles.exerciseHeader}
                onPress={() => toggleExerciseExpand(exIdx)}
              >
                <View style={styles.exerciseHeaderLeft}>
                  <View
                    style={[
                      styles.exerciseStatus,
                      allCompleted
                        ? styles.exerciseStatusDone
                        : someCompleted
                        ? styles.exerciseStatusPartial
                        : styles.exerciseStatusPending,
                    ]}
                  >
                    {allCompleted ? (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    ) : (
                      <Text style={styles.exerciseNumber}>{exIdx + 1}</Text>
                    )}
                  </View>
                  <View style={styles.exerciseInfo}>
                    <Text
                      style={[
                        styles.exerciseName,
                        allCompleted && styles.exerciseNameDone,
                      ]}
                      numberOfLines={1}
                    >
                      {ex?.name ?? `Exercise ${exIdx + 1}`}
                    </Text>
                    <Text style={styles.exerciseTargets}>
                      {exLog.slot.sets}×
                      {exLog.slot.reps != null
                        ? `${exLog.slot.reps} reps`
                        : exLog.slot.hold_seconds != null
                        ? `${exLog.slot.hold_seconds}s hold`
                        : '?'}
                      {exLog.slot.side && exLog.slot.side !== 'both'
                        ? ` · ${exLog.slot.side}`
                        : ''}
                      {exLog.slot.rest_seconds
                        ? ` · ${exLog.slot.rest_seconds}s rest`
                        : ''}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name={exLog.expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>

              {/* Notes */}
              {exLog.expanded && exLog.slot.notes && (
                <View style={styles.exerciseNotes}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
                  <Text style={styles.exerciseNotesText}>{exLog.slot.notes}</Text>
                </View>
              )}

              {/* Target Muscles */}
              {exLog.expanded && ex?.target_muscles && ex.target_muscles.length > 0 && (
                <View style={styles.muscleRow}>
                  {ex.target_muscles.slice(0, 4).map((m, i) => (
                    <View key={i} style={styles.musclePill}>
                      <Text style={styles.musclePillText}>{m}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Sets */}
              {exLog.expanded && (
                <View style={styles.setsContainer}>
                  {/* Set Header */}
                  <View style={styles.setHeaderRow}>
                    <Text style={[styles.setHeaderText, { width: 36 }]}>Set</Text>
                    <Text style={[styles.setHeaderText, { flex: 1 }]}>
                      {exLog.slot.hold_seconds != null ? 'Duration' : 'Reps'}
                    </Text>
                    {exLog.slot.weight_pct_1rm != null && (
                      <Text style={[styles.setHeaderText, { flex: 1 }]}>Weight (kg)</Text>
                    )}
                    <Text style={[styles.setHeaderText, { width: 50 }]}>RPE</Text>
                    <Text style={[styles.setHeaderText, { width: 44 }]}>✓</Text>
                  </View>

                  {/* Set Rows */}
                  {exLog.sets.map((set, setIdx) => (
                    <View
                      key={setIdx}
                      style={[
                        styles.setRow,
                        set.completed && styles.setRowDone,
                      ]}
                    >
                      <Text style={[styles.setNum, { width: 36 }]}>
                        {setIdx + 1}
                      </Text>

                      <TextInput
                        style={[styles.setInput, { flex: 1 }]}
                        value={
                          exLog.slot.hold_seconds != null ? set.duration : set.reps
                        }
                        onChangeText={(v) =>
                          updateSetField(
                            exIdx,
                            setIdx,
                            exLog.slot.hold_seconds != null ? 'duration' : 'reps',
                            v
                          )
                        }
                        keyboardType="numeric"
                        placeholder={
                          exLog.slot.hold_seconds != null
                            ? String(exLog.slot.hold_seconds ?? '')
                            : String(exLog.slot.reps ?? '')
                        }
                        placeholderTextColor={colors.textPlaceholder}
                        editable={!set.completed}
                      />

                      {exLog.slot.weight_pct_1rm != null && (
                        <TextInput
                          style={[styles.setInput, { flex: 1 }]}
                          value={set.weight}
                          onChangeText={(v) =>
                            updateSetField(exIdx, setIdx, 'weight', v)
                          }
                          keyboardType="numeric"
                          placeholder={String(exLog.slot.weight_pct_1rm ?? '')}
                          placeholderTextColor={colors.textPlaceholder}
                          editable={!set.completed}
                        />
                      )}

                      <TextInput
                        style={[styles.setInput, { width: 50 }]}
                        value={set.rpe}
                        onChangeText={(v) =>
                          updateSetField(exIdx, setIdx, 'rpe', v)
                        }
                        keyboardType="numeric"
                        placeholder="-"
                        placeholderTextColor={colors.textPlaceholder}
                        editable={!set.completed}
                        maxLength={3}
                      />

                      <Pressable
                        style={[
                          styles.checkBtn,
                          set.completed && styles.checkBtnDone,
                        ]}
                        onPress={() => toggleSet(exIdx, setIdx)}
                        hitSlop={6}
                      >
                        <Ionicons
                          name={set.completed ? 'checkmark-circle' : 'ellipse-outline'}
                          size={22}
                          color={set.completed ? colors.teal : colors.textMuted}
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* FAB: Finish Session */}
      {progress.allDone && (
        <Pressable style={styles.fab} onPress={finishSession}>
          <Ionicons name="checkmark-done" size={20} color={colors.bgDeep} />
          <Text style={styles.fabText}>Complete Session</Text>
        </Pressable>
      )}

      {/* Rest Timer Overlay */}
      {restOverlay}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  scrollContent: {
    padding: spacing.md,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgBase,
  },
  loadingText: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bgDeep,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  topBarTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
  },
  topBarSub: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 1,
  },
  finishBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  finishBtnReady: {
    backgroundColor: colors.tealDim,
    borderColor: colors.tealBorder,
  },
  finishBtnText: {
    ...typography.captionMedium,
    color: colors.textMuted,
  },
  finishBtnTextReady: {
    color: colors.teal,
  },

  // Progress Bar
  progressBar: {
    height: 3,
    backgroundColor: colors.bgDeep,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.teal,
  },

  // Badges
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  deloadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  deloadText: {
    ...typography.small,
    color: '#22c55e',
  },
  phaseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  phaseBadgeText: {
    ...typography.small,
    textTransform: 'capitalize',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  typeBadgeText: {
    ...typography.small,
  },
  progressText: {
    ...typography.captionMedium,
    color: colors.textTertiary,
    marginLeft: 'auto',
  },

  // Exercise List
  exerciseScroll: {
    flex: 1,
  },
  exerciseCard: {
    backgroundColor: colors.bgCard,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
  },
  exerciseHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  exerciseStatus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseStatusPending: {
    backgroundColor: colors.bgDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseStatusPartial: {
    backgroundColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.5)',
  },
  exerciseStatusDone: {
    backgroundColor: colors.teal,
  },
  exerciseNumber: {
    ...typography.small,
    color: colors.textTertiary,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  exerciseNameDone: {
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  exerciseTargets: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 1,
  },
  exerciseNotes: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  exerciseNotesText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontStyle: 'italic',
    flex: 1,
  },
  muscleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  musclePill: {
    backgroundColor: colors.bgDeep,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  musclePillText: {
    ...typography.tiny,
    color: colors.textTertiary,
    textTransform: 'capitalize',
  },

  // Sets
  setsContainer: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    marginBottom: 4,
  },
  setHeaderText: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
  },
  setRowDone: {
    backgroundColor: 'rgba(20, 184, 166, 0.06)',
  },
  setNum: {
    ...typography.captionMedium,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  setInput: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgDeep,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginHorizontal: 3,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  checkBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtnDone: {},

  // Rest Timer Overlay
  restOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  restCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: 40,
    alignItems: 'center',
    width: 260,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restLabel: {
    ...typography.h3,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  restTimer: {
    fontSize: 56,
    fontWeight: '700',
    color: colors.teal,
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.md,
  },
  restProgressBg: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bgDeep,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  restProgressFill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: 3,
  },
  skipRestButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skipRestText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.teal,
    paddingVertical: 14,
    borderRadius: radii.lg,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    ...typography.captionMedium,
    color: colors.bgDeep,
    fontWeight: '700',
    fontSize: 16,
  },

  // Post-session
  postHeader: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingBottom: spacing.lg,
  },
  postTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  postSubtitle: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  levelInput: {
    alignItems: 'center',
    gap: 4,
  },
  levelLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgDeep,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
    minWidth: 64,
  },
  notesInput: {
    textAlign: 'left',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.teal,
    paddingVertical: 14,
    borderRadius: radii.lg,
    marginTop: spacing.md,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...typography.bodySemibold,
    color: colors.bgDeep,
    fontSize: 16,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: spacing.xs,
  },
  skipButtonText: {
    ...typography.captionMedium,
    color: colors.textTertiary,
  },

  // Summary
  summaryHeader: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingBottom: spacing.lg,
  },
  summaryTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  summarySubtitle: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: 4,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  compareCol: {
    alignItems: 'center',
    gap: 2,
  },
  compareLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  compareValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  compareSub: {
    ...typography.caption,
    color: colors.textMuted,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statTile: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceSide: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  balanceIndicator: {
    ...typography.caption,
  },
  doneButton: {
    backgroundColor: colors.teal,
    paddingVertical: 14,
    borderRadius: radii.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  doneButtonText: {
    ...typography.bodySemibold,
    color: colors.bgDeep,
    fontSize: 16,
  },
});
