import type { ScheduleSessionKey, WorkoutSchedule } from './workoutSchedule';
import { getDayKey, SESSION_LABELS } from './workoutSchedule';
import type { WorkoutTemplate } from './types';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export type NextSessionSummary = {
  sessionKey: ScheduleSessionKey | 'gym' | 'rest';
  label: string;
  timeLabel: string;
  isTomorrow: boolean;
  exerciseCount: number;
  estimatedMinutes: number | null;
  template: WorkoutTemplate | null;
};

const SESSION_ORDER: ScheduleSessionKey[] = ['morning', 'midday', 'evening'];

const SESSION_TEMPLATE_NAMES: Record<ScheduleSessionKey, string> = {
  morning: 'Morning Corrective',
  midday: 'Midday Corrective',
  evening: 'Evening Corrective',
};

const SESSION_DEFAULT_MINUTES: Record<ScheduleSessionKey, number> = {
  morning: 20,
  midday: 15,
  evening: 20,
};

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
};

export const getTimeOfDay = (date: Date): TimeOfDay => {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

export const buildGreeting = (date: Date) => `Good ${getTimeOfDay(date)}`;

export const getDayOfYear = (date: Date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

export const pickDailyTip = (tips: string[], date: Date) => {
  if (!tips.length) return '';
  return tips[getDayOfYear(date) % tips.length];
};

export const formatSessionTime = (time: string) => {
  const [rawHours, rawMinutes] = time.split(':').map(Number);
  if (!Number.isFinite(rawHours) || !Number.isFinite(rawMinutes)) return time;
  const period = rawHours >= 12 ? 'PM' : 'AM';
  const hours = rawHours % 12 || 12;
  return `${hours}:${String(rawMinutes).padStart(2, '0')} ${period}`;
};

export const buildNextSessionSummary = (
  date: Date,
  schedule: WorkoutSchedule,
  templatesByName: Record<string, WorkoutTemplate>,
): NextSessionSummary => {
  const dayKey = getDayKey(date);
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  let sessionKey: ScheduleSessionKey | null = null;
  let isTomorrow = false;

  if (schedule.correctiveDays[dayKey]) {
    for (const session of SESSION_ORDER) {
      const sessionMinutes = toMinutes(schedule.sessions[session]);
      if (sessionMinutes > nowMinutes) {
        sessionKey = session;
        break;
      }
    }

    if (!sessionKey) {
      sessionKey = 'morning';
      isTomorrow = true;
    }
  }

  if (!sessionKey) {
    if (schedule.gymDays[dayKey]) {
      return {
        sessionKey: 'gym',
        label: 'Gym Session',
        timeLabel: 'Anytime',
        isTomorrow: false,
        exerciseCount: 0,
        estimatedMinutes: null,
        template: null,
      };
    }

    return {
      sessionKey: 'rest',
      label: 'Recovery Focus',
      timeLabel: 'Listen to your body',
      isTomorrow: false,
      exerciseCount: 0,
      estimatedMinutes: null,
      template: null,
    };
  }

  const templateName = SESSION_TEMPLATE_NAMES[sessionKey];
  const template = templatesByName[templateName] ?? null;
  const exerciseCount = template?.exercises?.length ?? 0;
  const estimatedMinutes =
    template?.estimated_duration_minutes ?? SESSION_DEFAULT_MINUTES[sessionKey];

  return {
    sessionKey,
    label: `${SESSION_LABELS[sessionKey]} Corrective`,
    timeLabel: formatSessionTime(schedule.sessions[sessionKey]),
    isTomorrow,
    exerciseCount,
    estimatedMinutes,
    template,
  };
};
