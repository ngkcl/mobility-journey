import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { getSupabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import LoadingState from '../../components/LoadingState';
import { computeWorkoutSummary } from '../../lib/workouts';
import { buildTemplateSet, getTemplateSetCount } from '../../lib/templates';
import { buildWorkoutCSV, buildWorkoutExportPayload } from '../../lib/exportData';
import { colors, typography, spacing, radii, shared, getSideColor } from '@/lib/theme';
import type {
  Exercise,
  ExerciseCategory,
  Workout,
  WorkoutExercise,
  WorkoutSet,
  WorkoutSetSide,
  WorkoutTemplate,
  WorkoutTemplateExercise,
  WorkoutType,
} from '../../lib/types';

const WORKOUT_TYPES: { value: WorkoutType; label: string; bg: string; text: string }[] = [
  { value: 'corrective', label: 'Corrective', bg: colors.corrective.bg, text: colors.corrective.text },
  { value: 'gym', label: 'Gym', bg: colors.gym_compound.bg, text: colors.gym_compound.text },
  { value: 'cardio', label: 'Cardio', bg: colors.cardio.bg, text: colors.cardio.text },
  { value: 'other', label: 'Other', bg: colors.cooldown.bg, text: colors.cooldown.text },
];

const CATEGORY_META: Record<ExerciseCategory, { label: string; bg: string; text: string }> = {
  corrective: { label: 'Corrective', bg: colors.corrective.bg, text: colors.corrective.text },
  stretching: { label: 'Stretching', bg: colors.stretching.bg, text: colors.stretching.text },
  strengthening: { label: 'Strength', bg: colors.strengthening.bg, text: colors.strengthening.text },
  warmup: { label: 'Warmup', bg: colors.warmup.bg, text: colors.warmup.text },
  cooldown: { label: 'Cooldown', bg: colors.cooldown.bg, text: colors.cooldown.text },
  gym_compound: { label: 'Gym: Compound', bg: colors.gym_compound.bg, text: colors.gym_compound.text },
  gym_isolation: { label: 'Gym: Isolation', bg: colors.gym_isolation.bg, text: colors.gym_isolation.text },
  cardio: { label: 'Cardio', bg: colors.cardio.bg, text: colors.cardio.text },
  mobility: { label: 'Mobility', bg: colors.mobility.bg, text: colors.mobility.text },
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

type TemplateExerciseDraft = WorkoutTemplateExercise & {
  exercise: Exercise | null;
};

type TemplateDraft = Omit<WorkoutTemplate, 'exercises'> & {
  exercises: TemplateExerciseDraft[];
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

const parseDateInput = (value: string): Date | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const buildWorkoutExercisePayload = (exercise: WorkoutExerciseDraft, index: number) => ({
  exercise_id: exercise.exercise.id,
  order_index: index,
  sets: exercise.sets,
});

export default function WorkoutsScreen() {
  const router = useRouter();
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
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templatePickerQuery, setTemplatePickerQuery] = useState('');
  const [templateReplaceIndex, setTemplateReplaceIndex] = useState<number | null>(null);
  const [guidedTemplate, setGuidedTemplate] = useState<WorkoutTemplate | null>(null);
  const [guidedExerciseIndex, setGuidedExerciseIndex] = useState(0);
  const [guidedSetIndex, setGuidedSetIndex] = useState(0);
  const [guidedRemaining, setGuidedRemaining] = useState<number | null>(null);
  const [guidedStartedAt, setGuidedStartedAt] = useState<Date | null>(null);
  const [guidedSets, setGuidedSets] = useState<Record<string, WorkoutSet[]>>({});
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | WorkoutType>('all');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const { pushToast } = useToast();

  const exerciseById = useMemo(() => {
    return new Map(exercises.map((exercise) => [exercise.id, exercise]));
  }, [exercises]);

  const filteredTemplateExercises = useMemo(() => {
    const query = templatePickerQuery.trim().toLowerCase();
    if (!query) return exercises;
    return exercises.filter((exercise) =>
      `${exercise.name} ${exercise.description ?? ''}`.toLowerCase().includes(query),
    );
  }, [exercises, templatePickerQuery]);

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
      .limit(60);

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

  const filteredHistory = useMemo(() => {
    const query = historySearchQuery.trim().toLowerCase();
    const start = parseDateInput(historyStartDate);
    const end = parseDateInput(historyEndDate);

    return workouts.filter((item) => {
      if (historyTypeFilter !== 'all' && item.workout.type !== historyTypeFilter) {
        return false;
      }
      if (start) {
        const date = new Date(item.workout.date);
        if (date < start) return false;
      }
      if (end) {
        const date = new Date(item.workout.date);
        if (date > end) return false;
      }
      if (!query) return true;
      const exerciseNames = item.exercises
        .map((exercise) => exerciseById.get(exercise.exercise_id ?? '')?.name ?? '')
        .join(' ');
      const haystack = `${item.workout.notes ?? ''} ${exerciseNames}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [exerciseById, historyEndDate, historySearchQuery, historyStartDate, historyTypeFilter, workouts]);

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

  const normalizeTemplate = (template: WorkoutTemplate): WorkoutTemplate => {
    const exercisesList = Array.isArray(template.exercises) ? template.exercises : [];
    const sorted = [...exercisesList].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return { ...template, exercises: sorted };
  };

  const loadTemplates = async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('workout_templates')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      pushToast('Failed to load templates.', 'error');
      return;
    }

    const normalized = (data ?? []).map((row: WorkoutTemplate) => normalizeTemplate(row));
    setTemplates(normalized);
  };

  const loadAll = async () => {
    await Promise.all([loadExercises(), loadWorkouts(), loadRecentExercises(), loadTemplates()]);
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

  const handleExport = useCallback(async () => {
    if (isExporting || filteredHistory.length === 0) return;
    setIsExporting(true);
    
    try {
      const timestamp = format(new Date(), 'yyyy-MM-dd-HHmm');
      
      if (exportFormat === 'csv') {
        const csv = buildWorkoutCSV(filteredHistory, exerciseById);
        const fileName = `workouts-${timestamp}.csv`;
        
        if (Platform.OS === 'web') {
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          pushToast('CSV exported!', 'success');
        } else {
          const fileUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(fileUri, csv, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'text/csv',
              dialogTitle: 'Export Workout Data',
              UTI: 'public.comma-separated-values-text',
            });
            pushToast('CSV ready to share.', 'success');
          } else {
            pushToast('Sharing unavailable on this device.', 'error');
          }
        }
      } else {
        const payload = buildWorkoutExportPayload(filteredHistory, exerciseById);
        const json = JSON.stringify(payload, null, 2);
        const fileName = `workouts-${timestamp}.json`;
        
        if (Platform.OS === 'web') {
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          pushToast('JSON exported!', 'success');
        } else {
          const fileUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(fileUri, json, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'application/json',
              dialogTitle: 'Export Workout Data',
              UTI: 'public.json',
            });
            pushToast('JSON ready to share.', 'success');
          } else {
            pushToast('Sharing unavailable on this device.', 'error');
          }
        }
      }
    } catch (error) {
      pushToast('Export failed. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, filteredHistory, exerciseById, exportFormat, pushToast]);

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

  const startTemplateEdit = (template: WorkoutTemplate) => {
    if (activeWorkout || guidedTemplate) {
      pushToast('Finish the current session first.', 'info');
      return;
    }

    const draftExercises: TemplateExerciseDraft[] = template.exercises.map((exercise, index) => ({
      ...exercise,
      order: index + 1,
      exercise: exerciseById.get(exercise.exercise_id) ?? null,
    }));

    setTemplateDraft({ ...template, exercises: draftExercises });
    setShowTemplateEditor(true);
    setTemplatePickerOpen(false);
    setTemplateReplaceIndex(null);
    setTemplatePickerQuery('');
  };

  const closeTemplateEditor = () => {
    setShowTemplateEditor(false);
    setTemplateDraft(null);
    setTemplatePickerOpen(false);
    setTemplateReplaceIndex(null);
    setTemplatePickerQuery('');
  };

  const updateTemplateExercise = (index: number, patch: Partial<TemplateExerciseDraft>) => {
    setTemplateDraft((prev) => {
      if (!prev) return prev;
      const nextExercises = [...prev.exercises];
      nextExercises[index] = { ...nextExercises[index], ...patch };
      return { ...prev, exercises: nextExercises };
    });
  };

  const moveTemplateExercise = (index: number, direction: -1 | 1) => {
    setTemplateDraft((prev) => {
      if (!prev) return prev;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.exercises.length) return prev;
      const nextExercises = [...prev.exercises];
      const [moved] = nextExercises.splice(index, 1);
      nextExercises.splice(targetIndex, 0, moved);
      const reordered = nextExercises.map((exercise, idx) => ({ ...exercise, order: idx + 1 }));
      return { ...prev, exercises: reordered };
    });
  };

  const removeTemplateExercise = (index: number) => {
    setTemplateDraft((prev) => {
      if (!prev) return prev;
      const nextExercises = prev.exercises.filter((_, idx) => idx !== index);
      const reordered = nextExercises.map((exercise, idx) => ({ ...exercise, order: idx + 1 }));
      return { ...prev, exercises: reordered };
    });
  };

  const openTemplateExercisePicker = (replaceIndex?: number) => {
    setTemplateReplaceIndex(Number.isInteger(replaceIndex) ? (replaceIndex as number) : null);
    setTemplatePickerOpen(true);
    setTemplatePickerQuery('');
  };

  const upsertTemplateExercise = (exercise: Exercise) => {
    setTemplateDraft((prev) => {
      if (!prev) return prev;
      const baseEntry: TemplateExerciseDraft = {
        exercise_id: exercise.id,
        sets: exercise.sets_default ?? 1,
        reps: exercise.reps_default ?? null,
        duration: exercise.duration_seconds_default ?? null,
        side: exercise.side_specific ? 'left' : 'bilateral',
        order: prev.exercises.length + 1,
        exercise,
      };

      let nextExercises = [...prev.exercises];
      if (templateReplaceIndex !== null && nextExercises[templateReplaceIndex]) {
        const existing = nextExercises[templateReplaceIndex];
        nextExercises[templateReplaceIndex] = {
          ...existing,
          exercise_id: exercise.id,
          exercise,
          sets: exercise.sets_default ?? existing.sets ?? 1,
          reps: exercise.reps_default ?? null,
          duration: exercise.duration_seconds_default ?? null,
          side: exercise.side_specific ? 'left' : 'bilateral',
        };
      } else {
        nextExercises = [...nextExercises, baseEntry];
      }

      const reordered = nextExercises.map((item, idx) => ({ ...item, order: idx + 1 }));
      return { ...prev, exercises: reordered };
    });

    setTemplatePickerOpen(false);
    setTemplateReplaceIndex(null);
    setTemplatePickerQuery('');
  };

  const saveTemplateDraft = async () => {
    if (!templateDraft) return;
    const supabase = getSupabase();
    const exercisesPayload = templateDraft.exercises.map((exercise, index) => ({
      exercise_id: exercise.exercise_id,
      sets: exercise.sets ?? null,
      reps: exercise.reps ?? null,
      duration: exercise.duration ?? null,
      side: exercise.side ?? null,
      order: index + 1,
    }));

    const { error } = await supabase
      .from('workout_templates')
      .update({ exercises: exercisesPayload })
      .eq('id', templateDraft.id);

    if (error) {
      pushToast('Failed to save template.', 'error');
      return;
    }

    pushToast('Template updated.', 'success');
    closeTemplateEditor();
    await loadTemplates();
  };

  const startGuidedTemplate = (template: WorkoutTemplate) => {
    if (activeWorkout) {
      pushToast('Finish the current workout first.', 'info');
      return;
    }

    if (template.exercises.length === 0) {
      pushToast('Template has no exercises.', 'error');
      return;
    }

    setGuidedTemplate(template);
    setGuidedExerciseIndex(0);
    setGuidedSetIndex(0);
    setGuidedRemaining(null);
    setGuidedStartedAt(new Date());
    setGuidedSets({});
    setShowStartForm(false);
  };

  const stopGuidedTemplate = useCallback(() => {
    setGuidedTemplate(null);
    setGuidedExerciseIndex(0);
    setGuidedSetIndex(0);
    setGuidedRemaining(null);
    setGuidedStartedAt(null);
    setGuidedSets({});
  }, []);

  const finishGuidedWorkout = useCallback(
    async (setsOverride?: Record<string, WorkoutSet[]>) => {
      if (!guidedTemplate || !guidedStartedAt) return;
      const finalSets = setsOverride ?? guidedSets;
      const totalSets = Object.values(finalSets).reduce((acc, sets) => acc + sets.length, 0);
      if (totalSets === 0) {
        pushToast('Log at least one set to save.', 'error');
        return;
      }

      const supabase = getSupabase();
      const startedAt = guidedStartedAt.toISOString();
      const endedAt = new Date().toISOString();
      const durationMinutes = Math.max(1, Math.round((Date.now() - guidedStartedAt.getTime()) / 60000));
      const workoutPayload = {
        date: startedAt.split('T')[0],
        type: guidedTemplate.type,
        started_at: startedAt,
        ended_at: endedAt,
        duration_minutes: durationMinutes,
        notes: `Template: ${guidedTemplate.name}`,
        energy_level_before: null,
        pain_level_before: null,
        energy_level_after: null,
        pain_level_after: null,
      };

      const { data, error } = await supabase
        .from('workouts')
        .insert(workoutPayload)
        .select('*')
        .single();

      if (error || !data) {
        pushToast('Failed to save guided workout.', 'error');
        return;
      }

      const exercisePayload = guidedTemplate.exercises.map((exercise, index) => ({
        workout_id: data.id,
        exercise_id: exercise.exercise_id,
        order_index: index,
        sets: finalSets[exercise.exercise_id] ?? [],
      }));

      const { error: exerciseError } = await supabase.from('workout_exercises').insert(exercisePayload);
      if (exerciseError) {
        pushToast('Workout saved, but exercises failed.', 'error');
      }

      const workoutSummary = computeWorkoutSummary(
        exercisePayload.map((entry) => ({ sets: entry.sets })),
      );
      setSummary({ ...workoutSummary, totalDurationSeconds: durationMinutes * 60 });
      stopGuidedTemplate();
      await loadAll();
      pushToast('Guided workout logged.', 'success');
    },
    [guidedTemplate, guidedStartedAt, guidedSets, pushToast, stopGuidedTemplate, loadAll],
  );

  const completeGuidedSet = useCallback(() => {
    if (!guidedTemplate) return;
    const currentExercise = guidedTemplate.exercises[guidedExerciseIndex];
    if (!currentExercise) return;
    const totalSets = getTemplateSetCount(currentExercise);
    const isLastSet = guidedSetIndex + 1 >= totalSets;
    const isLastExercise = guidedExerciseIndex + 1 >= guidedTemplate.exercises.length;
    const exerciseInfo = exerciseById.get(currentExercise.exercise_id);
    const fallbackSide: WorkoutSetSide = currentExercise.side ?? (exerciseInfo?.side_specific ? 'left' : 'bilateral');
    const nextSet = buildTemplateSet(currentExercise, fallbackSide);

    setGuidedSets((prev) => {
      const next = { ...prev };
      next[currentExercise.exercise_id] = [...(next[currentExercise.exercise_id] ?? []), nextSet];
      if (isLastSet && isLastExercise) {
        finishGuidedWorkout(next);
      }
      return next;
    });

    if (isLastSet) {
      if (!isLastExercise) {
        setGuidedExerciseIndex(guidedExerciseIndex + 1);
        setGuidedSetIndex(0);
        setGuidedRemaining(null);
      }
      return;
    }

    setGuidedSetIndex(guidedSetIndex + 1);
    setGuidedRemaining(null);
  }, [
    guidedTemplate,
    guidedExerciseIndex,
    guidedSetIndex,
    exerciseById,
    finishGuidedWorkout,
  ]);

  const skipGuidedExercise = () => {
    if (!guidedTemplate) return;
    const isLastExercise = guidedExerciseIndex + 1 >= guidedTemplate.exercises.length;
    if (isLastExercise) {
      finishGuidedWorkout();
      return;
    }
    setGuidedExerciseIndex(guidedExerciseIndex + 1);
    setGuidedSetIndex(0);
    setGuidedRemaining(null);
  };

  useEffect(() => {
    if (guidedRemaining === null) return;
    if (guidedRemaining <= 0) {
      completeGuidedSet();
      return;
    }

    const id = setInterval(() => {
      setGuidedRemaining((prev) => {
        if (prev === null) return null;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [guidedRemaining, completeGuidedSet]);

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

  const guidedExercise = guidedTemplate?.exercises[guidedExerciseIndex];
  const guidedExerciseInfo = guidedExercise
    ? exerciseById.get(guidedExercise.exercise_id) ?? null
    : null;
  const guidedTotalSets = guidedExercise ? getTemplateSetCount(guidedExercise) : 0;

  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['4xl'] }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealLight} />
      }
    >
      <View style={[shared.rowBetween, { marginBottom: spacing['2xl'] }]}>
        <View>
          <Text style={shared.pageTitle}>Workouts</Text>
          <Text style={shared.pageSubtitle}>Log sets, track asymmetry, and rest timers</Text>
        </View>
        {!activeWorkout && !guidedTemplate && (
          <Pressable
            onPress={() => {
              setActiveWorkout({ type: 'corrective', startedAt: new Date(), notes: '' });
              setShowStartForm(true);
            }}
            style={[shared.btnPrimary, shared.btnSmall]}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ ...typography.captionMedium, color: '#fff' }}>Start</Text>
          </Pressable>
        )}
      </View>

      {/* Quick access sub-pages */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
        <Pressable
          onPress={() => router.push('/posture')}
          style={[shared.card, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }]}
        >
          <Ionicons name="body" size={18} color={colors.teal} />
          <Text style={{ ...typography.captionMedium, color: colors.textPrimary }}>Posture</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/posture-camera')}
          style={[shared.card, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }]}
        >
          <Ionicons name="aperture" size={18} color={colors.evening} />
          <Text style={{ ...typography.captionMedium, color: colors.textPrimary }}>Camera</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/exercises')}
          style={[shared.card, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }]}
        >
          <Ionicons name="barbell" size={18} color={colors.midday} />
          <Text style={{ ...typography.captionMedium, color: colors.textPrimary }}>Exercises</Text>
        </Pressable>
      </View>

      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <View style={[shared.rowBetween, { marginBottom: spacing.sm }]}>
          <View>
            <Text style={{ ...typography.h3, color: colors.textPrimary }}>Schedule and Reminders</Text>
            <Text style={{ ...typography.small, color: colors.textTertiary }}>Set session times and gym days.</Text>
          </View>
          <Pressable
            onPress={() => router.push('/workout-schedule')}
            style={[shared.btnPrimary, shared.btnSmall]}
          >
            <Text style={{ ...typography.small, color: '#fff', fontWeight: '600' }}>Open</Text>
          </Pressable>
        </View>
        <Text style={{ ...typography.small, color: colors.textTertiary }}>
          Sync notifications for your daily corrective protocol and gym schedule.
        </Text>
      </View>

      {guidedTemplate && guidedExercise && (
        <View style={[shared.card, { borderColor: colors.warningDim, marginBottom: spacing.lg }]}>
          <View style={[shared.rowBetween, { marginBottom: spacing.md }]}>
            <View>
              <Text style={{ ...typography.h3, color: colors.textPrimary }}>Guided Protocol</Text>
              <Text style={{ ...typography.small, color: colors.textTertiary }}>{guidedTemplate.name}</Text>
            </View>
            <Pressable onPress={stopGuidedTemplate} style={[shared.btnSecondary, shared.btnSmall]}>
              <Text style={{ ...typography.small, color: colors.textSecondary }}>End</Text>
            </Pressable>
          </View>

          <View style={{ backgroundColor: colors.bgDeep, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ ...typography.small, color: colors.textTertiary }}>
              Exercise {guidedExerciseIndex + 1} of {guidedTemplate.exercises.length}
            </Text>
            <Text style={{ ...typography.h3, color: colors.textPrimary, marginTop: spacing.xs }}>
              {guidedExerciseInfo?.name ?? 'Exercise'}
            </Text>
            {guidedExerciseInfo?.instructions && (
              <Text style={{ ...typography.small, color: colors.textSecondary, marginTop: spacing.sm }}>{guidedExerciseInfo.instructions}</Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
              <Text style={{ ...typography.small, color: colors.textTertiary }}>
                Set {guidedSetIndex + 1} of {guidedTotalSets}
              </Text>
              {guidedExercise.reps !== null && (
                <Text style={{ ...typography.small, color: colors.textTertiary }}>Reps: {guidedExercise.reps}</Text>
              )}
              {guidedExercise.duration !== null && (
                <Text style={{ ...typography.small, color: colors.textTertiary }}>Duration: {guidedExercise.duration}s</Text>
              )}
              <Text style={{ ...typography.small, color: colors.textTertiary }}>
                Side: {guidedExercise.side ?? (guidedExerciseInfo?.side_specific ? 'left' : 'bilateral')}
              </Text>
            </View>

            {guidedExercise.duration !== null && (
              <View style={{ marginTop: spacing.lg, backgroundColor: colors.bgBase, borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.warningDim }}>
                <Text style={{ ...typography.small, color: colors.warning }}>Timer</Text>
                <Text style={{ ...typography.hero, color: colors.textPrimary }}>
                  {formatSeconds(Math.max(guidedRemaining ?? guidedExercise.duration, 0))}
                </Text>
                {guidedRemaining === null ? (
                  <Pressable
                    onPress={() => setGuidedRemaining(guidedExercise.duration ?? null)}
                    style={{ marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md, backgroundColor: colors.warningDim, alignSelf: 'flex-start' }}
                  >
                    <Text style={{ ...typography.small, color: '#fef3c7' }}>Start Timer</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => setGuidedRemaining(null)}
                    style={[shared.btnSecondary, shared.btnSmall, { marginTop: spacing.md, alignSelf: 'flex-start' }]}
                  >
                    <Text style={{ ...typography.small, color: colors.textSecondary }}>Pause Timer</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
            <Pressable
              onPress={completeGuidedSet}
              style={[shared.btnPrimary, { flex: 1 }]}
            >
              <Text style={shared.btnPrimaryText}>Complete Set</Text>
            </Pressable>
            <Pressable
              onPress={skipGuidedExercise}
              style={shared.btnSecondary}
            >
              <Text style={shared.btnSecondaryText}>Next Exercise</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!guidedTemplate && !activeWorkout && !showStartForm && (
        <View style={[shared.card, { marginBottom: spacing.lg }]}>
          <View style={[shared.rowBetween, { marginBottom: spacing.md }]}>
            <View>
              <Text style={{ ...typography.h3, color: colors.textPrimary }}>Corrective Protocols</Text>
              <Text style={{ ...typography.small, color: colors.textTertiary }}>Start a guided session in one tap</Text>
            </View>
          </View>

          {templates.length === 0 ? (
            <Text style={shared.pageSubtitle}>No templates available yet.</Text>
          ) : (
            <View style={{ gap: spacing.md }}>
              {templates.map((template) => (
                <View
                  key={template.id}
                  style={{ backgroundColor: colors.bgDeep, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border }}
                >
                  <View style={shared.rowBetween}>
                    <View>
                      <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>{template.name}</Text>
                      <Text style={{ ...typography.small, color: colors.textTertiary, marginTop: spacing.xs }}>
                        {template.exercises.length} exercises · {template.estimated_duration_minutes ?? '--'} min
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Pressable
                        onPress={() => startTemplateEdit(template)}
                        style={[shared.btnSecondary, shared.btnSmall]}
                      >
                        <Text style={{ ...typography.small, color: colors.textSecondary }}>Customize</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => startGuidedTemplate(template)}
                        style={[shared.btnPrimary, shared.btnSmall]}
                      >
                        <Text style={{ ...typography.small, color: '#fff' }}>Start Protocol</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {showTemplateEditor && templateDraft && (
        <View style={[shared.card, { marginBottom: spacing.lg }]}>
          <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
            <View>
              <Text style={{ ...typography.h3, color: colors.textPrimary }}>Edit Template</Text>
              <Text style={{ ...typography.small, color: colors.textTertiary }}>{templateDraft.name}</Text>
            </View>
            <Pressable onPress={closeTemplateEditor} style={[shared.btnSecondary, shared.btnSmall]}>
              <Text style={{ ...typography.small, color: colors.textSecondary }}>Close</Text>
            </Pressable>
          </View>

          <View style={{ gap: spacing.md }}>
            {templateDraft.exercises.map((exercise, index) => (
              <View
                key={`${exercise.exercise_id}-${index}`}
                style={{ backgroundColor: colors.bgDeep, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border }}
              >
                <View style={[shared.rowBetween, { marginBottom: spacing.sm }]}>
                  <Text style={shared.btnPrimaryText}>
                    {index + 1}. {exercise.exercise?.name ?? 'Missing exercise'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    <Pressable onPress={() => moveTemplateExercise(index, -1)} style={{ padding: spacing.xs }}>
                      <Ionicons name="arrow-up" size={16} color="#94a3b8" />
                    </Pressable>
                    <Pressable onPress={() => moveTemplateExercise(index, 1)} style={{ padding: spacing.xs }}>
                      <Ionicons name="arrow-down" size={16} color="#94a3b8" />
                    </Pressable>
                    <Pressable onPress={() => openTemplateExercisePicker(index)} style={{ padding: spacing.xs }}>
                      <Ionicons name="swap-horizontal" size={16} color="#94a3b8" />
                    </Pressable>
                    <Pressable onPress={() => removeTemplateExercise(index)} style={{ padding: spacing.xs }}>
                      <Ionicons name="trash-outline" size={16} color="#94a3b8" />
                    </Pressable>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                  <TextInput
                    placeholder="Sets"
                    placeholderTextColor="#64748b"
                    keyboardType="numeric"
                    value={exercise.sets !== null ? String(exercise.sets) : ''}
                    onChangeText={(text) =>
                      updateTemplateExercise(index, { sets: parseNumber(text) })
                    }
                    style={[shared.input, { flex: 1 }]}
                  />
                  <TextInput
                    placeholder="Reps"
                    placeholderTextColor="#64748b"
                    keyboardType="numeric"
                    value={exercise.reps !== null ? String(exercise.reps) : ''}
                    onChangeText={(text) =>
                      updateTemplateExercise(index, { reps: parseNumber(text) })
                    }
                    style={[shared.input, { flex: 1 }]}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                  <TextInput
                    placeholder="Duration (sec)"
                    placeholderTextColor="#64748b"
                    keyboardType="numeric"
                    value={exercise.duration !== null ? String(exercise.duration) : ''}
                    onChangeText={(text) =>
                      updateTemplateExercise(index, { duration: parseNumber(text) })
                    }
                    style={[shared.input, { flex: 1 }]}
                  />
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {(['left', 'right', 'bilateral'] as WorkoutSetSide[]).map((side) => (
                    <Pressable
                      key={side}
                      onPress={() => updateTemplateExercise(index, { side })}
                      style={{ paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.full, borderWidth: 1, backgroundColor: exercise.side === side ? colors.warningDim : 'transparent', borderColor: exercise.side === side ? colors.warning : colors.border }}
                    >
                      <Text style={{ ...typography.small, color: exercise.side === side ? '#fff' : colors.textSecondary }}>
                        {side}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => openTemplateExercisePicker()}
            style={[shared.btnSecondary, { marginTop: spacing.lg, alignItems: 'center' }]}
          >
            <Text style={{ ...typography.caption, color: colors.textSecondary }}>Add Exercise</Text>
          </Pressable>

          {templatePickerOpen && (
            <View style={{ marginTop: spacing.lg }}>
              <TextInput
                placeholder="Search exercises"
                placeholderTextColor="#64748b"
                style={shared.input}
                value={templatePickerQuery}
                onChangeText={setTemplatePickerQuery}
              />
              {templateReplaceIndex !== null && (
                <Text style={{ ...typography.small, color: colors.textTertiary, marginTop: spacing.sm }}>Replacing exercise {templateReplaceIndex + 1}</Text>
              )}
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {filteredTemplateExercises.slice(0, 20).map((exercise) => (
                  <Pressable
                    key={exercise.id}
                    onPress={() => upsertTemplateExercise(exercise)}
                    style={{ borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCardAlt, padding: spacing.md }}
                  >
                    <Text style={shared.btnPrimaryText}>{exercise.name}</Text>
                    <Text style={{ ...typography.small, color: colors.textTertiary, marginTop: spacing.xs }}>{exercise.category}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
            <Pressable
              onPress={saveTemplateDraft}
              style={[shared.btnPrimary, { flex: 1 }]}
            >
              <Text style={shared.btnPrimaryText}>Save Template</Text>
            </Pressable>
            <Pressable onPress={closeTemplateEditor} style={shared.btnSecondary}>
              <Text style={shared.btnSecondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {showStartForm && activeWorkout && (
        <View style={[shared.card, { marginBottom: spacing.lg }]}>
          <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg }}>Start Workout</Text>
          <Text style={shared.inputLabel}>Type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
            {WORKOUT_TYPES.map((type) => (
              <Pressable
                key={type.value}
                onPress={() => setActiveWorkout({ ...activeWorkout, type: type.value })}
                style={{
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md,
                  borderWidth: 1,
                  backgroundColor: activeWorkout.type === type.value ? colors.teal : 'transparent',
                  borderColor: activeWorkout.type === type.value ? colors.teal : colors.border,
                }}
              >
                <Text
                  style={{ color: activeWorkout.type === type.value ? '#fff' : colors.textSecondary }}
                >
                  {type.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Text style={shared.inputLabel}>Energy (1-10)</Text>
              <TextInput
                keyboardType="numeric"
                placeholder="7"
                placeholderTextColor="#64748b"
                value={activeWorkout.energyBefore ? String(activeWorkout.energyBefore) : ''}
                onChangeText={(text) =>
                  setActiveWorkout({ ...activeWorkout, energyBefore: parseNumber(text) ?? undefined })
                }
                style={shared.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={shared.inputLabel}>Pain (1-10)</Text>
              <TextInput
                keyboardType="numeric"
                placeholder="3"
                placeholderTextColor="#64748b"
                value={activeWorkout.painBefore ? String(activeWorkout.painBefore) : ''}
                onChangeText={(text) =>
                  setActiveWorkout({ ...activeWorkout, painBefore: parseNumber(text) ?? undefined })
                }
                style={shared.input}
              />
            </View>
          </View>

          <View style={{ marginBottom: spacing.lg }}>
            <Text style={shared.inputLabel}>Rest Timer (seconds)</Text>
            <TextInput
              keyboardType="numeric"
              placeholder="90"
              placeholderTextColor="#64748b"
              value={String(restDuration)}
              onChangeText={(text) => setRestDuration(parseNumber(text) ?? 0)}
              style={shared.input}
            />
          </View>

          <View style={{ marginBottom: spacing.lg }}>
            <Text style={shared.inputLabel}>Notes</Text>
            <TextInput
              placeholder="Workout focus or goals"
              placeholderTextColor="#64748b"
              value={activeWorkout.notes}
              onChangeText={(text) => setActiveWorkout({ ...activeWorkout, notes: text })}
              style={shared.input}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() => {
                startWorkout();
              }}
              style={[shared.btnPrimary, { flex: 1 }]}
            >
              <Text style={shared.btnPrimaryText}>Begin Workout</Text>
            </Pressable>
            <Pressable onPress={cancelWorkout} style={shared.btnSecondary}>
              <Text style={shared.btnSecondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {summary && !activeWorkout && (
        <View style={[shared.card, { marginBottom: spacing.lg }]}>
          <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg }}>Workout Summary</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <View style={{ backgroundColor: colors.bgDeep, borderRadius: radii.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ ...typography.small, color: colors.textTertiary }}>Total Volume</Text>
              <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>{Math.round(summary.totalVolumeKg)} kg</Text>
            </View>
            <View style={{ backgroundColor: colors.bgDeep, borderRadius: radii.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ ...typography.small, color: colors.textTertiary }}>Total Sets</Text>
              <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>{summary.totalSets}</Text>
            </View>
            <View style={{ backgroundColor: colors.bgDeep, borderRadius: radii.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ ...typography.small, color: colors.textTertiary }}>Duration</Text>
              <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>
                {Math.round(summary.totalDurationSeconds / 60)} min
              </Text>
            </View>
            <View style={{ backgroundColor: colors.bgDeep, borderRadius: radii.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ ...typography.small, color: colors.textTertiary }}>Left/Right</Text>
              <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>
                {summary.leftVolumeKg} / {summary.rightVolumeKg} kg
              </Text>
            </View>
          </View>
          {summary.imbalancePct !== null && (
            <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: spacing.md }}>
              Imbalance: {summary.imbalancePct > 0 ? '+' : ''}
              {summary.imbalancePct}%
            </Text>
          )}
          <Pressable
            onPress={() => setSummary(null)}
            style={[shared.btnPrimary, { marginTop: spacing.lg }]}
          >
            <Text style={shared.btnPrimaryText}>Done</Text>
          </Pressable>
        </View>
      )}

      {activeWorkout && !showStartForm && (
        <View style={[shared.card, { marginBottom: spacing.lg }]}>
          <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
            <View>
              <Text style={{ ...typography.h3, color: colors.textPrimary }}>{activeWorkoutForm.type}</Text>
              <Text style={shared.pageSubtitle}>Elapsed {formatSeconds(elapsedSeconds)}</Text>
            </View>
            <Pressable onPress={cancelWorkout} style={[shared.btnSecondary, shared.btnSmall]}>
              <Text style={{ ...typography.caption, color: colors.textSecondary }}>Discard</Text>
            </Pressable>
          </View>

          {restRemaining !== null && (
            <View style={{ backgroundColor: colors.bgDeep, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.warningDim, marginBottom: spacing.lg }}>
              <Text style={{ ...typography.caption, color: colors.warning }}>Rest Timer</Text>
              <Text style={{ ...typography.hero, color: colors.textPrimary }}>
                {formatSeconds(Math.max(restRemaining, 0))}
              </Text>
              <Text style={{ ...typography.small, color: colors.textTertiary, marginTop: spacing.xs }}>
                {restingExerciseId ? 'Between sets' : 'Rest'}
              </Text>
              <Pressable
                onPress={() => {
                  setRestRemaining(null);
                  setRestingExerciseId(null);
                }}
                style={[shared.btnSecondary, shared.btnSmall, { marginTop: spacing.md, alignSelf: 'flex-start' }]}
              >
                <Text style={{ ...typography.small, color: colors.textSecondary }}>Skip Rest</Text>
              </Pressable>
            </View>
          )}

          {recentExercises.length > 0 && (
            <View style={{ marginBottom: spacing.lg }}>
              <Text style={shared.inputLabel}>Quick add from recent</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {recentExercises.map((exercise) => (
                    <Pressable
                      key={exercise.id}
                      onPress={() => addExercise(exercise)}
                      style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.full, borderWidth: 1, borderColor: colors.border }}
                    >
                      <Text style={{ ...typography.small, color: colors.textSecondary }}>{exercise.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          <Pressable
            onPress={() => setShowExercisePicker((prev) => !prev)}
            style={[shared.btnSecondary, { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }]}
          >
            <Ionicons name="add" size={16} color="#94a3b8" />
            <Text style={{ ...typography.caption, color: colors.textSecondary }}>Add Exercise</Text>
          </Pressable>

          {showExercisePicker && (
            <View style={{ marginTop: spacing.lg }}>
              <TextInput
                placeholder="Search exercises"
                placeholderTextColor="#64748b"
                style={shared.input}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {filteredExercises.slice(0, 20).map((exercise) => {
                  const meta = CATEGORY_META[exercise.category];
                  return (
                    <Pressable
                      key={exercise.id}
                      onPress={() => addExercise(exercise)}
                      style={{ borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCardAlt, padding: spacing.md }}
                    >
                      <Text style={shared.btnPrimaryText}>{exercise.name}</Text>
                      <View style={{ marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.full, backgroundColor: meta.bg }}>
                        <Text style={{ ...typography.small, color: meta.text }}>{meta.label}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
            {workoutExercises.map((entry, index) => {
              const draft = setDrafts[entry.id] ?? emptySetDraft('bilateral');
              const sideOptions: WorkoutSetSide[] = entry.exercise.side_specific
                ? ['left', 'right']
                : ['bilateral'];
              const summary = computeWorkoutSummary([{ sets: entry.sets }]);

              return (
                <View
                  key={entry.id}
                  style={{ backgroundColor: colors.bgCardAlt, borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border }}
                >
                  <View style={shared.rowBetween}>
                    <View>
                      <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>{index + 1}. {entry.exercise.name}</Text>
                      {entry.exercise.side_specific && (
                        <Text style={{ ...typography.small, color: '#fcd34d', marginTop: spacing.xs }}>Side-specific</Text>
                      )}
                    </View>
                    <Pressable onPress={() => removeExercise(entry.id)} style={{ padding: spacing.sm }}>
                      <Ionicons name="trash-outline" size={16} color="#94a3b8" />
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
                    <Text style={{ ...typography.small, color: colors.textTertiary }}>Sets: {entry.sets.length}</Text>
                    <Text style={{ ...typography.small, color: colors.textTertiary }}>Volume: {Math.round(summary.totalVolumeKg)} kg</Text>
                  </View>

                  <View style={{ marginTop: spacing.lg }}>
                    {entry.exercise.side_specific && (
                      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                        {sideOptions.map((side) => {
                          const sc = getSideColor(side);
                          const active = draft.side === side;
                          return (
                            <Pressable
                              key={side}
                              onPress={() => updateSetDraft(entry.id, { side })}
                              style={{
                                paddingHorizontal: 12, paddingVertical: 6,
                                borderRadius: 999, borderWidth: 1,
                                backgroundColor: active ? sc.bg : 'transparent',
                                borderColor: active ? sc.text : colors.border,
                              }}
                            >
                              <Text style={{ fontSize: 12, color: active ? sc.text : colors.textSecondary }}>
                                {sc.label} — {side}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                      <TextInput
                        placeholder="Reps"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={draft.reps}
                        onChangeText={(text) => updateSetDraft(entry.id, { reps: text })}
                        style={[shared.input, { flex: 1 }]}
                      />
                      <TextInput
                        placeholder="Weight (kg)"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={draft.weight}
                        onChangeText={(text) => updateSetDraft(entry.id, { weight: text })}
                        style={[shared.input, { flex: 1 }]}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                      <TextInput
                        placeholder="Duration (sec)"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={draft.duration}
                        onChangeText={(text) => updateSetDraft(entry.id, { duration: text })}
                        style={[shared.input, { flex: 1 }]}
                      />
                      <TextInput
                        placeholder="RPE"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={draft.rpe}
                        onChangeText={(text) => updateSetDraft(entry.id, { rpe: text })}
                        style={[shared.input, { flex: 1 }]}
                      />
                    </View>

                    <TextInput
                      placeholder="Notes"
                      placeholderTextColor="#64748b"
                      value={draft.notes}
                      onChangeText={(text) => updateSetDraft(entry.id, { notes: text })}
                      style={shared.input}
                    />

                    <Pressable
                      onPress={() => addSet(entry)}
                      style={[shared.btnPrimary, { marginTop: spacing.md }]}
                    >
                      <Text style={shared.btnPrimaryText}>Add Set</Text>
                    </Pressable>
                  </View>

                  {entry.sets.length > 0 && (
                    <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                      {entry.sets.map((set, setIndex) => (
                        <View
                          key={`${entry.id}-${setIndex}`}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgCardAlt, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md }}
                        >
                          <Text style={{ ...typography.small, color: colors.textSecondary }}>
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

          <View style={{ marginTop: spacing.lg, backgroundColor: colors.bgDeep, borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>Finish Workout</Text>
            <Text style={{ ...typography.small, color: colors.textTertiary, marginTop: spacing.xs }}>
              Total volume {Math.round(workoutSummary.totalVolumeKg)} kg · {workoutSummary.totalSets} sets
            </Text>

            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.small, color: colors.textSecondary, marginBottom: spacing.xs }}>Energy after</Text>
                <TextInput
                  keyboardType="numeric"
                  placeholder="7"
                  placeholderTextColor="#64748b"
                  value={energyAfter}
                  onChangeText={setEnergyAfter}
                  style={shared.input}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.small, color: colors.textSecondary, marginBottom: spacing.xs }}>Pain after</Text>
                <TextInput
                  keyboardType="numeric"
                  placeholder="2"
                  placeholderTextColor="#64748b"
                  value={painAfter}
                  onChangeText={setPainAfter}
                  style={shared.input}
                />
              </View>
            </View>

            <Pressable onPress={finishWorkout} style={[shared.btnPrimary, { marginTop: spacing.lg }]}>
              <Text style={shared.btnPrimaryText}>Complete Workout</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={[shared.rowBetween, { marginBottom: spacing.md }]}>
        <Text style={{ ...typography.h3, color: colors.textPrimary }}>Workout History</Text>
        <Pressable
          onPress={handleExport}
          disabled={isExporting || filteredHistory.length === 0}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: filteredHistory.length > 0 ? colors.bgCard : colors.bgDeep,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radii.full,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: filteredHistory.length === 0 ? 0.5 : 1,
          }}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={colors.tealLight} />
          ) : (
            <Ionicons name="download-outline" size={16} color={colors.tealLight} />
          )}
          <Text style={{ ...typography.small, color: colors.tealLight }}>Export</Text>
        </Pressable>
      </View>

      <View style={[shared.card, { marginBottom: spacing.md }]}>
        <TextInput
          placeholder="Search notes or exercises..."
          placeholderTextColor="#64748b"
          value={historySearchQuery}
          onChangeText={setHistorySearchQuery}
          style={shared.input}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
          {(['all', 'corrective', 'gym', 'cardio', 'other'] as const).map((type) => {
            const active = historyTypeFilter === type;
            const label = type === 'all' ? 'All' : WORKOUT_TYPES.find((item) => item.value === type)?.label ?? type;
            return (
              <Pressable
                key={type}
                onPress={() => setHistoryTypeFilter(type)}
                style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.full, borderWidth: 1, backgroundColor: active ? colors.tealDim : colors.bgDeep, borderColor: active ? colors.tealBorder : colors.border }}
              >
                <Text style={{ ...typography.small, color: active ? colors.tealLight : colors.textSecondary }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...typography.small, color: colors.textTertiary, marginBottom: spacing.xs }}>Start date</Text>
            <TextInput
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#64748b"
              value={historyStartDate}
              onChangeText={setHistoryStartDate}
              style={shared.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...typography.small, color: colors.textTertiary, marginBottom: spacing.xs }}>End date</Text>
            <TextInput
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#64748b"
              value={historyEndDate}
              onChangeText={setHistoryEndDate}
              style={shared.input}
            />
          </View>
        </View>
        <View style={[shared.rowBetween, { marginTop: spacing.md }]}>
          <Text style={{ ...typography.small, color: colors.textMuted }}>
            Showing {filteredHistory.length} of {workouts.length} workouts
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Text style={{ ...typography.small, color: colors.textTertiary }}>Export:</Text>
            <Pressable
              onPress={() => setExportFormat('csv')}
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 4,
                borderRadius: radii.sm,
                backgroundColor: exportFormat === 'csv' ? colors.tealDim : 'transparent',
                borderWidth: 1,
                borderColor: exportFormat === 'csv' ? colors.tealBorder : colors.border,
              }}
            >
              <Text style={{ ...typography.tiny, color: exportFormat === 'csv' ? colors.tealLight : colors.textTertiary }}>CSV</Text>
            </Pressable>
            <Pressable
              onPress={() => setExportFormat('json')}
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 4,
                borderRadius: radii.sm,
                backgroundColor: exportFormat === 'json' ? colors.tealDim : 'transparent',
                borderWidth: 1,
                borderColor: exportFormat === 'json' ? colors.tealBorder : colors.border,
              }}
            >
              <Text style={{ ...typography.tiny, color: exportFormat === 'json' ? colors.tealLight : colors.textTertiary }}>JSON</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {isLoading ? (
        <LoadingState label="Loading workouts..." />
      ) : filteredHistory.length === 0 ? (
        <View style={[shared.card, { borderStyle: 'dashed', alignItems: 'center', paddingVertical: spacing['3xl'] }]}>
          <Text style={{ ...typography.body, color: colors.textSecondary, textAlign: 'center' }}>No workouts match these filters yet.</Text>
        </View>
      ) : (
        filteredHistory.map((item) => {
          const summary = computeWorkoutSummary(item.exercises.map((exercise) => ({ sets: exercise.sets })));
          const typeMeta = WORKOUT_TYPES.find((type) => type.value === item.workout.type);
          const isExpanded = expandedWorkoutId === item.workout.id;
          return (
            <Pressable
              key={item.workout.id}
              onPress={() => setExpandedWorkoutId(isExpanded ? null : item.workout.id)}
              style={[shared.card, { marginBottom: spacing.md }]}
            >
              <View style={[shared.rowBetween, { marginBottom: spacing.sm }]}>
                <Text style={shared.btnPrimaryText}>
                  {format(new Date(item.workout.date), 'MMMM d, yyyy')}
                </Text>
                <View style={{ paddingHorizontal: 10, paddingVertical: spacing.xs, borderRadius: radii.full, backgroundColor: colors.tealDim }}>
                  <Text style={{ ...typography.small }}>{typeMeta?.label ?? item.workout.type}</Text>
                </View>
              </View>
              <Text style={{ ...typography.small, color: colors.textTertiary }}>
                {item.workout.duration_minutes ?? 0} min · {summary.totalSets} sets · {Math.round(summary.totalVolumeKg)} kg
              </Text>
              {summary.leftVolumeKg + summary.rightVolumeKg > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.leftSideDim, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#60a5fa' }}>L</Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>{summary.leftVolumeKg} kg</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.rightSideDim, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#fb923c' }}>R</Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>{summary.rightVolumeKg} kg</Text>
                  </View>
                </View>
              )}
              {item.workout.notes && (
                <Text style={{ ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm }}>{item.workout.notes}</Text>
              )}
              {isExpanded && (
                <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
                  {item.exercises.length === 0 ? (
                    <Text style={{ ...typography.small, color: colors.textMuted }}>No exercises logged.</Text>
                  ) : (
                    item.exercises.map((exercise) => {
                      const name = exerciseById.get(exercise.exercise_id ?? '')?.name ?? 'Unknown exercise';
                      return (
                        <View key={exercise.id} style={{ marginBottom: spacing.md }}>
                          <Text style={{ ...typography.bodyMedium, color: colors.textSecondary }}>{name}</Text>
                          <Text style={{ ...typography.small, color: colors.textMuted }}>
                            {exercise.sets.length} sets
                          </Text>
                          <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                            {exercise.sets.map((set, setIndex) => (
                              <View
                                key={`${exercise.id}-${setIndex}`}
                                style={{
                                  backgroundColor: set.side === 'left' ? colors.leftSideDim : set.side === 'right' ? colors.rightSideDim : colors.bgDeep,
                                  borderWidth: 1, borderColor: colors.border,
                                  borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                                }}
                              >
                                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                                  {set.side ? (
                                    <Text style={{ fontWeight: '600', color: set.side === 'left' ? '#60a5fa' : set.side === 'right' ? '#fb923c' : colors.tealLight }}>
                                      {getSideColor(set.side).label}{' '}
                                    </Text>
                                  ) : null}
                                  {set.reps ?? 0} reps · {set.weight_kg ?? 0} kg
                                  {set.duration_seconds ? ` · ${set.duration_seconds}s` : ''}
                                  {set.rpe ? ` · RPE ${set.rpe}` : ''}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
