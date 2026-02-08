import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, TextInput, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getSupabase } from '../../lib/supabase';
import { generateDailyPlan } from '../../lib/api';
import { normalizeDailyPlan, normalizeReasoning } from '../../lib/dailyPlan';
import { buildPostureTrend } from '../../lib/postureSessions';
import LoadingState from '../../components/LoadingState';
import { useToast } from '../../components/Toast';
import { colors, typography, spacing, radii, shared, getSessionColors, estimateSessionDuration, getDailyTip, getGreeting } from '@/lib/theme';
import type {
  DailyPlan,
  DailyPlanPayload,
  DailyPlanSection,
  DailyPlanExercise,
  MetricEntry,
  PostureSession,
  Workout,
} from '../../lib/types';

const CONDITION_CONTEXT = {
  scoliosisProtocol: '3x daily corrective sessions: Morning 20min, Midday 15min, Evening 20min',
  knownIssues: 'Right-side muscular imbalance, right-thoracic scoliosis, right shoulder dropped/rolled forward',
  tightMuscles: 'Right QL, right hip flexors, right erector spinae, right lat',
  weakMuscles: 'Left glute med, left QL, core (obliques), left-side stabilizers',
  correctionStrategy:
    'Release tight muscles -> Activate weak muscles -> Integrate functional movements -> Maintain posture awareness',
};

const SECTION_ORDER: (keyof DailyPlanPayload)[] = ['morning', 'afternoon', 'evening', 'gym'];
const SECTION_LABELS: Record<keyof DailyPlanPayload, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  gym: 'Gym',
};

const SECTION_ICONS: Record<keyof DailyPlanPayload, string> = {
  morning: '🌅',
  afternoon: '☀️',
  evening: '🌙',
  gym: '🏋️',
};

const SECTION_COLORS: Record<keyof DailyPlanPayload, { bg: string; text: string; border: string }> = {
  morning: { bg: colors.morningDim, text: colors.morning, border: colors.morningBorder },
  afternoon: { bg: colors.middayDim, text: colors.midday, border: colors.middayBorder },
  evening: { bg: colors.eveningDim, text: colors.evening, border: colors.eveningBorder },
  gym: { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', border: 'rgba(99, 102, 241, 0.3)' },
};

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const daysAgo = (count: number) => {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return date;
};

const clonePlan = (plan: DailyPlanPayload) => JSON.parse(JSON.stringify(plan)) as DailyPlanPayload;

const formatExerciseMeta = (exercise: DailyPlanExercise) => {
  const parts: string[] = [];
  if (exercise.sets != null && exercise.reps != null) {
    parts.push(`${exercise.sets}x${exercise.reps}`);
  } else if (exercise.sets != null) {
    parts.push(`${exercise.sets} sets`);
  } else if (exercise.reps != null) {
    parts.push(`${exercise.reps} reps`);
  }
  if (exercise.duration_seconds != null) parts.push(`${exercise.duration_seconds}s`);
  if (exercise.side) parts.push(exercise.side);
  if (exercise.notes) parts.push(exercise.notes);
  return parts.join(' | ');
};

const buildEmptyExercise = (): DailyPlanExercise => ({
  name: 'New Exercise',
  sets: null,
  reps: null,
  duration_seconds: null,
  side: null,
  notes: null,
  reason: null,
});

const normalizePlanRow = (row: any): DailyPlan => ({
  id: row.id,
  plan_date: row.plan_date,
  plan: normalizeDailyPlan(row.plan),
  reasoning: normalizeReasoning(row.reasoning),
  status: (row.status ?? 'generated') as DailyPlan['status'],
  model: row.model ?? null,
  created_at: row.created_at,
});

const categorizeSession = (startedAt: string | null) => {
  if (!startedAt) return 'unspecified';
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return 'unspecified';
  const hour = date.getHours();
  if (hour < 11) return 'morning';
  if (hour < 17) return 'midday';
  return 'evening';
};

export default function DailyPlanScreen() {
  const { pushToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [recentPlans, setRecentPlans] = useState<DailyPlan[]>([]);
  const [editingPlan, setEditingPlan] = useState<DailyPlanPayload | null>(null);
  const [metrics, setMetrics] = useState<MetricEntry[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [postureSessions, setPostureSessions] = useState<PostureSession[]>([]);
  const [gymDay, setGymDay] = useState(false);
  const [gymFocus, setGymFocus] = useState('');
  const [painOverride, setPainOverride] = useState('');
  const [energyOverride, setEnergyOverride] = useState('');

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const latestMetric = metrics[0];

  useEffect(() => {
    if (latestMetric) {
      if (painOverride.length === 0 && latestMetric.pain_level != null) {
        setPainOverride(String(latestMetric.pain_level));
      }
      if (energyOverride.length === 0 && latestMetric.energy_level != null) {
        setEnergyOverride(String(latestMetric.energy_level));
      }
    }
  }, [latestMetric]);

  const loadData = async () => {
    const supabase = getSupabase();
    setIsLoading(true);

    const weekAgo = toDateKey(daysAgo(7));

    const [planResponse, metricsResponse, workoutsResponse, postureResponse] = await Promise.all([
      supabase.from('daily_plans').select('*').order('created_at', { ascending: false }).limit(5),
      supabase.from('metrics').select('*').order('entry_date', { ascending: false }).limit(14),
      supabase.from('workouts').select('*').gte('date', weekAgo).order('date', { ascending: false }),
      supabase
        .from('posture_sessions')
        .select('*')
        .gte('started_at', weekAgo)
        .order('started_at', { ascending: false }),
    ]);

    if (planResponse.error || metricsResponse.error || workoutsResponse.error || postureResponse.error) {
      pushToast('Failed to load daily plan data.', 'error');
      setIsLoading(false);
      return;
    }

    const plans = (planResponse.data ?? []).map(normalizePlanRow);
    const todayPlan = plans.find((row) => row.plan_date === todayKey) ?? null;

    setPlan(todayPlan);
    setRecentPlans(plans);
    setMetrics(metricsResponse.data ?? []);
    setWorkouts(workoutsResponse.data ?? []);
    setPostureSessions(postureResponse.data ?? []);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const postureTrend = useMemo(() => {
    if (postureSessions.length === 0) return [];
    return buildPostureTrend(postureSessions, 'daily').slice(-7);
  }, [postureSessions]);

  const yesterdayKey = useMemo(() => toDateKey(daysAgo(1)), []);
  const yesterdayWorkouts = workouts.filter((workout) => workout.date === yesterdayKey);

  const correctiveSessions = useMemo(() => {
    const todayCorrective = workouts.filter(
      (workout) => workout.type === 'corrective' && workout.date === todayKey,
    );
    const buckets = { morning: 0, midday: 0, evening: 0, unspecified: 0 };
    todayCorrective.forEach((workout) => {
      const bucket = categorizeSession(workout.started_at);
      if (bucket in buckets) {
        buckets[bucket as keyof typeof buckets] += 1;
      }
    });

    return {
      total: todayCorrective.length,
      ...buckets,
    };
  }, [workouts, todayKey]);

  const buildPlanPayload = () => {
    const painLevel = painOverride ? Number(painOverride) : latestMetric?.pain_level ?? null;
    const energyLevel = energyOverride ? Number(energyOverride) : latestMetric?.energy_level ?? null;

    return {
      date: todayKey,
      context: CONDITION_CONTEXT,
      metrics: {
        latest: latestMetric
          ? {
              date: latestMetric.entry_date,
              pain_level: latestMetric.pain_level,
              energy_level: latestMetric.energy_level,
              posture_score: latestMetric.posture_score,
              symmetry_score: latestMetric.symmetry_score,
            }
          : null,
        override: {
          pain_level: Number.isFinite(painLevel) ? painLevel : null,
          energy_level: Number.isFinite(energyLevel) ? energyLevel : null,
        },
        recent: metrics.slice(0, 7),
      },
      postureTrend,
      workouts: {
        yesterday: yesterdayWorkouts,
        recent: workouts.slice(0, 10),
      },
      correctiveSessions,
      gymDay,
      gymFocus: gymFocus.trim() || null,
    };
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const payload = buildPlanPayload();
      const response = await generateDailyPlan(payload);
      const normalizedPlan = normalizeDailyPlan(response.plan as Partial<DailyPlanPayload>);
      const reasoning = normalizeReasoning(response.reasoning);

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('daily_plans')
        .insert({
          plan_date: todayKey,
          plan: normalizedPlan,
          reasoning,
          status: 'generated',
          model: response.model ?? null,
        })
        .select('*')
        .single();

      if (error || !data) {
        pushToast('Plan generated, but failed to save.', 'error');
        setPlan({
          id: `local-${Date.now()}`,
          plan_date: todayKey,
          plan: normalizedPlan,
          reasoning,
          status: 'generated',
          model: response.model ?? null,
          created_at: new Date().toISOString(),
        });
        setIsGenerating(false);
        return;
      }

      const stored = normalizePlanRow(data);
      setPlan(stored);
      setRecentPlans((prev) => [stored, ...prev.filter((p) => p.id !== stored.id)].slice(0, 5));
      pushToast('Daily plan generated!', 'success');
    } catch (err) {
      pushToast('Failed to generate plan.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const updatePlanStatus = async (status: DailyPlan['status']) => {
    if (!plan) return;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('daily_plans')
      .update({ status })
      .eq('id', plan.id)
      .select('*')
      .single();

    if (error || !data) {
      pushToast('Failed to update plan status.', 'error');
      return;
    }

    const updated = normalizePlanRow(data);
    setPlan(updated);
    setRecentPlans((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    pushToast(status === 'accepted' ? 'Plan accepted!' : 'Plan updated!', 'success');
  };

  const saveEdits = async () => {
    if (!plan || !editingPlan) return;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('daily_plans')
      .update({ plan: editingPlan, status: 'modified' })
      .eq('id', plan.id)
      .select('*')
      .single();

    if (error || !data) {
      pushToast('Failed to save edits.', 'error');
      return;
    }

    const updated = normalizePlanRow(data);
    setPlan(updated);
    setEditingPlan(null);
    setRecentPlans((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    pushToast('Plan updated.', 'success');
  };

  const startEditing = () => {
    if (!plan) return;
    setEditingPlan(clonePlan(plan.plan));
  };

  const updateExercise = (
    sectionKey: keyof DailyPlanPayload,
    index: number,
    updates: Partial<DailyPlanExercise>,
  ) => {
    setEditingPlan((prev) => {
      if (!prev) return prev;
      const section = { ...prev[sectionKey] } as DailyPlanSection;
      const exercises = [...section.exercises];
      exercises[index] = { ...exercises[index], ...updates } as DailyPlanExercise;
      return { ...prev, [sectionKey]: { ...section, exercises } } as DailyPlanPayload;
    });
  };

  const addExercise = (sectionKey: keyof DailyPlanPayload) => {
    setEditingPlan((prev) => {
      if (!prev) return prev;
      const section = { ...prev[sectionKey] } as DailyPlanSection;
      const exercises = [...section.exercises, buildEmptyExercise()];
      return { ...prev, [sectionKey]: { ...section, exercises } } as DailyPlanPayload;
    });
  };

  const removeExercise = (sectionKey: keyof DailyPlanPayload, index: number) => {
    setEditingPlan((prev) => {
      if (!prev) return prev;
      const section = { ...prev[sectionKey] } as DailyPlanSection;
      const exercises = section.exercises.filter((_, i) => i !== index);
      return { ...prev, [sectionKey]: { ...section, exercises } } as DailyPlanPayload;
    });
  };

  const renderExercises = (sectionKey: keyof DailyPlanPayload, section: DailyPlanSection) => {
    const isEditing = Boolean(editingPlan);
    return (
      <View style={{ gap: spacing.sm }}>
        {section.exercises.length === 0 ? (
          <View style={[shared.emptyState, { padding: spacing.xl }]}>
            <Ionicons name="barbell-outline" size={24} color={colors.textMuted} />
            <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: spacing.sm }}>
              No exercises yet.
            </Text>
          </View>
        ) : (
          section.exercises.map((exercise, index) => (
            <View
              key={`${sectionKey}-${index}`}
              style={{
                backgroundColor: colors.bgCardAlt,
                borderRadius: radii.lg,
                padding: spacing.md,
                borderLeftWidth: 3,
                borderLeftColor: SECTION_COLORS[sectionKey]?.text ?? colors.teal,
              }}
            >
              {isEditing ? (
                <View style={{ gap: spacing.sm }}>
                  <TextInput
                    value={exercise.name}
                    onChangeText={(text) => updateExercise(sectionKey, index, { name: text })}
                    style={shared.input}
                  />
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <TextInput
                      value={exercise.sets != null ? String(exercise.sets) : ''}
                      onChangeText={(text) =>
                        updateExercise(sectionKey, index, {
                          sets: text ? Number(text) : null,
                        })
                      }
                      placeholder="Sets"
                      placeholderTextColor={colors.textPlaceholder}
                      keyboardType="numeric"
                      style={[shared.input, { flex: 1 }]}
                    />
                    <TextInput
                      value={exercise.reps != null ? String(exercise.reps) : ''}
                      onChangeText={(text) =>
                        updateExercise(sectionKey, index, {
                          reps: text ? Number(text) : null,
                        })
                      }
                      placeholder="Reps"
                      placeholderTextColor={colors.textPlaceholder}
                      keyboardType="numeric"
                      style={[shared.input, { flex: 1 }]}
                    />
                    <TextInput
                      value={exercise.duration_seconds != null ? String(exercise.duration_seconds) : ''}
                      onChangeText={(text) =>
                        updateExercise(sectionKey, index, {
                          duration_seconds: text ? Number(text) : null,
                        })
                      }
                      placeholder="Secs"
                      placeholderTextColor={colors.textPlaceholder}
                      keyboardType="numeric"
                      style={[shared.input, { flex: 1 }]}
                    />
                  </View>
                  <TextInput
                    value={exercise.notes ?? ''}
                    onChangeText={(text) => updateExercise(sectionKey, index, { notes: text })}
                    placeholder="Notes"
                    placeholderTextColor={colors.textPlaceholder}
                    style={shared.input}
                  />
                  <TextInput
                    value={exercise.reason ?? ''}
                    onChangeText={(text) => updateExercise(sectionKey, index, { reason: text })}
                    placeholder="Reason"
                    placeholderTextColor={colors.textPlaceholder}
                    style={shared.input}
                  />
                  <Pressable onPress={() => removeExercise(sectionKey, index)}>
                    <Text style={{ ...typography.caption, color: '#fda4af' }}>Remove</Text>
                  </Pressable>
                </View>
              ) : (
                <View>
                  <View style={[shared.rowBetween, { marginBottom: 4 }]}>
                    <Text style={{ ...typography.bodySemibold, color: colors.textPrimary, flex: 1 }}>
                      {exercise.name}
                    </Text>
                    {/* Sets × Reps badge */}
                    {(exercise.sets != null || exercise.reps != null) && (
                      <View
                        style={{
                          backgroundColor: SECTION_COLORS[sectionKey]?.bg ?? colors.tealDim,
                          paddingHorizontal: spacing.sm + 2,
                          paddingVertical: spacing.xs,
                          borderRadius: radii.sm,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {exercise.sets != null && (
                          <Text style={{ ...typography.captionMedium, color: SECTION_COLORS[sectionKey]?.text ?? colors.tealLight }}>
                            {exercise.sets}×{exercise.reps ?? '—'}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                  {/* Duration + side info */}
                  {(exercise.duration_seconds != null || exercise.side || exercise.notes) && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 }}>
                      {exercise.duration_seconds != null && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
                          <Text style={{ ...typography.small, color: colors.textTertiary }}>
                            {exercise.duration_seconds}s
                          </Text>
                        </View>
                      )}
                      {exercise.side && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="swap-horizontal-outline" size={12} color={colors.textTertiary} />
                          <Text style={{ ...typography.small, color: colors.textTertiary }}>
                            {exercise.side}
                          </Text>
                        </View>
                      )}
                      {exercise.notes && (
                        <Text style={{ ...typography.small, color: colors.textTertiary }}>
                          {exercise.notes}
                        </Text>
                      )}
                    </View>
                  )}
                  {exercise.reason ? (
                    <Text style={{ ...typography.small, color: colors.tealLight, marginTop: 6 }}>
                      {exercise.reason}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          ))
        )}
        {isEditing && (
          <Pressable
            onPress={() => addExercise(sectionKey)}
            style={[shared.btnSecondary, { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }]}
          >
            <Ionicons name="add-outline" size={16} color={colors.textTertiary} />
            <Text style={shared.btnSecondaryText}>Add Exercise</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const renderSection = (sectionKey: keyof DailyPlanPayload, section?: DailyPlanSection | null) => {
    if (!section) return null;
    const sectionColor = SECTION_COLORS[sectionKey];
    const exerciseCount = section.exercises.length;

    return (
      <View
        key={sectionKey}
        style={{
          backgroundColor: colors.bgBase,
          borderRadius: radii.xl,
          padding: spacing.lg,
          borderWidth: 1,
          borderColor: sectionColor?.border ?? colors.border,
          marginBottom: spacing.lg,
        }}
      >
        <View style={[shared.rowBetween, { marginBottom: spacing.md }]}>
          <View style={[shared.row, { gap: spacing.sm }]}>
            <Text style={{ fontSize: 20 }}>{SECTION_ICONS[sectionKey] ?? '✦'}</Text>
            <View>
              <Text style={{ ...typography.h3, color: colors.textPrimary }}>
                {section.title || SECTION_LABELS[sectionKey]}
              </Text>
              <Text style={{ ...typography.small, color: colors.textTertiary }}>
                {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''} · {estimateSessionDuration(exerciseCount)}
              </Text>
            </View>
          </View>
          {/* Color-coded session badge */}
          <View
            style={{
              backgroundColor: sectionColor?.bg ?? colors.tealDim,
              paddingHorizontal: spacing.sm + 2,
              paddingVertical: spacing.xs,
              borderRadius: radii.full,
              borderWidth: 1,
              borderColor: sectionColor?.border ?? colors.tealBorder,
            }}
          >
            <Text style={{ ...typography.tiny, color: sectionColor?.text ?? colors.tealLight }}>
              {SECTION_LABELS[sectionKey]}
            </Text>
          </View>
        </View>
        {section.focus ? (
          <Text style={{ ...typography.caption, color: colors.textTertiary, marginBottom: spacing.md }}>
            {section.focus}
          </Text>
        ) : null}
        {renderExercises(sectionKey, section)}
      </View>
    );
  };

  const activePlan = editingPlan ?? plan?.plan ?? null;
  const reasoning = plan?.reasoning ?? [];

  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={shared.screenContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealLight} />
      }
    >
      {/* Header */}
      <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
        <View>
          <Text style={{ ...typography.caption, color: colors.tealLight, marginBottom: 2 }}>
            {getGreeting()} ✦
          </Text>
          <Text style={shared.pageTitle}>Today&apos;s Plan</Text>
          <Text style={shared.pageSubtitle}>{format(new Date(todayKey), 'EEEE, MMMM d')}</Text>
        </View>
        <Pressable
          onPress={handleGenerate}
          disabled={isGenerating}
          style={[
            shared.btnPrimary,
            shared.btnSmall,
            isGenerating && { backgroundColor: colors.bgCard },
          ]}
        >
          <Ionicons name="sparkles" size={14} color="#fff" />
          <Text style={{ ...typography.captionMedium, color: '#fff' }}>
            {isGenerating ? 'Generating...' : 'Generate'}
          </Text>
        </Pressable>
      </View>

      {/* Daily Tip */}
      <View
        style={{
          backgroundColor: colors.tealDim,
          borderRadius: radii.lg,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.tealBorder,
          marginBottom: spacing.lg,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.sm,
        }}
      >
        <Text style={{ ...typography.caption, color: colors.tealLight, flex: 1, lineHeight: 20 }}>
          {getDailyTip()}
        </Text>
      </View>

      {/* Plan Inputs */}
      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md }}>Plan Inputs</Text>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={shared.inputLabel}>Pain (1-10)</Text>
            <TextInput
              value={painOverride}
              onChangeText={setPainOverride}
              placeholder={latestMetric?.pain_level != null ? String(latestMetric.pain_level) : '—'}
              placeholderTextColor={colors.textPlaceholder}
              keyboardType="numeric"
              style={shared.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={shared.inputLabel}>Energy (1-10)</Text>
            <TextInput
              value={energyOverride}
              onChangeText={setEnergyOverride}
              placeholder={latestMetric?.energy_level != null ? String(latestMetric.energy_level) : '—'}
              placeholderTextColor={colors.textPlaceholder}
              keyboardType="numeric"
              style={shared.input}
            />
          </View>
        </View>
        <View style={[shared.rowBetween, { marginBottom: spacing.sm }]}>
          <Text style={{ ...typography.bodyMedium, color: colors.textSecondary }}>Gym day today</Text>
          <Switch
            value={gymDay}
            onValueChange={setGymDay}
            trackColor={{ false: '#334155', true: colors.teal }}
            thumbColor="#fff"
          />
        </View>
        {gymDay && (
          <TextInput
            value={gymFocus}
            onChangeText={setGymFocus}
            placeholder="Gym focus (e.g. Upper body)"
            placeholderTextColor={colors.textPlaceholder}
            style={[shared.input, { marginTop: spacing.sm }]}
          />
        )}

        {/* Quick stats row */}
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            marginTop: spacing.md,
            paddingTop: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.borderLight,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: correctiveSessions.total >= 3 ? colors.success : colors.warning }} />
            <Text style={{ ...typography.small, color: colors.textTertiary }}>
              Corrective: {correctiveSessions.total}/3
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="barbell-outline" size={12} color={colors.textTertiary} />
            <Text style={{ ...typography.small, color: colors.textTertiary }}>
              Yesterday: {yesterdayWorkouts.length} workouts
            </Text>
          </View>
        </View>
      </View>

      {isLoading ? (
        <LoadingState label="Loading daily plan..." rows={4} />
      ) : !plan ? (
        <View
          style={[shared.card, {
            borderStyle: 'dashed',
            alignItems: 'center',
            paddingVertical: spacing['3xl'],
          }]}
        >
          <Ionicons name="sparkles-outline" size={40} color={colors.textMuted} />
          <Text style={shared.emptyStateTitle}>No plan yet</Text>
          <Text style={shared.emptyStateText}>
            Tap Generate to create today&apos;s AI-powered plan based on your metrics and progress.
          </Text>
        </View>
      ) : (
        <View>
          {/* Status bar */}
          <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
            <View style={[shared.row, { gap: spacing.sm }]}>
              {/* Status badge */}
              <View
                style={[shared.badge, {
                  backgroundColor: plan.status === 'accepted' ? colors.successDim : plan.status === 'modified' ? colors.warningDim : colors.tealDim,
                }]}
              >
                <Ionicons
                  name={plan.status === 'accepted' ? 'checkmark-circle' : 'ellipse'}
                  size={12}
                  color={plan.status === 'accepted' ? colors.success : plan.status === 'modified' ? colors.warning : colors.tealLight}
                />
                <Text style={{
                  ...typography.small,
                  color: plan.status === 'accepted' ? colors.success : plan.status === 'modified' ? colors.warning : colors.tealLight,
                  textTransform: 'capitalize',
                }}>
                  {plan.status}
                </Text>
              </View>
              {plan.model ? (
                <Text style={{ ...typography.small, color: colors.textMuted }}>
                  {plan.model}
                </Text>
              ) : null}
            </View>
            <View style={[shared.row, { gap: spacing.sm }]}>
              {!editingPlan ? (
                <>
                  <Pressable onPress={startEditing} style={[shared.btnSecondary, shared.btnSmall]}>
                    <Ionicons name="create-outline" size={14} color={colors.textSecondary} />
                    <Text style={{ ...typography.small, color: colors.textSecondary }}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => updatePlanStatus('accepted')} style={[shared.btnPrimary, shared.btnSmall]}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                    <Text style={{ ...typography.small, color: '#fff' }}>Accept</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable onPress={saveEdits} style={[shared.btnPrimary, shared.btnSmall]}>
                    <Text style={{ ...typography.small, color: '#fff' }}>Save</Text>
                  </Pressable>
                  <Pressable onPress={() => setEditingPlan(null)} style={[shared.btnSecondary, shared.btnSmall]}>
                    <Text style={{ ...typography.small, color: colors.textSecondary }}>Cancel</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>

          {activePlan && SECTION_ORDER.map((key) => renderSection(key, activePlan[key]))}

          {reasoning.length > 0 && (
            <View style={[shared.card, { marginTop: spacing.xs }]}>
              <View style={[shared.row, { gap: spacing.sm, marginBottom: spacing.md }]}>
                <Ionicons name="bulb-outline" size={18} color={colors.tealLight} />
                <Text style={{ ...typography.h3, color: colors.textPrimary }}>Why this plan</Text>
              </View>
              {reasoning.map((item, index) => (
                <View
                  key={`reason-${index}`}
                  style={{
                    flexDirection: 'row',
                    gap: spacing.sm,
                    marginBottom: spacing.sm,
                    paddingLeft: spacing.xs,
                  }}
                >
                  <Text style={{ ...typography.caption, color: colors.tealLight }}>•</Text>
                  <Text style={{ ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 20 }}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {recentPlans.length > 1 && (
        <View style={{ marginTop: spacing['3xl'] }}>
          <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md }}>
            Recent Plans
          </Text>
          {recentPlans
            .filter((item) => item.id !== plan?.id)
            .slice(0, 3)
            .map((item) => (
              <View
                key={item.id}
                style={{
                  backgroundColor: colors.bgBase,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: spacing.sm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View>
                  <Text style={{ ...typography.bodyMedium, color: colors.textSecondary }}>
                    {format(new Date(item.plan_date), 'MMM d, yyyy')}
                  </Text>
                  <Text style={{ ...typography.small, color: colors.textMuted, marginTop: 2 }}>
                    Generated {format(new Date(item.created_at), 'h:mm a')}
                  </Text>
                </View>
                <View
                  style={[shared.badge, {
                    backgroundColor: item.status === 'accepted' ? colors.successDim : colors.bgCard,
                  }]}
                >
                  <Text style={{
                    ...typography.tiny,
                    color: item.status === 'accepted' ? colors.success : colors.textTertiary,
                    textTransform: 'capitalize',
                  }}>
                    {item.status}
                  </Text>
                </View>
              </View>
            ))}
        </View>
      )}
    </ScrollView>
  );
}
