import AsyncStorage from '@react-native-async-storage/async-storage';

export type ScheduleDayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type ScheduleSessionKey = 'morning' | 'midday' | 'evening';

export type WorkoutSchedule = {
  sessions: Record<ScheduleSessionKey, string>;
  correctiveDays: Record<ScheduleDayKey, boolean>;
  gymDays: Record<ScheduleDayKey, boolean>;
  notificationsEnabled: boolean;
};

export const DAY_ORDER: ScheduleDayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const DAY_LABELS: Record<ScheduleDayKey, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export const SESSION_LABELS: Record<ScheduleSessionKey, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
};

const WEEKDAY_KEYS: ScheduleDayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export const WORKOUT_SCHEDULE_KEY = 'workout_schedule_v1';

export const DEFAULT_WORKOUT_SESSIONS: Record<ScheduleSessionKey, string> = {
  morning: '09:00',
  midday: '13:30',
  evening: '21:00',
};

const DEFAULT_DAY_FLAGS = DAY_ORDER.reduce((acc, day) => {
  acc[day] = true;
  return acc;
}, {} as Record<ScheduleDayKey, boolean>);

const DEFAULT_GYM_DAYS = DAY_ORDER.reduce((acc, day) => {
  acc[day] = false;
  return acc;
}, {} as Record<ScheduleDayKey, boolean>);

export const DEFAULT_WORKOUT_SCHEDULE: WorkoutSchedule = {
  sessions: DEFAULT_WORKOUT_SESSIONS,
  correctiveDays: DEFAULT_DAY_FLAGS,
  gymDays: DEFAULT_GYM_DAYS,
  notificationsEnabled: true,
};

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const normalizeTime = (value: unknown, fallback: string) =>
  typeof value === 'string' && TIME_REGEX.test(value) ? value : fallback;

const normalizeBoolMap = <T extends string>(
  input: Record<T, unknown> | undefined,
  fallback: Record<T, boolean>,
): Record<T, boolean> => {
  const output = { ...fallback } as Record<T, boolean>;
  (Object.keys(fallback) as T[]).forEach((key) => {
    if (typeof input?.[key] === 'boolean') {
      output[key] = input[key] as boolean;
    }
  });
  return output;
};

export const normalizeWorkoutSchedule = (
  input: Partial<WorkoutSchedule> | null | undefined,
): WorkoutSchedule => {
  const sessions = {
    morning: normalizeTime(input?.sessions?.morning, DEFAULT_WORKOUT_SESSIONS.morning),
    midday: normalizeTime(input?.sessions?.midday, DEFAULT_WORKOUT_SESSIONS.midday),
    evening: normalizeTime(input?.sessions?.evening, DEFAULT_WORKOUT_SESSIONS.evening),
  };

  return {
    sessions,
    correctiveDays: normalizeBoolMap(
      input?.correctiveDays as Record<ScheduleDayKey, unknown> | undefined,
      DEFAULT_WORKOUT_SCHEDULE.correctiveDays,
    ),
    gymDays: normalizeBoolMap(
      input?.gymDays as Record<ScheduleDayKey, unknown> | undefined,
      DEFAULT_WORKOUT_SCHEDULE.gymDays,
    ),
    notificationsEnabled:
      typeof input?.notificationsEnabled === 'boolean'
        ? input.notificationsEnabled
        : DEFAULT_WORKOUT_SCHEDULE.notificationsEnabled,
  };
};

export const loadWorkoutSchedule = async (): Promise<WorkoutSchedule> => {
  try {
    const raw = await AsyncStorage.getItem(WORKOUT_SCHEDULE_KEY);
    if (!raw) {
      return DEFAULT_WORKOUT_SCHEDULE;
    }

    const parsed = JSON.parse(raw);
    return normalizeWorkoutSchedule(parsed);
  } catch (error) {
    return DEFAULT_WORKOUT_SCHEDULE;
  }
};

export const saveWorkoutSchedule = async (schedule: WorkoutSchedule) => {
  try {
    const normalized = normalizeWorkoutSchedule(schedule);
    await AsyncStorage.setItem(WORKOUT_SCHEDULE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // Ignore persistence errors so local schedule stays functional.
  }
};

export const getDayKey = (date: Date): ScheduleDayKey => WEEKDAY_KEYS[date.getDay()];
