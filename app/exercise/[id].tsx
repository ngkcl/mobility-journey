import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getSupabase } from '../../lib/supabase';
import { normalizeTargetMuscles } from '../../lib/exercises';
import { useToast } from '../../components/Toast';
import type { Exercise, ExerciseCategory } from '../../lib/types';

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  corrective: 'Corrective',
  stretching: 'Stretching',
  strengthening: 'Strength',
  warmup: 'Warmup',
  cooldown: 'Cooldown',
  gym_compound: 'Gym: Compound',
  gym_isolation: 'Gym: Isolation',
  cardio: 'Cardio',
  mobility: 'Mobility',
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

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { pushToast } = useToast();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadExercise = async () => {
    if (!id) return;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      pushToast('Failed to load exercise.', 'error');
      setIsLoading(false);
      return;
    }

    setExercise({
      id: data.id,
      name: data.name,
      category: (data.category ?? 'corrective') as ExerciseCategory,
      target_muscles: data.target_muscles ?? null,
      description: data.description ?? null,
      instructions: data.instructions ?? null,
      sets_default: data.sets_default ?? null,
      reps_default: data.reps_default ?? null,
      duration_seconds_default: data.duration_seconds_default ?? null,
      side_specific: data.side_specific ?? false,
      video_url: data.video_url ?? null,
      image_url: data.image_url ?? null,
    });
    setIsLoading(false);
  };

  useEffect(() => {
    loadExercise();
  }, [id]);

  const targets = useMemo(
    () => normalizeTargetMuscles(exercise?.target_muscles ?? null),
    [exercise],
  );

  const emphasis = useMemo(() => {
    const lower = targets.map((target) => target.toLowerCase());
    if (lower.some((target) => target.includes('left'))) return 'Left';
    if (lower.some((target) => target.includes('right'))) return 'Right';
    return null;
  }, [targets]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0b1020]">
        <ActivityIndicator size="large" color="#5eead4" />
        <Text className="text-slate-300 mt-3">Loading exercise...</Text>
      </View>
    );
  }

  if (!exercise) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0b1020] px-6">
        <Text className="text-slate-200 text-lg font-semibold">Exercise not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 px-4 py-2 rounded-lg bg-slate-800">
          <Text className="text-slate-200">Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#0b1020]" contentContainerStyle={{ paddingBottom: 28 }}>
      <View className="px-4 pt-4">
        <View className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800">
          {exercise.image_url ? (
            <Image
              source={{ uri: exercise.image_url }}
              style={{ width: '100%', height: 220, backgroundColor: '#0f172a' }}
              resizeMode="cover"
            />
          ) : (
            <View className="h-[220px] items-center justify-center bg-slate-800">
              <Ionicons name="barbell-outline" size={44} color="#64748b" />
              <Text className="text-slate-400 mt-2">No image available</Text>
            </View>
          )}
        </View>
      </View>

      <View className="px-4 mt-4 gap-4">
        <View className="gap-2">
          <Text className="text-white text-2xl font-semibold">{exercise.name}</Text>
          <View className="flex-row flex-wrap items-center gap-2">
            <View className="px-3 py-1 rounded-full bg-teal-500/20">
              <Text className="text-xs text-teal-200">{CATEGORY_LABELS[exercise.category]}</Text>
            </View>
            {exercise.side_specific && (
              <View className="px-3 py-1 rounded-full bg-amber-500/20">
                <Text className="text-xs text-amber-200">
                  Side-specific{emphasis ? `: ${emphasis}` : ''}
                </Text>
              </View>
            )}
            <View className="px-3 py-1 rounded-full border border-slate-700">
              <Text className="text-xs text-slate-300">{formatDefaults(exercise)}</Text>
            </View>
          </View>
        </View>

        {targets.length > 0 && (
          <View className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <Text className="text-slate-300 text-xs uppercase">Target muscles</Text>
            <Text className="text-white mt-1">{targets.join(', ')}</Text>
          </View>
        )}

        {exercise.description && (
          <View className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <Text className="text-slate-300 text-xs uppercase">Overview</Text>
            <Text className="text-slate-200 mt-1">{exercise.description}</Text>
          </View>
        )}

        {exercise.instructions && (
          <View className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <Text className="text-slate-300 text-xs uppercase">Instructions</Text>
            <Text className="text-slate-200 mt-1">{exercise.instructions}</Text>
          </View>
        )}

        {exercise.video_url && (
          <Pressable
            onPress={() => Linking.openURL(exercise.video_url ?? '')}
            className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex-row items-center justify-between"
          >
            <View>
              <Text className="text-slate-300 text-xs uppercase">Video</Text>
              <Text className="text-slate-200 mt-1">Open reference video</Text>
            </View>
            <Ionicons name="open-outline" size={18} color="#5eead4" />
          </Pressable>
        )}

        {exercise.image_url && (
          <View className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <Text className="text-slate-300 text-xs uppercase">Image</Text>
            <Text className="text-slate-200 mt-1">Reference image loaded above.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
