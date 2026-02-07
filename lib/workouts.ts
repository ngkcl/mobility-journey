import type { WorkoutSet, WorkoutSetSide } from './types';

type WorkoutExerciseInput = {
  sets: WorkoutSet[];
};

export const normalizeSide = (side?: WorkoutSetSide | null): WorkoutSetSide | null => {
  if (!side) return null;
  if (side === 'left' || side === 'right' || side === 'bilateral') return side;
  return null;
};

export const computeSetVolume = (set: WorkoutSet): number => {
  if (set.reps == null || set.weight_kg == null) return 0;
  if (!Number.isFinite(set.reps) || !Number.isFinite(set.weight_kg)) return 0;
  return Math.max(0, set.reps) * Math.max(0, set.weight_kg);
};

export const computeWorkoutSummary = (exercises: WorkoutExerciseInput[]) => {
  let totalSets = 0;
  let totalReps = 0;
  let totalVolumeKg = 0;
  let totalDurationSeconds = 0;
  let leftVolumeKg = 0;
  let rightVolumeKg = 0;
  let leftSets = 0;
  let rightSets = 0;

  exercises.forEach((exercise) => {
    exercise.sets.forEach((set) => {
      totalSets += 1;
      if (set.reps != null && Number.isFinite(set.reps)) totalReps += Math.max(0, set.reps);
      if (set.duration_seconds != null && Number.isFinite(set.duration_seconds)) {
        totalDurationSeconds += Math.max(0, set.duration_seconds);
      }
      const volume = computeSetVolume(set);
      totalVolumeKg += volume;

      const side = normalizeSide(set.side);
      if (side === 'left') {
        leftVolumeKg += volume;
        leftSets += 1;
      } else if (side === 'right') {
        rightVolumeKg += volume;
        rightSets += 1;
      }
    });
  });

  const exerciseCount = exercises.length;
  const maxSideVolume = Math.max(leftVolumeKg, rightVolumeKg);
  const imbalancePct =
    maxSideVolume > 0 ? Math.round(((leftVolumeKg - rightVolumeKg) / maxSideVolume) * 100) : null;

  return {
    totalSets,
    totalReps,
    totalVolumeKg,
    totalDurationSeconds,
    exerciseCount,
    leftVolumeKg,
    rightVolumeKg,
    leftSets,
    rightSets,
    imbalancePct,
  };
};
