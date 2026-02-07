import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getSupabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import LoadingState from '../../components/LoadingState';
import { computeWorkoutSummary } from '../../lib/workouts';
import type {
  Exercise,
  ExerciseCategory,
  Workout,
  WorkoutExercise,
  WorkoutSet,
  WorkoutSetSide,
  WorkoutType,
} from '../../lib/types';

const WORKOUT_TYPES: { value: WorkoutType; label: string; tone: string }[] = [
  { value: 'corrective', label: 'Corrective', tone: 'bg-teal-500/20 text-teal-200' },
  { value: 'gym', label: 'Gym', tone: 'bg-indigo-500/20 text-indigo-200' },
  { value: 'cardio', label: 'Cardio', tone: 'bg-rose-500/20 text-rose-200' },
  { value: 'other', label: 'Other', tone: 'bg-slate-500/20 text-slate-200' },
];

const CATEGORY_META: Record<ExerciseCategory, { label: string; bg: string; text: string }> = {
  corrective: { label: 'Corrective', bg: 'bg-teal-500/20', text: 'text-teal-200' },
  stretching: { label: 'Stretching', bg: 'bg-amber-500/20', text: 'text-amber-200' },
  strengthening: { label: 'Strength', bg: 'bg-emerald-500/20', text: 'text-emerald-200' },
  warmup: { label: 'Warmup', bg: 'bg-sky-500/20', text: 'text-sky-200' },
  cooldown: { label: 'Cooldown', bg: 'bg-slate-500/20', text: 'text-slate-200' },
  gym_compound: { label: 'Gym: Compound', bg: 'bg-indigo-500/20', text: 'text-indigo-200' },
  gym_isolation: { label: 'Gym: Isolation', bg: 'bg-purple-500/20', text: 'text-purple-200' },
  cardio: { label: 'Cardio', bg: 'bg-rose-500/20', text: 'text-rose-200' },
  mobility: { label: 'Mobility', bg: 'bg-cyan-500/20', text: 'text-cyan-200' },
};

type WorkoutExerciseDraft = {
  id: string;
  exercise: Exercise;
  sets: WorkoutSet[];
};

type WorkoutDraft = {
  type: WorkoutType;
  startedAt: Date;
  notes: string;
  energyBefore?: number;
  painBefore?: number;
};

type WorkoutHistoryItem = {
  workout: Workout;
  exercises: WorkoutExercise[];
};

type SetDraft = {
  reps: string;
  weight: string;
  duration: string;
  side: WorkoutSetSide;
  rpe: string;
  notes: string;
};

const emptySetDraft = (side: WorkoutSetSide): SetDraft => ({
  reps: '',
  weight: '',
  duration: '',
  side,
  rpe: '',
  notes: '',
});

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatSeconds = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const buildWorkoutExercisePayload = (exercise: WorkoutExerciseDraft, index: number) => ({
  exercise_id: exercise.exercise.id,
  order_index: index,
  sets: exercise.sets,
});

export default function WorkoutsScreen() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [recentExercises, setRecentExercises] = useState<Exercise[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showStartForm, setShowStartForm] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDraft | null>(null);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExerciseDraft[]>([]);
  const [setDrafts, setSetDrafts] = useState<Record<string, SetDraft>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [restDuration, setRestDuration] = useState(90);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [restingExerciseId, setRestingExerciseId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [energyAfter, setEnergyAfter] = useState<string>('');
  const [painAfter, setPainAfter] = useState<string>('');
  const [summary, setSummary] = useState<ReturnType<typeof computeWorkoutSummary> | null>(null);
  const { pushToast } = useToast();

  const loadExercises = async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      pushToast('Failed to load exercises.', 'error');
      return;
    }

    setExercises(data ?? []);
  };

  const loadWorkouts = async () => {
    const supabase = getSupabase();
    const { data: workoutRows, error: workoutError } = await supabase
      .from('workouts')
      .select('*')
      .order('date', { ascending: false })
      .limit(10);

    if (workoutError) {
      pushToast('Failed to load workouts.', 'error');
      return;
    }

    const ids = (workoutRows ?? []).map((row: Workout) => row.id);
    let exerciseRows: WorkoutExercise[] = [];
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('workout_exercises')
        .select('*')
        .in('workout_id', ids);

      if (!error) exerciseRows = data ?? [];
    }

    const history = (workoutRows ?? []).map((row: Workout) => ({
      workout: row,
      exercises: exerciseRows.filter((exercise) => exercise.workout_id === row.id),
    }));

    setWorkouts(history);
  };

  const loadRecentExercises = async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('workout_exercises')
      .select('exercise_id, exercises:exercise_id (id, name, category, target_muscles, side_specific, sets_default, reps_default, duration_seconds_default)')
      .order('created_at', { ascending: false })
      .limit(12);

    if (error) return;

    const deduped = new Map<string, Exercise>();
    (data ?? []).forEach((row: any) => {
      const exercise = row.exercises as Exercise | null;
      if (exercise && !deduped.has(exercise.id)) {
        deduped.set(exercise.id, exercise);
      }
    });

    setRecentExercises(Array.from(deduped.values()).slice(0, 6));
  };

  const loadAll = async () => {
    await Promise.all([loadExercises(), loadWorkouts(), loadRecentExercises()]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!activeWorkout) {
      setElapsedSeconds(0);
      return;
    }

    const startTime = activeWorkout.startedAt.getTime();
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(id);
  }, [activeWorkout]);

  useEffect(() => {
    if (restRemaining === null) return;
    if (restRemaining <= 0) {
      setRestRemaining(null);
      setRestingExerciseId(null);
      return;
    }

    const id = setInterval(() => {
      setRestRemaining((prev) => {
        if (prev === null) return null;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [restRemaining]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const resetWorkoutState = () => {
    setActiveWorkout(null);
    setWorkoutExercises([]);
    setSetDrafts({});
    setSearchQuery('');
    setShowExercisePicker(false);
    setRestRemaining(null);
    setRestingExerciseId(null);
    setElapsedSeconds(0);
    setEnergyAfter('');
    setPainAfter('');
  };

  const startWorkout = () => {
    if (!activeWorkout) return;
    setShowStartForm(false);
  };

  const addExercise = (exercise: Exercise) => {
    if (workoutExercises.some((entry) => entry.exercise.id === exercise.id)) {
      pushToast('Exercise already added.', 'info');
      return;
    }

    const id = `${exercise.id}-${Date.now()}`;
    const side: WorkoutSetSide = exercise.side_specific ? 'left' : 'bilateral';

    setWorkoutExercises((prev) => [
      ...prev,
      {
        id,
        exercise,
        sets: [],
      },
    ]);

    setSetDrafts((prev) => ({ ...prev, [id]: emptySetDraft(side) }));
  };

  const updateSetDraft = (id: string, patch: Partial<SetDraft>) => {
    setSetDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const addSet = (entry: WorkoutExerciseDraft) => {
    const draft = setDrafts[entry.id];
    if (!draft) return;

    const reps = parseNumber(draft.reps);
    const weight = parseNumber(draft.weight);
    const duration = parseNumber(draft.duration);
    const rpe = parseNumber(draft.rpe);
    const notes = draft.notes.trim();

    if (reps === null && duration === null) {
      pushToast('Add reps or duration.', 'error');
      return;
    }

    const set: WorkoutSet = {
      reps,
      weight_kg: weight,
      duration_seconds: duration,
      side: entry.exercise.side_specific ? draft.side : 'bilateral',
      rpe,
      notes: notes || null,
    };

    setWorkoutExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === entry.id ? { ...exercise, sets: [...exercise.sets, set] } : exercise,
      ),
    );

    setSetDrafts((prev) => ({
      ...prev,
      [entry.id]: { ...emptySetDraft(draft.side), side: draft.side },
    }));

    if (restDuration > 0) {
      setRestRemaining(restDuration);
      setRestingExerciseId(entry.id);
    }
  };

  const removeSet = (entryId: string, index: number) => {
    setWorkoutExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.id !== entryId) return exercise;
        const next = [...exercise.sets];
        next.splice(index, 1);
        return { ...exercise, sets: next };
      }),
    );
  };

  const removeExercise = (entryId: string) => {
    setWorkoutExercises((prev) => prev.filter((exercise) => exercise.id !== entryId));
    setSetDrafts((prev) => {
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
  };

  const finishWorkout = async () => {
    if (!activeWorkout) return;
    if (workoutExercises.length === 0) {
      pushToast('Add at least one exercise.', 'error');
      return;
    }

    const hasSets = workoutExercises.some((exercise) => exercise.sets.length > 0);
    if (!hasSets) {
      pushToast('Log at least one set.', 'error');
      return;
    }

    const supabase = getSupabase();
    const startedAt = activeWorkout.startedAt.toISOString();
    const endedAt = new Date().toISOString();
    const durationMinutes = Math.max(1, Math.round((Date.now() - activeWorkout.startedAt.getTime()) / 60000));
    const workoutPayload = {
      date: startedAt.split('T')[0],
      type: activeWorkout.type,
      started_at: startedAt,
      ended_at: endedAt,
      duration_minutes: durationMinutes,
      notes: activeWorkout.notes.trim() || null,
      energy_level_before: activeWorkout.energyBefore ?? null,
      pain_level_before: activeWorkout.painBefore ?? null,
      energy_level_after: parseNumber(energyAfter),
      pain_level_after: parseNumber(painAfter),
    };

    const { data, error } = await supabase
      .from('workouts')
      .insert(workoutPayload)
      .select('*')
      .single();

    if (error || !data) {
      pushToast('Failed to save workout.', 'error');
      return;
    }

    const exercisePayload = workoutExercises.map((exercise, index) => ({
      workout_id: data.id,
      ...buildWorkoutExercisePayload(exercise, index),
    }));

    const { error: exerciseError } = await supabase.from('workout_exercises').insert(exercisePayload);
    if (exerciseError) {
      pushToast('Workout saved, but exercises failed.', 'error');
    }

    const workoutSummary = computeWorkoutSummary(workoutExercises);
    setSummary({ ...workoutSummary, totalDurationSeconds: durationMinutes * 60 });
    resetWorkoutState();
    await loadAll();
    pushToast('Workout logged.', 'success');
  };

  const cancelWorkout = () => {
    Alert.alert('Discard Workout', 'Are you sure you want to discard this workout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          resetWorkoutState();
          setShowStartForm(false);
        },
      },
    ]);
  };

  const filteredExercises = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return exercises;
    return exercises.filter((exercise) =>
      `${exercise.name} ${exercise.description ?? ''}`.toLowerCase().includes(query),
    );
  }, [exercises, searchQuery]);

  const workoutSummary = useMemo(() => computeWorkoutSummary(workoutExercises), [workoutExercises]);

  const activeWorkoutForm = activeWorkout ?? {
    type: 'corrective' as WorkoutType,
    startedAt: new Date(),
    notes: '',
  };

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
          <Text className="text-2xl font-semibold text-white">Workouts</Text>
          <Text className="text-slate-400 text-sm">Log sets, track asymmetry, and rest timers</Text>
        </View>
        {!activeWorkout && (
          <Pressable
            onPress={() => {
              setActiveWorkout({ type: 'corrective', startedAt: new Date(), notes: '' });
              setShowStartForm(true);
            }}
            className="bg-teal-500 px-4 py-2 rounded-xl flex-row items-center gap-2"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text className="text-white font-medium text-sm">Start</Text>
          </Pressable>
        )}
      </View>

      {showStartForm && activeWorkout && (
        <View className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800/70 mb-6">
          <Text className="text-lg font-semibold text-white mb-4">Start Workout</Text>
          <Text className="text-sm text-slate-300 mb-2">Type</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {WORKOUT_TYPES.map((type) => (
              <Pressable
                key={type.value}
                onPress={() => setActiveWorkout({ ...activeWorkout, type: type.value })}
                className={`px-3 py-2 rounded-lg border ${
                  activeWorkout.type === type.value
                    ? 'bg-teal-500 border-teal-400'
                    : 'border-slate-700'
                }`}
              >
                <Text
                  className={`${activeWorkout.type === type.value ? 'text-white' : 'text-slate-300'}`}
                >
                  {type.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-sm text-slate-300 mb-1">Energy (1-10)</Text>
              <TextInput
                keyboardType="numeric"
                placeholder="7"
                placeholderTextColor="#64748b"
                value={activeWorkout.energyBefore ? String(activeWorkout.energyBefore) : ''}
                onChangeText={(text) =>
                  setActiveWorkout({ ...activeWorkout, energyBefore: parseNumber(text) ?? undefined })
                }
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm text-slate-300 mb-1">Pain (1-10)</Text>
              <TextInput
                keyboardType="numeric"
                placeholder="3"
                placeholderTextColor="#64748b"
                value={activeWorkout.painBefore ? String(activeWorkout.painBefore) : ''}
                onChangeText={(text) =>
                  setActiveWorkout({ ...activeWorkout, painBefore: parseNumber(text) ?? undefined })
                }
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
              />
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-sm text-slate-300 mb-1">Rest Timer (seconds)</Text>
            <TextInput
              keyboardType="numeric"
              placeholder="90"
              placeholderTextColor="#64748b"
              value={String(restDuration)}
              onChangeText={(text) => setRestDuration(parseNumber(text) ?? 0)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm text-slate-300 mb-1">Notes</Text>
            <TextInput
              placeholder="Workout focus or goals"
              placeholderTextColor="#64748b"
              value={activeWorkout.notes}
              onChangeText={(text) => setActiveWorkout({ ...activeWorkout, notes: text })}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
            />
          </View>

          <View className="flex-row gap-2">
            <Pressable
              onPress={() => {
                startWorkout();
              }}
              className="bg-teal-500 px-4 py-2.5 rounded-xl flex-1 items-center"
            >
              <Text className="text-white font-medium">Begin Workout</Text>
            </Pressable>
            <Pressable onPress={cancelWorkout} className="bg-slate-800 px-4 py-2.5 rounded-xl">
              <Text className="text-slate-300">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {summary && !activeWorkout && (
        <View className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800/70 mb-6">
          <Text className="text-lg font-semibold text-white mb-4">Workout Summary</Text>
          <View className="flex-row flex-wrap gap-3">
            <View className="bg-slate-950/70 rounded-xl px-4 py-3 border border-slate-800/70">
              <Text className="text-slate-400 text-xs">Total Volume</Text>
              <Text className="text-white font-semibold">{Math.round(summary.totalVolumeKg)} kg</Text>
            </View>
            <View className="bg-slate-950/70 rounded-xl px-4 py-3 border border-slate-800/70">
              <Text className="text-slate-400 text-xs">Total Sets</Text>
              <Text className="text-white font-semibold">{summary.totalSets}</Text>
            </View>
            <View className="bg-slate-950/70 rounded-xl px-4 py-3 border border-slate-800/70">
              <Text className="text-slate-400 text-xs">Duration</Text>
              <Text className="text-white font-semibold">
                {Math.round(summary.totalDurationSeconds / 60)} min
              </Text>
            </View>
            <View className="bg-slate-950/70 rounded-xl px-4 py-3 border border-slate-800/70">
              <Text className="text-slate-400 text-xs">Left/Right</Text>
              <Text className="text-white font-semibold">
                {summary.leftVolumeKg} / {summary.rightVolumeKg} kg
              </Text>
            </View>
          </View>
          {summary.imbalancePct !== null && (
            <Text className="text-slate-400 text-sm mt-3">
              Imbalance: {summary.imbalancePct > 0 ? '+' : ''}
              {summary.imbalancePct}%
            </Text>
          )}
          <Pressable
            onPress={() => setSummary(null)}
            className="mt-4 bg-teal-500 px-4 py-2.5 rounded-xl items-center"
          >
            <Text className="text-white font-medium">Done</Text>
          </Pressable>
        </View>
      )}

      {activeWorkout && !showStartForm && (
        <View className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800/70 mb-6">
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-white font-semibold text-lg">{activeWorkoutForm.type}</Text>
              <Text className="text-slate-400 text-sm">Elapsed {formatSeconds(elapsedSeconds)}</Text>
            </View>
            <Pressable onPress={cancelWorkout} className="px-3 py-2 rounded-xl bg-slate-800">
              <Text className="text-slate-300 text-sm">Discard</Text>
            </Pressable>
          </View>

          {restRemaining !== null && (
            <View className="bg-slate-950/70 rounded-xl p-4 border border-amber-500/40 mb-4">
              <Text className="text-amber-200 text-sm">Rest Timer</Text>
              <Text className="text-white text-2xl font-semibold">
                {formatSeconds(Math.max(restRemaining, 0))}
              </Text>
              <Text className="text-slate-400 text-xs mt-1">
                {restingExerciseId ? 'Between sets' : 'Rest'}
              </Text>
              <Pressable
                onPress={() => {
                  setRestRemaining(null);
                  setRestingExerciseId(null);
                }}
                className="mt-3 px-3 py-2 rounded-lg bg-slate-800 self-start"
              >
                <Text className="text-slate-300 text-xs">Skip Rest</Text>
              </Pressable>
            </View>
          )}

          {recentExercises.length > 0 && (
            <View className="mb-4">
              <Text className="text-sm text-slate-300 mb-2">Quick add from recent</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {recentExercises.map((exercise) => (
                    <Pressable
                      key={exercise.id}
                      onPress={() => addExercise(exercise)}
                      className="px-3 py-2 rounded-full border border-slate-700"
                    >
                      <Text className="text-xs text-slate-200">{exercise.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          <Pressable
            onPress={() => setShowExercisePicker((prev) => !prev)}
            className="bg-slate-800 px-4 py-2 rounded-xl flex-row items-center gap-2"
          >
            <Ionicons name="add" size={16} color="#94a3b8" />
            <Text className="text-slate-200 text-sm">Add Exercise</Text>
          </Pressable>

          {showExercisePicker && (
            <View className="mt-4">
              <TextInput
                placeholder="Search exercises"
                placeholderTextColor="#64748b"
                className="bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <View className="mt-3 gap-2">
                {filteredExercises.slice(0, 20).map((exercise) => {
                  const meta = CATEGORY_META[exercise.category];
                  return (
                    <Pressable
                      key={exercise.id}
                      onPress={() => addExercise(exercise)}
                      className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3"
                    >
                      <Text className="text-white font-medium">{exercise.name}</Text>
                      <View className={`mt-2 px-2 py-1 rounded-full ${meta.bg}`}>
                        <Text className={`text-xs ${meta.text}`}>{meta.label}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <View className="mt-5 gap-4">
            {workoutExercises.map((entry, index) => {
              const draft = setDrafts[entry.id] ?? emptySetDraft('bilateral');
              const sideOptions: WorkoutSetSide[] = entry.exercise.side_specific
                ? ['left', 'right']
                : ['bilateral'];
              const summary = computeWorkoutSummary([{ sets: entry.sets }]);

              return (
                <View
                  key={entry.id}
                  className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4"
                >
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-white font-semibold">{index + 1}. {entry.exercise.name}</Text>
                      {entry.exercise.side_specific && (
                        <Text className="text-xs text-amber-200 mt-1">Side-specific</Text>
                      )}
                    </View>
                    <Pressable onPress={() => removeExercise(entry.id)} className="p-2">
                      <Ionicons name="trash-outline" size={16} color="#94a3b8" />
                    </Pressable>
                  </View>

                  <View className="flex-row flex-wrap gap-2 mt-3">
                    <Text className="text-xs text-slate-400">Sets: {entry.sets.length}</Text>
                    <Text className="text-xs text-slate-400">Volume: {Math.round(summary.totalVolumeKg)} kg</Text>
                  </View>

                  <View className="mt-4">
                    {entry.exercise.side_specific && (
                      <View className="flex-row gap-2 mb-3">
                        {sideOptions.map((side) => (
                          <Pressable
                            key={side}
                            onPress={() => updateSetDraft(entry.id, { side })}
                            className={`px-3 py-1.5 rounded-full border ${
                              draft.side === side ? 'bg-amber-500/30 border-amber-400' : 'border-slate-700'
                            }`}
                          >
                            <Text className={`text-xs ${draft.side === side ? 'text-white' : 'text-slate-300'}`}>
                              {side}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    <View className="flex-row gap-2 mb-2">
                      <TextInput
                        placeholder="Reps"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={draft.reps}
                        onChangeText={(text) => updateSetDraft(entry.id, { reps: text })}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                      <TextInput
                        placeholder="Weight (kg)"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={draft.weight}
                        onChangeText={(text) => updateSetDraft(entry.id, { weight: text })}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                    </View>

                    <View className="flex-row gap-2 mb-2">
                      <TextInput
                        placeholder="Duration (sec)"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={draft.duration}
                        onChangeText={(text) => updateSetDraft(entry.id, { duration: text })}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                      <TextInput
                        placeholder="RPE"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={draft.rpe}
                        onChangeText={(text) => updateSetDraft(entry.id, { rpe: text })}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                    </View>

                    <TextInput
                      placeholder="Notes"
                      placeholderTextColor="#64748b"
                      value={draft.notes}
                      onChangeText={(text) => updateSetDraft(entry.id, { notes: text })}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />

                    <Pressable
                      onPress={() => addSet(entry)}
                      className="mt-3 bg-teal-500 px-4 py-2.5 rounded-xl items-center"
                    >
                      <Text className="text-white font-medium">Add Set</Text>
                    </Pressable>
                  </View>

                  {entry.sets.length > 0 && (
                    <View className="mt-4 gap-2">
                      {entry.sets.map((set, setIndex) => (
                        <View
                          key={`${entry.id}-${setIndex}`}
                          className="flex-row items-center justify-between bg-slate-900/70 px-3 py-2 rounded-lg"
                        >
                          <Text className="text-slate-200 text-xs">
                            {set.side ? `${set.side} ` : ''}
                            {set.reps ?? 0} reps · {set.weight_kg ?? 0} kg
                            {set.duration_seconds ? ` · ${set.duration_seconds}s` : ''}
                            {set.rpe ? ` · RPE ${set.rpe}` : ''}
                          </Text>
                          <Pressable onPress={() => removeSet(entry.id, setIndex)}>
                            <Ionicons name="close" size={14} color="#94a3b8" />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <View className="mt-6 bg-slate-950/70 rounded-2xl p-4 border border-slate-800/70">
            <Text className="text-white font-semibold">Finish Workout</Text>
            <Text className="text-slate-400 text-xs mt-1">
              Total volume {Math.round(workoutSummary.totalVolumeKg)} kg · {workoutSummary.totalSets} sets
            </Text>

            <View className="flex-row gap-3 mt-3">
              <View className="flex-1">
                <Text className="text-xs text-slate-300 mb-1">Energy after</Text>
                <TextInput
                  keyboardType="numeric"
                  placeholder="7"
                  placeholderTextColor="#64748b"
                  value={energyAfter}
                  onChangeText={setEnergyAfter}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-slate-300 mb-1">Pain after</Text>
                <TextInput
                  keyboardType="numeric"
                  placeholder="2"
                  placeholderTextColor="#64748b"
                  value={painAfter}
                  onChangeText={setPainAfter}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </View>
            </View>

            <Pressable onPress={finishWorkout} className="mt-4 bg-teal-500 px-4 py-2.5 rounded-xl items-center">
              <Text className="text-white font-medium">Complete Workout</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text className="text-lg font-semibold text-white mb-3">Recent Workouts</Text>

      {isLoading ? (
        <LoadingState label="Loading workouts..." />
      ) : workouts.length === 0 ? (
        <View className="bg-slate-900 rounded-2xl p-8 border border-slate-800 border-dashed items-center">
          <Text className="text-slate-300 text-center">No workouts logged yet.</Text>
        </View>
      ) : (
        workouts.map((item) => {
          const summary = computeWorkoutSummary(item.exercises.map((exercise) => ({ sets: exercise.sets })));
          const typeMeta = WORKOUT_TYPES.find((type) => type.value === item.workout.type);
          return (
            <View key={item.workout.id} className="bg-slate-900 rounded-2xl p-4 border border-slate-800 mb-3">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-white font-medium">
                  {format(new Date(item.workout.date), 'MMMM d, yyyy')}
                </Text>
                <View className={`px-2.5 py-1 rounded-full ${typeMeta?.tone ?? 'bg-slate-500/20 text-slate-200'}`}>
                  <Text className="text-xs">{typeMeta?.label ?? item.workout.type}</Text>
                </View>
              </View>
              <Text className="text-slate-400 text-xs">
                {item.workout.duration_minutes ?? 0} min · {summary.totalSets} sets · {Math.round(summary.totalVolumeKg)} kg
              </Text>
              {summary.leftVolumeKg + summary.rightVolumeKg > 0 && (
                <Text className="text-slate-400 text-xs mt-1">
                  L/R {summary.leftVolumeKg} / {summary.rightVolumeKg} kg
                </Text>
              )}
              {item.workout.notes && (
                <Text className="text-slate-300 text-sm mt-2">{item.workout.notes}</Text>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
