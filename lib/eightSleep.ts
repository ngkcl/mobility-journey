/**
 * Eight Sleep integration via API server proxy.
 * Fetches sleep data from Eight Sleep pod when available.
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export interface EightSleepData {
  available: boolean;
  lastNight?: {
    score: number; // 0-100
    duration_hours: number;
    hrv_avg: number;
    hr_avg: number;
    respiratory_rate: number;
    toss_turns: number;
    time_to_sleep_min: number;
    deep_sleep_pct: number;
    rem_sleep_pct: number;
    bed_temp_f: number;
    room_temp_f: number;
  } | null;
  trend?: {
    sleep_score_7d: number[];
    hrv_7d: number[];
    direction: 'improving' | 'stable' | 'declining';
  };
  recoveryScore?: number; // 1-10 normalized
}

export async function getEightSleepData(): Promise<EightSleepData> {
  try {
    const res = await fetch(`${API_URL}/api/eight-sleep`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      return { available: false };
    }

    const data = await res.json();
    return { available: true, ...data };
  } catch {
    return { available: false };
  }
}
