import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getSupabase } from '../../lib/supabase';
import LoadingState from '../../components/LoadingState';
import { useToast } from '../../components/Toast';
import { normalizeTargetMuscles } from '../../lib/exercises';
import { colors } from '@/lib/theme';
import type { Exercise, ExerciseCategory } from '../../lib/types';

type ExerciseFormState = {
  name: string;
  category: ExerciseCategory;
  targetMuscles: string;
  description: string;
  instructions: string;
  setsDefault: string;
  repsDefault: string;
  durationDefault: string;
  sideSpecific: boolean;
  videoUrl: string;
  imageUrl: string;
};

const CATEGORIES: ExerciseCategory[] = [
  'corrective',
  'stretching',
  'strengthening',
  'warmup',
  'cooldown',
  'gym_compound',
  'gym_isolation',
  'cardio',
  'mobility',
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

const emptyForm = (): ExerciseFormState => ({
  name: '',
  category: 'corrective',
  targetMuscles: '',
  description: '',
  instructions: '',
  setsDefault: '',
  repsDefault: '',
  durationDefault: '',
  sideSpecific: false,
  videoUrl: '',
  imageUrl: '',
});

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDefaults = (exercise: Exercise) => {
  const parts: string[] = [];
  if (exercise.sets_default) parts.push(`${exercise.sets_default} sets`);
  if (exercise.reps_default) parts.push(`${exercise.reps_default} reps`);
  if (exercise.duration_seconds_default) {
    const minutes = Math.round(exercise.duration_seconds_default / 60);
    parts.push(`${minutes} min`);
  }
  return parts.length ? parts.join(' · ') : 'Custom volume';
};

export default function ExercisesScreen() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExerciseCategory>('all');
  const [targetFilter, setTargetFilter] = useState<'all' | string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newExercise, setNewExercise] = useState<ExerciseFormState>(emptyForm());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { pushToast } = useToast();
  const router = useRouter();

  const normalizeExercise = (row: any): Exercise => ({
    id: row.id,
    name: row.name,
    category: (row.category ?? 'corrective') as ExerciseCategory,
    target_muscles: row.target_muscles ?? null,
    description: row.description ?? null,
    instructions: row.instructions ?? null,
    sets_default: row.sets_default ?? null,
    reps_default: row.reps_default ?? null,
    duration_seconds_default: row.duration_seconds_default ?? null,
    side_specific: row.side_specific ?? false,
    video_url: row.video_url ?? null,
    image_url: row.image_url ?? null,
  });

  const loadExercises = async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      pushToast('Failed to load exercises.', 'error');
      setIsLoading(false);
      return;
    }

    setExercises((data ?? []).map((row) => normalizeExercise(row)));
    setIsLoading(false);
  };

  useEffect(() => {
    loadExercises();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadExercises();
    setRefreshing(false);
  };

  const targetOptions = useMemo(() => {
    const targetMap = new Map<string, string>();
    exercises.forEach((exercise) => {
      normalizeTargetMuscles(exercise.target_muscles).forEach((target) => {
        const key = target.toLowerCase();
        if (!targetMap.has(key)) targetMap.set(key, target);
      });
    });
    return Array.from(targetMap.values()).sort((a, b) => a.localeCompare(b));
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return exercises.filter((exercise) => {
      if (categoryFilter !== 'all' && exercise.category !== categoryFilter) return false;
      if (targetFilter !== 'all') {
        const targets = normalizeTargetMuscles(exercise.target_muscles).map((target) =>
          target.toLowerCase(),
        );
        if (!targets.includes(targetFilter)) return false;
      }
      if (!query) return true;
      const targets = normalizeTargetMuscles(exercise.target_muscles)
        .map((target) => target.toLowerCase())
        .join(' ');
      const haystack = `${exercise.name} ${exercise.description ?? ''} ${targets}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [exercises, categoryFilter, targetFilter, searchQuery]);

  const addExercise = async () => {
    if (!newExercise.name.trim()) {
      pushToast('Exercise name is required.', 'error');
      return;
    }

    const targets = normalizeTargetMuscles(newExercise.targetMuscles);
    const payload = {
      name: newExercise.name.trim(),
      category: newExercise.category,
      target_muscles: targets.length ? targets : null,
      description: newExercise.description.trim() || null,
      instructions: newExercise.instructions.trim() || null,
      sets_default: parseNumber(newExercise.setsDefault),
      reps_default: parseNumber(newExercise.repsDefault),
      duration_seconds_default: parseNumber(newExercise.durationDefault),
      side_specific: newExercise.sideSpecific,
      video_url: newExercise.videoUrl.trim() || null,
      image_url: newExercise.imageUrl.trim() || null,
    };

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('exercises')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      pushToast('Failed to save exercise.', 'error');
      return;
    }

    setExercises((prev) => [normalizeExercise(data), ...prev]);
    setNewExercise(emptyForm());
    setShowAddForm(false);
    pushToast('Exercise added.', 'success');
  };

  return (
    <ScrollView
      className="flex-1 bg-[#0b1020]"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealLight} />
      }
    >
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-semibold text-white">Exercise Library</Text>
          <Text className="text-slate-400 text-sm">
            Corrective, mobility, and gym movements
          </Text>
        </View>
        <Pressable
          onPress={() => setShowAddForm(true)}
          className="bg-teal-500 px-4 py-2 rounded-xl flex-row items-center gap-2"
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text className="text-white font-medium text-sm">Add Exercise</Text>
        </Pressable>
      </View>

      <View className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 mb-6">
        <Text className="text-white text-lg font-semibold">Search & Filters</Text>
        <TextInput
          placeholder="Search by name, target muscle, or notes"
          placeholderTextColor="#94a3b8"
          className="bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white mt-3"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4">
          <View className="flex-row gap-2">
            {(['all', ...CATEGORIES] as const).map((category) => (
              <Pressable
                key={category}
                onPress={() => setCategoryFilter(category)}
                className={`px-3 py-2 rounded-full border ${
                  categoryFilter === category ? 'bg-teal-500 border-teal-400' : 'border-slate-700'
                }`}
              >
                <Text
                  className={`text-xs capitalize ${
                    categoryFilter === category ? 'text-white' : 'text-slate-300'
                  }`}
                >
                  {category}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {targetOptions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
            <View className="flex-row gap-2">
              {(['all', ...targetOptions] as const).map((target) => {
                const value = target === 'all' ? 'all' : target.toLowerCase();
                const isActive = targetFilter === value;
                return (
                  <Pressable
                    key={target}
                    onPress={() => setTargetFilter(value)}
                    className={`px-3 py-2 rounded-full border ${
                      isActive ? 'bg-slate-700 border-slate-500' : 'border-slate-700'
                    }`}
                  >
                    <Text className={`text-xs ${isActive ? 'text-white' : 'text-slate-300'}`}>
                      {target}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {showAddForm && (
        <View className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800/70 mb-6">
          <Text className="text-lg font-semibold text-white mb-4">Add Custom Exercise</Text>

          <TextInput
            placeholder="Exercise name"
            placeholderTextColor="#94a3b8"
            className="bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white mb-3"
            value={newExercise.name}
            onChangeText={(text) => setNewExercise((prev) => ({ ...prev, name: text }))}
          />

          <Text className="text-slate-300 text-sm mb-2">Category</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {CATEGORIES.map((category) => (
              <Pressable
                key={category}
                onPress={() => setNewExercise((prev) => ({ ...prev, category }))}
                className={`px-3 py-2 rounded-lg border ${
                  newExercise.category === category
                    ? 'bg-teal-500 border-teal-400'
                    : 'border-slate-700'
                }`}
              >
                <Text
                  className={`${newExercise.category === category ? 'text-white' : 'text-slate-300'} capitalize`}
                >
                  {category}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            placeholder="Target muscles (comma separated)"
            placeholderTextColor="#94a3b8"
            className="bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white mb-3"
            value={newExercise.targetMuscles}
            onChangeText={(text) => setNewExercise((prev) => ({ ...prev, targetMuscles: text }))}
          />

          <TextInput
            placeholder="Description"
            placeholderTextColor="#94a3b8"
            className="bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white mb-3"
            value={newExercise.description}
            onChangeText={(text) => setNewExercise((prev) => ({ ...prev, description: text }))}
            multiline
          />

          <TextInput
            placeholder="Instructions"
            placeholderTextColor="#94a3b8"
            className="bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white mb-3"
            value={newExercise.instructions}
            onChangeText={(text) => setNewExercise((prev) => ({ ...prev, instructions: text }))}
            multiline
          />

          <View className="flex-row gap-2 mb-3">
            <TextInput
              placeholder="Sets"
              placeholderTextColor="#94a3b8"
              className="flex-1 bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white"
              value={newExercise.setsDefault}
              onChangeText={(text) => setNewExercise((prev) => ({ ...prev, setsDefault: text }))}
              keyboardType="number-pad"
            />
            <TextInput
              placeholder="Reps"
              placeholderTextColor="#94a3b8"
              className="flex-1 bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white"
              value={newExercise.repsDefault}
              onChangeText={(text) => setNewExercise((prev) => ({ ...prev, repsDefault: text }))}
              keyboardType="number-pad"
            />
            <TextInput
              placeholder="Duration (sec)"
              placeholderTextColor="#94a3b8"
              className="flex-1 bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white"
              value={newExercise.durationDefault}
              onChangeText={(text) =>
                setNewExercise((prev) => ({ ...prev, durationDefault: text }))
              }
              keyboardType="number-pad"
            />
          </View>

          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-white font-medium">Side-specific</Text>
              <Text className="text-slate-400 text-xs">Use for left/right emphasis</Text>
            </View>
            <Switch
              value={newExercise.sideSpecific}
              onValueChange={(value) => setNewExercise((prev) => ({ ...prev, sideSpecific: value }))}
              thumbColor={newExercise.sideSpecific ? '#5eead4' : '#94a3b8'}
              trackColor={{ false: '#334155', true: '#14b8a6' }}
            />
          </View>

          <TextInput
            placeholder="Video URL (optional)"
            placeholderTextColor="#94a3b8"
            className="bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white mb-3"
            value={newExercise.videoUrl}
            onChangeText={(text) => setNewExercise((prev) => ({ ...prev, videoUrl: text }))}
          />

          <TextInput
            placeholder="Image URL (optional)"
            placeholderTextColor="#94a3b8"
            className="bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white mb-4"
            value={newExercise.imageUrl}
            onChangeText={(text) => setNewExercise((prev) => ({ ...prev, imageUrl: text }))}
          />

          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-xl border border-slate-700"
            >
              <Text className="text-slate-300">Cancel</Text>
            </Pressable>
            <Pressable onPress={addExercise} className="px-4 py-2 rounded-xl bg-teal-500">
              <Text className="text-white font-medium">Save Exercise</Text>
            </Pressable>
          </View>
        </View>
      )}

      {isLoading ? (
        <LoadingState label="Loading exercises..." />
      ) : filteredExercises.length === 0 ? (
        <View className="bg-slate-900/70 rounded-2xl p-6 border border-slate-800/70 items-center">
          <Text className="text-white font-semibold mb-2">No exercises yet</Text>
          <Text className="text-slate-400 text-center">
            Add your first custom exercise or adjust filters.
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          {filteredExercises.map((exercise) => {
            const meta = CATEGORY_META[exercise.category];
            const targets = normalizeTargetMuscles(exercise.target_muscles);
            return (
              <Pressable
                key={exercise.id}
                onPress={() =>
                  router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })
                }
                className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <Text className="text-lg font-semibold text-white">{exercise.name}</Text>
                    {exercise.description ? (
                      <Text className="text-slate-400 text-sm mt-1">{exercise.description}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#64748b" />
                </View>

                <View className="flex-row flex-wrap items-center gap-2 mt-3">
                  <View className={`px-2.5 py-1 rounded-full ${meta.bg}`}>
                    <Text className={`text-xs ${meta.text}`}>{meta.label}</Text>
                  </View>
                  {exercise.side_specific && (
                    <View className="px-2.5 py-1 rounded-full border border-amber-400/40 bg-amber-500/10">
                      <Text className="text-xs text-amber-200">Side-specific</Text>
                    </View>
                  )}
                  <View className="px-2.5 py-1 rounded-full border border-slate-700">
                    <Text className="text-xs text-slate-300">{formatDefaults(exercise)}</Text>
                  </View>
                </View>

                {targets.length > 0 && (
                  <Text className="text-slate-400 text-xs mt-3">
                    Targets: {targets.join(', ')}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
