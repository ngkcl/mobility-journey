import type { WorkoutSet, WorkoutSetSide, WorkoutTemplateExercise } from './types';

export const getTemplateSetCount = (exercise: WorkoutTemplateExercise): number => {
  if (exercise.sets && exercise.sets > 0) return exercise.sets;
  return 1;
};

export const buildTemplateSet = (
  exercise: WorkoutTemplateExercise,
  fallbackSide: WorkoutSetSide,
): WorkoutSet => {
  return {
    reps: exercise.reps ?? null,
    weight_kg: null,
    duration_seconds: exercise.duration ?? null,
    side: exercise.side ?? fallbackSide,
    rpe: null,
    notes: null,
  };
};
