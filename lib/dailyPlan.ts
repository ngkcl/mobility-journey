import type { DailyPlanExercise, DailyPlanPayload, DailyPlanSection } from './types';
import type { WorkoutSetSide } from './types';

const DEFAULT_SECTION_TITLES: Record<keyof DailyPlanPayload, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  gym: 'Gym',
};

const normalizeSide = (side?: WorkoutSetSide | null): WorkoutSetSide | null => {
  if (!side) return null;
  if (side === 'left' || side === 'right' || side === 'bilateral') return side;
  return null;
};

const normalizeNumber = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
};

const normalizeString = (value?: string | null) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeExercise = (input: Partial<DailyPlanExercise> | null | undefined): DailyPlanExercise => {
  return {
    name: normalizeString(input?.name) ?? 'Untitled',
    sets: normalizeNumber(input?.sets),
    reps: normalizeNumber(input?.reps),
    duration_seconds: normalizeNumber(input?.duration_seconds),
    side: normalizeSide(input?.side),
    notes: normalizeString(input?.notes),
    reason: normalizeString(input?.reason),
  };
};

const normalizeSection = (
  key: keyof DailyPlanPayload,
  input?: Partial<DailyPlanSection> | null,
): DailyPlanSection => {
  const exercises = Array.isArray(input?.exercises)
    ? input?.exercises.map((exercise) => normalizeExercise(exercise))
    : [];

  return {
    title: normalizeString(input?.title) ?? DEFAULT_SECTION_TITLES[key],
    focus: normalizeString(input?.focus),
    exercises,
  };
};

export const normalizeDailyPlan = (payload?: Partial<DailyPlanPayload> | null): DailyPlanPayload => {
  return {
    morning: normalizeSection('morning', payload?.morning),
    afternoon: normalizeSection('afternoon', payload?.afternoon),
    evening: normalizeSection('evening', payload?.evening),
    gym: payload?.gym ? normalizeSection('gym', payload?.gym) : null,
  };
};

export const normalizeReasoning = (items?: unknown): string[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
};
