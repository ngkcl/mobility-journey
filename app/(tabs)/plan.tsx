import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, TextInput, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getSupabase } from '../../lib/supabase';
import { generateDailyPlan } from '../../lib/api';
import { normalizeDailyPlan, normalizeReasoning } from '../../lib/dailyPlan';
import { buildPostureTrend } from '../../lib/postureSessions';
import LoadingState from '../../components/LoadingState';
import { useToast } from '../../components/Toast';
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
      <View className="gap-3">
        {section.exercises.length === 0 ? (
          <Text className="text-slate-500 text-sm">No exercises yet.</Text>
        ) : (
          section.exercises.map((exercise, index) => (
            <View key={`${sectionKey}-${index}`} className="bg-slate-800/50 rounded-xl p-3">
              {isEditing ? (
                <View className="gap-2">
                  <TextInput
                    value={exercise.name}
                    onChangeText={(text) => updateExercise(sectionKey, index, { name: text })}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                  <View className="flex-row gap-2">
                    <TextInput
                      value={exercise.sets != null ? String(exercise.sets) : ''}
                      onChangeText={(text) =>
                        updateExercise(sectionKey, index, {
                          sets: text ? Number(text) : null,
                        })
                      }
                      placeholder="Sets"
                      placeholderTextColor="#64748b"
                      keyboardType="numeric"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                    <TextInput
                      value={exercise.reps != null ? String(exercise.reps) : ''}
                      onChangeText={(text) =>
                        updateExercise(sectionKey, index, {
                          reps: text ? Number(text) : null,
                        })
                      }
                      placeholder="Reps"
                      placeholderTextColor="#64748b"
                      keyboardType="numeric"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                    <TextInput
                      value={exercise.duration_seconds != null ? String(exercise.duration_seconds) : ''}
                      onChangeText={(text) =>
                        updateExercise(sectionKey, index, {
                          duration_seconds: text ? Number(text) : null,
                        })
                      }
                      placeholder="Secs"
                      placeholderTextColor="#64748b"
                      keyboardType="numeric"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                  </View>
                  <TextInput
                    value={exercise.notes ?? ''}
                    onChangeText={(text) => updateExercise(sectionKey, index, { notes: text })}
                    placeholder="Notes"
                    placeholderTextColor="#64748b"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                  <TextInput
                    value={exercise.reason ?? ''}
                    onChangeText={(text) => updateExercise(sectionKey, index, { reason: text })}
                    placeholder="Reason"
                    placeholderTextColor="#64748b"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                  <Pressable
                    onPress={() => removeExercise(sectionKey, index)}
                    className="self-start"
                  >
                    <Text className="text-rose-300 text-sm">Remove</Text>
                  </Pressable>
                </View>
              ) : (
                <View>
                  <Text className="text-white font-medium">{exercise.name}</Text>
                  {formatExerciseMeta(exercise) ? (
                    <Text className="text-slate-400 text-xs mt-1">
                      {formatExerciseMeta(exercise)}
                    </Text>
                  ) : null}
                  {exercise.reason ? (
                    <Text className="text-teal-300 text-xs mt-1">{exercise.reason}</Text>
                  ) : null}
                </View>
              )}
            </View>
          ))
        )}
        {isEditing && (
          <Pressable
            onPress={() => addExercise(sectionKey)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2"
          >
            <Text className="text-slate-300 text-sm">Add Exercise</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const renderSection = (sectionKey: keyof DailyPlanPayload, section?: DailyPlanSection | null) => {
    if (!section) return null;

    return (
      <View key={sectionKey} className="bg-slate-900 rounded-2xl p-4 border border-slate-800 mb-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-white font-semibold text-lg">
            {section.title || SECTION_LABELS[sectionKey]}
          </Text>
          <Ionicons name="sparkles" size={16} color="#5eead4" />
        </View>
        {section.focus ? (
          <Text className="text-slate-400 text-sm mb-3">{section.focus}</Text>
        ) : null}
        {renderExercises(sectionKey, section)}
      </View>
    );
  };

  const activePlan = editingPlan ?? plan?.plan ?? null;
  const reasoning = plan?.reasoning ?? [];

  return (
    <ScrollView
      className="flex-1 bg-[#0b1020]"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5eead4" />
      }
    >
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-semibold text-white">Today's Plan</Text>
          <Text className="text-slate-400 text-sm">{format(new Date(todayKey), 'MMMM d, yyyy')}</Text>
        </View>
        <Pressable
          onPress={handleGenerate}
          disabled={isGenerating}
          className={`px-4 py-2 rounded-xl flex-row items-center gap-2 ${
            isGenerating ? 'bg-slate-800' : 'bg-teal-500'
          }`}
        >
          <Ionicons name="sparkles" size={16} color="#fff" />
          <Text className="text-white font-medium text-sm">
            {isGenerating ? 'Generating...' : 'Generate'}
          </Text>
        </Pressable>
      </View>

      <View className="bg-slate-900 rounded-2xl p-4 border border-slate-800 mb-6">
        <Text className="text-white font-semibold mb-3">Plan inputs</Text>
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1">
            <Text className="text-slate-400 text-xs mb-1">Pain (1-10)</Text>
            <TextInput
              value={painOverride}
              onChangeText={setPainOverride}
              placeholder={latestMetric?.pain_level != null ? String(latestMetric.pain_level) : '—'}
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </View>
          <View className="flex-1">
            <Text className="text-slate-400 text-xs mb-1">Energy (1-10)</Text>
            <TextInput
              value={energyOverride}
              onChangeText={setEnergyOverride}
              placeholder={latestMetric?.energy_level != null ? String(latestMetric.energy_level) : '—'}
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </View>
        </View>
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-slate-300">Gym day today</Text>
          <Switch
            value={gymDay}
            onValueChange={setGymDay}
            trackColor={{ false: '#334155', true: '#14b8a6' }}
            thumbColor="#fff"
          />
        </View>
        {gymDay && (
          <TextInput
            value={gymFocus}
            onChangeText={setGymFocus}
            placeholder="Gym focus (e.g. Upper body)"
            placeholderTextColor="#64748b"
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
          />
        )}
        <Text className="text-slate-500 text-xs mt-3">
          Yesterday workouts: {yesterdayWorkouts.length} | Corrective done: {correctiveSessions.total}/3
        </Text>
      </View>

      {isLoading ? (
        <LoadingState label="Loading daily plan..." />
      ) : !plan ? (
        <View className="bg-slate-900 rounded-2xl p-8 border border-slate-800 border-dashed items-center">
          <Text className="text-slate-300 text-center">
            No plan generated yet. Tap Generate to create today&apos;s plan.
          </Text>
        </View>
      ) : (
        <View>
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-white font-semibold">Status: {plan.status}</Text>
              {plan.model ? (
                <Text className="text-slate-500 text-xs mt-1">Model: {plan.model}</Text>
              ) : null}
            </View>
            <View className="flex-row gap-2">
              {!editingPlan ? (
                <>
                  <Pressable
                    onPress={startEditing}
                    className="bg-slate-800 px-3 py-2 rounded-xl"
                  >
                    <Text className="text-slate-200 text-xs">Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => updatePlanStatus('accepted')}
                    className="bg-teal-500 px-3 py-2 rounded-xl"
                  >
                    <Text className="text-white text-xs font-semibold">Accept</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={saveEdits}
                    className="bg-teal-500 px-3 py-2 rounded-xl"
                  >
                    <Text className="text-white text-xs font-semibold">Save</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setEditingPlan(null)}
                    className="bg-slate-800 px-3 py-2 rounded-xl"
                  >
                    <Text className="text-slate-200 text-xs">Cancel</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>

          {activePlan && SECTION_ORDER.map((key) => renderSection(key, activePlan[key]))}

          {reasoning.length > 0 && (
            <View className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
              <Text className="text-white font-semibold mb-3">Why this plan</Text>
              {reasoning.map((item, index) => (
                <Text key={`reason-${index}`} className="text-slate-300 text-sm mb-2">
 | {item}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {recentPlans.length > 1 && (
        <View className="mt-8">
          <Text className="text-white font-semibold mb-3">Recent plans</Text>
          {recentPlans
            .filter((item) => item.id !== plan?.id)
            .slice(0, 3)
            .map((item) => (
              <View
                key={item.id}
                className="bg-slate-900 rounded-2xl p-3 border border-slate-800 mb-2"
              >
                <Text className="text-slate-200 text-sm">
                  {format(new Date(item.plan_date), 'MMM d')} | {item.status}
                </Text>
                <Text className="text-slate-500 text-xs mt-1">
                  Generated {format(new Date(item.created_at), 'h:mm a')}
                </Text>
              </View>
            ))}
        </View>
      )}
    </ScrollView>
  );
}
