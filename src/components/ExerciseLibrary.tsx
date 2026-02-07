'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Clock, Dumbbell, Layers, Target, Play, X, Link as LinkIcon } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import LoadingState from '@/components/LoadingState';
import { useToast } from '@/components/ToastProvider';

const CATEGORY_OPTIONS = ['all', 'stretching', 'strengthening', 'mobility', 'posture'] as const;
const TARGET_OPTIONS = ['all', 'shoulders', 'spine', 'hips', 'core'] as const;
const DIFFICULTY_OPTIONS = ['all', 'beginner', 'intermediate', 'advanced'] as const;
const FREQUENCY_OPTIONS = ['daily', 'weekly', 'once'] as const;

interface Exercise {
  id: string;
  name: string;
  category: (typeof CATEGORY_OPTIONS)[number];
  targetArea: (typeof TARGET_OPTIONS)[number];
  instructions: string;
  difficulty: (typeof DIFFICULTY_OPTIONS)[number];
  defaultSets?: number;
  defaultReps?: number;
  defaultDurationMinutes?: number;
  referenceVideoUrls?: string[];
}

export default function ExerciseLibrary() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<(typeof CATEGORY_OPTIONS)[number]>('all');
  const [targetFilter, setTargetFilter] = useState<(typeof TARGET_OPTIONS)[number]>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<(typeof DIFFICULTY_OPTIONS)[number]>('all');
  const [defaultFrequency, setDefaultFrequency] = useState<(typeof FREQUENCY_OPTIONS)[number]>('daily');
  const [isLoading, setIsLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [referenceUrlInput, setReferenceUrlInput] = useState('');
  const [isSavingReference, setIsSavingReference] = useState(false);
  const { pushToast } = useToast();

  const selectedExercise = selectedExerciseId
    ? exercises.find((exercise) => exercise.id === selectedExerciseId) ?? null
    : null;

  useEffect(() => {
    let isMounted = true;

    const loadExercises = async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('exercises')
        .select(
          'id, name, category, target_area, instructions, difficulty, default_sets, default_reps, default_duration_minutes, reference_video_urls',
        )
        .order('name');

      if (error) {
        console.error('Failed to load exercises', error);
        if (isMounted) {
          setIsLoading(false);
          pushToast('Failed to load the exercise library. Please try again.', 'error');
        }
        return;
      }

      const normalized = (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        category: (row.category ?? 'mobility') as Exercise['category'],
        targetArea: (row.target_area ?? 'core') as Exercise['targetArea'],
        instructions: row.instructions as string,
        difficulty: (row.difficulty ?? 'beginner') as Exercise['difficulty'],
        defaultSets: row.default_sets ?? undefined,
        defaultReps: row.default_reps ?? undefined,
        defaultDurationMinutes: row.default_duration_minutes ?? undefined,
        referenceVideoUrls: row.reference_video_urls ?? undefined,
      }));

      if (isMounted) {
        setExercises(normalized);
        setIsLoading(false);
      }
    };

    loadExercises();

    return () => {
      isMounted = false;
    };
  }, [pushToast]);

  const filteredExercises = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return exercises.filter((exercise) => {
      if (categoryFilter !== 'all' && exercise.category !== categoryFilter) return false;
      if (targetFilter !== 'all' && exercise.targetArea !== targetFilter) return false;
      if (difficultyFilter !== 'all' && exercise.difficulty !== difficultyFilter) return false;
      if (!searchValue) return true;

      return (
        exercise.name.toLowerCase().includes(searchValue) ||
        exercise.instructions.toLowerCase().includes(searchValue)
      );
    });
  }, [categoryFilter, difficultyFilter, exercises, search, targetFilter]);

  const buildDefaults = (exercise: Exercise) => {
    const parts: string[] = [];
    if (exercise.defaultSets) parts.push(`${exercise.defaultSets} sets`);
    if (exercise.defaultReps) parts.push(`${exercise.defaultReps} reps`);
    if (exercise.defaultDurationMinutes) parts.push(`${exercise.defaultDurationMinutes} min`);
    return parts.join(' · ');
  };

  const normalizeUrl = (value: string) => {
    try {
      const url = new URL(value);
      return url.toString();
    } catch {
      return null;
    }
  };

  const getYoutubeId = (value: string) => {
    try {
      const url = new URL(value);
      if (url.hostname.includes('youtu.be')) {
        return url.pathname.replace('/', '') || null;
      }
      if (url.hostname.includes('youtube.com')) {
        if (url.searchParams.get('v')) return url.searchParams.get('v');
        const match = url.pathname.match(/\/(embed|shorts)\/([^/]+)/);
        return match?.[2] ?? null;
      }
    } catch {
      return null;
    }
    return null;
  };

  const isDirectVideo = (value: string) => /\.(mp4|mov|webm)(\?.*)?$/i.test(value);

  const handleAddToProtocol = async (exercise: Exercise) => {
    if (addingId) return;
    setAddingId(exercise.id);

    const defaults = buildDefaults(exercise);
    const details = `${exercise.instructions}${defaults ? `\n\nDefaults: ${defaults}` : ''}`;

    const supabase = getSupabase();
    const { error } = await supabase.from('todos').insert({
      title: exercise.name,
      details,
      category: 'exercise',
      frequency: defaultFrequency,
      due_date: null,
      completed: false,
    });

    if (error) {
      console.error('Failed to add exercise to protocol', error);
      pushToast('Could not add to protocol. Please try again.', 'error');
    } else {
      pushToast(`Added ${exercise.name} to your protocol.`, 'success');
    }

    setAddingId(null);
  };

  const handleAddReferenceUrl = async () => {
    if (!selectedExercise || isSavingReference) return;
    const normalized = normalizeUrl(referenceUrlInput.trim());
    if (!normalized) {
      pushToast('Please enter a valid video URL.', 'error');
      return;
    }

    const existing = selectedExercise.referenceVideoUrls ?? [];
    if (existing.includes(normalized)) {
      pushToast('That video is already linked.', 'error');
      return;
    }

    setIsSavingReference(true);
    const nextUrls = [...existing, normalized];
    const supabase = getSupabase();
    const { error } = await supabase
      .from('exercises')
      .update({ reference_video_urls: nextUrls })
      .eq('id', selectedExercise.id);

    if (error) {
      console.error('Failed to update reference videos', error);
      pushToast('Failed to save the reference video. Please try again.', 'error');
      setIsSavingReference(false);
      return;
    }

    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === selectedExercise.id
          ? { ...exercise, referenceVideoUrls: nextUrls }
          : exercise,
      ),
    );
    setReferenceUrlInput('');
    setIsSavingReference(false);
    pushToast('Reference video added.', 'success');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Exercise Library</h2>
          <p className="text-slate-400">Curated mobility, posture, and strength exercises to add to your protocol.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
            <Clock size={14} className="text-teal-300" />
            <span className="text-slate-400">Default frequency</span>
            <select
              value={defaultFrequency}
              onChange={(event) => setDefaultFrequency(event.target.value as typeof defaultFrequency)}
              className="bg-transparent text-white outline-none"
            >
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option} value={option} className="text-slate-900">
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or instruction"
          className="w-full rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-2 text-sm text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)}
          className="w-full rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option} className="text-slate-900">
              {option}
            </option>
          ))}
        </select>
        <select
          value={targetFilter}
          onChange={(event) => setTargetFilter(event.target.value as typeof targetFilter)}
          className="w-full rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        >
          {TARGET_OPTIONS.map((option) => (
            <option key={option} value={option} className="text-slate-900">
              {option}
            </option>
          ))}
        </select>
        <select
          value={difficultyFilter}
          onChange={(event) => setDifficultyFilter(event.target.value as typeof difficultyFilter)}
          className="w-full rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        >
          {DIFFICULTY_OPTIONS.map((option) => (
            <option key={option} value={option} className="text-slate-900">
              {option}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <LoadingState label="Loading exercise library..." />
      ) : filteredExercises.length === 0 ? (
        <div className="rounded-2xl border border-slate-800/70 border-dashed bg-slate-900/70 p-8 text-center text-slate-300">
          No exercises match your filters yet. Try widening the search.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredExercises.map((exercise) => {
            const defaults = buildDefaults(exercise);
            return (
              <div
                key={exercise.id}
                className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5 shadow-lg shadow-black/20"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="inline-flex items-center gap-2 rounded-full bg-slate-800/70 px-3 py-1 text-sm text-slate-200">
                        <BookOpen size={14} className="text-teal-300" />
                        {exercise.category}
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-slate-800/70 px-3 py-1 text-sm text-slate-200">
                        <Target size={14} className="text-amber-300" />
                        {exercise.targetArea}
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-slate-800/70 px-3 py-1 text-sm text-slate-200">
                        <Layers size={14} className="text-sky-300" />
                        {exercise.difficulty}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-white">{exercise.name}</h3>
                      <p className="mt-2 text-sm text-slate-300">{exercise.instructions}</p>
                    </div>

                    {defaults && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Dumbbell size={14} />
                        <span>Defaults: {defaults}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setSelectedExerciseId(exercise.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium bg-slate-800/70 text-slate-200 hover:bg-slate-700/70"
                    >
                      <Play size={16} />
                      Details
                    </button>
                    <button
                      onClick={() => handleAddToProtocol(exercise)}
                      disabled={addingId === exercise.id}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                        addingId === exercise.id
                          ? 'bg-slate-800/70 text-slate-400'
                          : 'bg-teal-500 text-white hover:bg-teal-400'
                      }`}
                    >
                      {addingId === exercise.id ? 'Adding...' : 'Add to Protocol'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedExercise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900 border border-slate-800/70 shadow-2xl">
            <button
              onClick={() => setSelectedExerciseId(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold text-white">{selectedExercise.name}</h3>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-800/70 px-3 py-1">
                    <BookOpen size={14} className="text-teal-300" />
                    {selectedExercise.category}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-800/70 px-3 py-1">
                    <Target size={14} className="text-amber-300" />
                    {selectedExercise.targetArea}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-800/70 px-3 py-1">
                    <Layers size={14} className="text-sky-300" />
                    {selectedExercise.difficulty}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4 text-sm text-slate-300 whitespace-pre-wrap">
                {selectedExercise.instructions}
              </div>

              {buildDefaults(selectedExercise) && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Dumbbell size={14} />
                  <span>Defaults: {buildDefaults(selectedExercise)}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-200">Reference videos</h4>
                  <span className="text-xs text-slate-500">YouTube or direct video links</span>
                </div>

                {selectedExercise.referenceVideoUrls &&
                selectedExercise.referenceVideoUrls.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {selectedExercise.referenceVideoUrls.map((url, index) => {
                      const youtubeId = getYoutubeId(url);
                      if (youtubeId) {
                        return (
                          <div key={`${url}-${index}`} className="rounded-xl overflow-hidden border border-slate-800/70 bg-black">
                            <iframe
                              src={`https://www.youtube.com/embed/${youtubeId}`}
                              title={`Reference video ${index + 1}`}
                              className="w-full aspect-video"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        );
                      }

                      if (isDirectVideo(url)) {
                        return (
                          <video
                            key={`${url}-${index}`}
                            src={url}
                            controls
                            className="w-full rounded-xl border border-slate-800/70 bg-black"
                          />
                        );
                      }

                      return (
                        <a
                          key={`${url}-${index}`}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-3 text-sm text-teal-300 hover:text-teal-200"
                        >
                          <LinkIcon size={16} />
                          <span className="truncate">{url}</span>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-800/70 border-dashed bg-slate-900/70 p-6 text-sm text-slate-400">
                    No reference videos yet. Add a YouTube or direct video link below.
                  </div>
                )}

                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <input
                    value={referenceUrlInput}
                    onChange={(event) => setReferenceUrlInput(event.target.value)}
                    placeholder="Paste a YouTube or video URL"
                    className="flex-1 rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-2 text-sm text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                  <button
                    onClick={handleAddReferenceUrl}
                    disabled={isSavingReference}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                      isSavingReference
                        ? 'bg-slate-800/70 text-slate-400'
                        : 'bg-teal-500 text-white hover:bg-teal-400'
                    }`}
                  >
                    {isSavingReference ? 'Saving...' : 'Add video'}
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4 text-sm text-slate-400">
                  Upload form-check videos in the Videos tab and link them to this exercise.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
