import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  Switch,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getSupabase } from '../../lib/supabase';
import LoadingState from '../../components/LoadingState';
import { useToast } from '../../components/Toast';
import { normalizeTargetMuscles } from '../../lib/exercises';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';
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
  'corrective', 'stretching', 'strengthening', 'warmup', 'cooldown',
  'gym_compound', 'gym_isolation', 'cardio', 'mobility',
];

const CATEGORY_COLORS: Record<ExerciseCategory, { bg: string; text: string; label: string }> = {
  corrective: { bg: colors.corrective.bg, text: colors.corrective.text, label: 'Corrective' },
  stretching: { bg: colors.stretching.bg, text: colors.stretching.text, label: 'Stretching' },
  strengthening: { bg: colors.strengthening.bg, text: colors.strengthening.text, label: 'Strength' },
  warmup: { bg: colors.warmup.bg, text: colors.warmup.text, label: 'Warmup' },
  cooldown: { bg: colors.cooldown.bg, text: colors.cooldown.text, label: 'Cooldown' },
  gym_compound: { bg: colors.gym_compound.bg, text: colors.gym_compound.text, label: 'Gym: Compound' },
  gym_isolation: { bg: colors.gym_isolation.bg, text: colors.gym_isolation.text, label: 'Gym: Isolation' },
  cardio: { bg: colors.cardio.bg, text: colors.cardio.text, label: 'Cardio' },
  mobility: { bg: colors.mobility.bg, text: colors.mobility.text, label: 'Mobility' },
};

const emptyForm = (): ExerciseFormState => ({
  name: '', category: 'corrective', targetMuscles: '', description: '', instructions: '',
  setsDefault: '', repsDefault: '', durationDefault: '', sideSpecific: false, videoUrl: '', imageUrl: '',
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
    id: row.id, name: row.name, category: (row.category ?? 'corrective') as ExerciseCategory,
    target_muscles: row.target_muscles ?? null, description: row.description ?? null,
    instructions: row.instructions ?? null, sets_default: row.sets_default ?? null,
    reps_default: row.reps_default ?? null, duration_seconds_default: row.duration_seconds_default ?? null,
    side_specific: row.side_specific ?? false, video_url: row.video_url ?? null, image_url: row.image_url ?? null,
  });

  const loadExercises = async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('exercises').select('*').order('name', { ascending: true });
    if (error) { pushToast('Failed to load exercises.', 'error'); setIsLoading(false); return; }
    setExercises((data ?? []).map((row) => normalizeExercise(row)));
    setIsLoading(false);
  };

  useEffect(() => { loadExercises(); }, []);

  const onRefresh = async () => { setRefreshing(true); await loadExercises(); setRefreshing(false); };

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
        const targets = normalizeTargetMuscles(exercise.target_muscles).map((t) => t.toLowerCase());
        if (!targets.includes(targetFilter)) return false;
      }
      if (!query) return true;
      const targets = normalizeTargetMuscles(exercise.target_muscles).map((t) => t.toLowerCase()).join(' ');
      return `${exercise.name} ${exercise.description ?? ''} ${targets}`.toLowerCase().includes(query);
    });
  }, [exercises, categoryFilter, targetFilter, searchQuery]);

  const addExercise = async () => {
    if (!newExercise.name.trim()) { pushToast('Exercise name is required.', 'error'); return; }
    const targets = normalizeTargetMuscles(newExercise.targetMuscles);
    const payload = {
      name: newExercise.name.trim(), category: newExercise.category,
      target_muscles: targets.length ? targets : null, description: newExercise.description.trim() || null,
      instructions: newExercise.instructions.trim() || null, sets_default: parseNumber(newExercise.setsDefault),
      reps_default: parseNumber(newExercise.repsDefault), duration_seconds_default: parseNumber(newExercise.durationDefault),
      side_specific: newExercise.sideSpecific, video_url: newExercise.videoUrl.trim() || null, image_url: newExercise.imageUrl.trim() || null,
    };
    const supabase = getSupabase();
    const { data, error } = await supabase.from('exercises').insert(payload).select('*').single();
    if (error || !data) { pushToast('Failed to save exercise.', 'error'); return; }
    setExercises((prev) => [normalizeExercise(data), ...prev]);
    setNewExercise(emptyForm());
    setShowAddForm(false);
    pushToast('Exercise added.', 'success');
  };

  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealLight} />}
    >
      {/* Header */}
      <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
        <View>
          <Text style={shared.pageTitle}>Exercise Library</Text>
          <Text style={shared.pageSubtitle}>Corrective, mobility, and gym movements</Text>
        </View>
        <Pressable onPress={() => setShowAddForm(true)} style={[shared.btnPrimary, shared.btnSmall]}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ ...typography.captionMedium, color: '#fff' }}>Add Exercise</Text>
        </Pressable>
      </View>

      {/* Search & Filters */}
      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <Text style={{ ...typography.h3, color: colors.textPrimary }}>Search & Filters</Text>
        <TextInput placeholder="Search by name, target muscle, or notes" placeholderTextColor={colors.textTertiary} style={[shared.input, { marginTop: spacing.md }]} value={searchQuery} onChangeText={setSearchQuery} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.lg }}>
          <View style={[shared.row, { gap: spacing.sm }]}>
            {(['all', ...CATEGORIES] as const).map((category) => {
              const active = categoryFilter === category;
              return (
                <Pressable key={category} onPress={() => setCategoryFilter(category)} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.full, borderWidth: 1, backgroundColor: active ? colors.teal : 'transparent', borderColor: active ? colors.teal : colors.border }}>
                  <Text style={{ ...typography.small, color: active ? '#fff' : colors.textSecondary, textTransform: 'capitalize' }}>{category}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {targetOptions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.md }}>
            <View style={[shared.row, { gap: spacing.sm }]}>
              {(['all', ...targetOptions] as const).map((target) => {
                const value = target === 'all' ? 'all' : target.toLowerCase();
                const active = targetFilter === value;
                return (
                  <Pressable key={target} onPress={() => setTargetFilter(value)} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.full, borderWidth: 1, backgroundColor: active ? colors.bgCard : 'transparent', borderColor: active ? colors.textMuted : colors.border }}>
                    <Text style={{ ...typography.small, color: active ? colors.textPrimary : colors.textSecondary }}>{target}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Add form */}
      {showAddForm && (
        <View style={[shared.card, { marginBottom: spacing.lg }]}>
          <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg }}>Add Custom Exercise</Text>

          <TextInput placeholder="Exercise name" placeholderTextColor={colors.textTertiary} style={[shared.input, { marginBottom: spacing.md }]} value={newExercise.name} onChangeText={(text) => setNewExercise((prev) => ({ ...prev, name: text }))} />

          <Text style={[shared.inputLabel, { marginBottom: spacing.sm }]}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
            {CATEGORIES.map((category) => {
              const active = newExercise.category === category;
              return (
                <Pressable key={category} onPress={() => setNewExercise((prev) => ({ ...prev, category }))} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, backgroundColor: active ? colors.teal : 'transparent', borderColor: active ? colors.teal : colors.border }}>
                  <Text style={{ ...typography.caption, color: active ? '#fff' : colors.textSecondary, textTransform: 'capitalize' }}>{category}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput placeholder="Target muscles (comma separated)" placeholderTextColor={colors.textTertiary} style={[shared.input, { marginBottom: spacing.md }]} value={newExercise.targetMuscles} onChangeText={(text) => setNewExercise((prev) => ({ ...prev, targetMuscles: text }))} />
          <TextInput placeholder="Description" placeholderTextColor={colors.textTertiary} style={[shared.input, { marginBottom: spacing.md }]} value={newExercise.description} onChangeText={(text) => setNewExercise((prev) => ({ ...prev, description: text }))} multiline />
          <TextInput placeholder="Instructions" placeholderTextColor={colors.textTertiary} style={[shared.input, { marginBottom: spacing.md }]} value={newExercise.instructions} onChangeText={(text) => setNewExercise((prev) => ({ ...prev, instructions: text }))} multiline />

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
            <TextInput placeholder="Sets" placeholderTextColor={colors.textTertiary} style={[shared.input, { flex: 1 }]} value={newExercise.setsDefault} onChangeText={(text) => setNewExercise((prev) => ({ ...prev, setsDefault: text }))} keyboardType="number-pad" />
            <TextInput placeholder="Reps" placeholderTextColor={colors.textTertiary} style={[shared.input, { flex: 1 }]} value={newExercise.repsDefault} onChangeText={(text) => setNewExercise((prev) => ({ ...prev, repsDefault: text }))} keyboardType="number-pad" />
            <TextInput placeholder="Duration (sec)" placeholderTextColor={colors.textTertiary} style={[shared.input, { flex: 1 }]} value={newExercise.durationDefault} onChangeText={(text) => setNewExercise((prev) => ({ ...prev, durationDefault: text }))} keyboardType="number-pad" />
          </View>

          <View style={[shared.rowBetween, { marginBottom: spacing.md }]}>
            <View>
              <Text style={{ ...typography.bodyMedium, color: colors.textPrimary }}>Side-specific</Text>
              <Text style={{ ...typography.caption, color: colors.textTertiary }}>Use for left/right emphasis</Text>
            </View>
            <Switch value={newExercise.sideSpecific} onValueChange={(value) => setNewExercise((prev) => ({ ...prev, sideSpecific: value }))} thumbColor={newExercise.sideSpecific ? colors.tealLight : colors.textTertiary} trackColor={{ false: '#334155', true: colors.teal }} />
          </View>

          <TextInput placeholder="Video URL (optional)" placeholderTextColor={colors.textTertiary} style={[shared.input, { marginBottom: spacing.md }]} value={newExercise.videoUrl} onChangeText={(text) => setNewExercise((prev) => ({ ...prev, videoUrl: text }))} />
          <TextInput placeholder="Image URL (optional)" placeholderTextColor={colors.textTertiary} style={[shared.input, { marginBottom: spacing.lg }]} value={newExercise.imageUrl} onChangeText={(text) => setNewExercise((prev) => ({ ...prev, imageUrl: text }))} />

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md }}>
            <Pressable onPress={() => setShowAddForm(false)} style={shared.btnSecondary}>
              <Text style={shared.btnSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={addExercise} style={shared.btnPrimary}>
              <Text style={shared.btnPrimaryText}>Save Exercise</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Exercise list */}
      {isLoading ? (
        <LoadingState label="Loading exercises..." />
      ) : filteredExercises.length === 0 ? (
        <View style={[shared.card, { borderStyle: 'dashed', alignItems: 'center', paddingVertical: spacing['3xl'] }]}>
          <Ionicons name="barbell-outline" size={40} color={colors.textMuted} />
          <Text style={shared.emptyStateTitle}>No exercises yet</Text>
          <Text style={shared.emptyStateText}>Add your first custom exercise or adjust filters.</Text>
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {filteredExercises.map((exercise) => {
            const meta = CATEGORY_COLORS[exercise.category];
            const targets = normalizeTargetMuscles(exercise.target_muscles);
            return (
              <Pressable key={exercise.id} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })} style={shared.card}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...typography.h3, color: colors.textPrimary }}>{exercise.name}</Text>
                    {exercise.description ? <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs }}>{exercise.description}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
                  <View style={[shared.badge, { backgroundColor: meta.bg }]}>
                    <Text style={{ ...typography.small, color: meta.text }}>{meta.label}</Text>
                  </View>
                  {exercise.side_specific && (
                    <View style={[shared.badge, { backgroundColor: colors.warningDim, borderWidth: 1, borderColor: colors.warningDim }]}>
                      <Text style={{ ...typography.small, color: '#fcd34d' }}>Side-specific</Text>
                    </View>
                  )}
                  <View style={[shared.badge, { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border }]}>
                    <Text style={{ ...typography.small, color: colors.textSecondary }}>{formatDefaults(exercise)}</Text>
                  </View>
                </View>

                {targets.length > 0 && (
                  <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: spacing.md }}>Targets: {targets.join(', ')}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
});
