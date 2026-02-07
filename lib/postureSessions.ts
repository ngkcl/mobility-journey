import type { PostureSession } from './types';

export type PostureTrendMode = 'daily' | 'weekly';

export interface PostureTrendPoint {
  date: string;
  value: number;
}

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekStart = (date: Date) => {
  const weekStart = new Date(date);
  const day = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - day);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
};

export const buildPostureTrend = (
  sessions: PostureSession[],
  mode: PostureTrendMode,
): PostureTrendPoint[] => {
  const buckets = new Map<string, number[]>();

  sessions.forEach((session) => {
    if (typeof session.good_posture_pct !== 'number') {
      return;
    }
    const date = new Date(session.started_at);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const key =
      mode === 'weekly' ? formatDateKey(getWeekStart(date)) : formatDateKey(date);

    const existing = buckets.get(key) ?? [];
    existing.push(session.good_posture_pct);
    buckets.set(key, existing);
  });

  return Array.from(buckets.entries())
    .map(([key, values]) => ({ date: key, value: average(values) }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};
