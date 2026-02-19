/**
 * Smart Insights Engine
 *
 * Analyzes workout data, metrics, goals, and patterns to surface
 * actionable insights. Each insight has a type, priority, and optional
 * navigation action so it can drive the user toward improvement.
 */

import type {
  MetricEntry,
  Workout,
  PostureSession,
} from './types';
import type { WorkoutHistoryItem, StreakStats, AsymmetrySummary } from './workoutAnalytics';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsightCategory =
  | 'trend'        // metric going up/down
  | 'streak'       // workout consistency
  | 'imbalance'    // left/right side
  | 'recovery'     // pain/energy around workouts
  | 'milestone'    // celebration
  | 'recommendation' // actionable tip
  | 'warning';     // something to watch

export type InsightPriority = 1 | 2 | 3 | 4 | 5; // 1 = highest

export interface Insight {
  id: string;
  category: InsightCategory;
  priority: InsightPriority;
  title: string;
  body: string;
  icon: string;       // Ionicons name
  accentColor: string; // hex or theme color key
  route?: string;      // optional deep link
  dismissible: boolean;
}

export type InsightsInput = {
  metrics: MetricEntry[];
  workouts: Workout[];
  workoutHistory: WorkoutHistoryItem[];
  streakStats: StreakStats;
  asymmetry: AsymmetrySummary | null;
  postureSessions: PostureSession[];
  painImpact: { avgPainChange: number; workoutsWithPainData: number };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const daysBetween = (a: string, b: string) => {
  const msA = new Date(a).getTime();
  const msB = new Date(b).getTime();
  if (Number.isNaN(msA) || Number.isNaN(msB)) return null;
  return Math.round(Math.abs(msB - msA) / (1000 * 60 * 60 * 24));
};

const avg = (nums: number[]) =>
  nums.length === 0 ? null : nums.reduce((s, n) => s + n, 0) / nums.length;

const pctChange = (from: number, to: number) =>
  from === 0 ? null : Math.round(((to - from) / Math.abs(from)) * 100);

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const daysAgoKey = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ─── Insight Generators ───────────────────────────────────────────────────────

function painTrendInsight(metrics: MetricEntry[]): Insight | null {
  const withPain = metrics.filter((m) => m.pain_level != null).slice(0, 14);
  if (withPain.length < 4) return null;

  const recent = withPain.slice(0, 7);
  const older = withPain.slice(7, 14);
  if (older.length < 2) return null;

  const avgRecent = avg(recent.map((m) => m.pain_level!));
  const avgOlder = avg(older.map((m) => m.pain_level!));
  if (avgRecent == null || avgOlder == null) return null;

  const change = pctChange(avgOlder, avgRecent);
  if (change == null || Math.abs(change) < 10) return null;

  const improving = avgRecent < avgOlder;

  return {
    id: 'pain-trend',
    category: 'trend',
    priority: improving ? 3 : 1,
    title: improving ? 'Pain is dropping 📉' : 'Pain trending up ⚠️',
    body: improving
      ? `Average pain dropped ${Math.abs(change)}% over the last week (${avgOlder.toFixed(1)} → ${avgRecent.toFixed(1)}). Your corrective work is paying off.`
      : `Average pain increased ${change}% (${avgOlder.toFixed(1)} → ${avgRecent.toFixed(1)}). Consider reducing intensity or adding more recovery.`,
    icon: improving ? 'trending-down' : 'trending-up',
    accentColor: improving ? '#22c55e' : '#ef4444',
    route: '/metrics',
    dismissible: true,
  };
}

function postureTrendInsight(metrics: MetricEntry[]): Insight | null {
  const withPosture = metrics.filter((m) => m.posture_score != null).slice(0, 14);
  if (withPosture.length < 4) return null;

  const recent = withPosture.slice(0, 7);
  const older = withPosture.slice(7, 14);
  if (older.length < 2) return null;

  const avgRecent = avg(recent.map((m) => m.posture_score!));
  const avgOlder = avg(older.map((m) => m.posture_score!));
  if (avgRecent == null || avgOlder == null) return null;

  const change = pctChange(avgOlder, avgRecent);
  if (change == null || Math.abs(change) < 8) return null;

  const improving = avgRecent > avgOlder;

  return {
    id: 'posture-trend',
    category: 'trend',
    priority: improving ? 3 : 2,
    title: improving ? 'Posture improving 🎯' : 'Posture dipping',
    body: improving
      ? `Posture score up ${change}% this week (${avgOlder.toFixed(1)} → ${avgRecent.toFixed(1)}). The consistency is working.`
      : `Posture score dropped ${Math.abs(change)}% (${avgOlder.toFixed(1)} → ${avgRecent.toFixed(1)}). Try adding an extra corrective session.`,
    icon: improving ? 'arrow-up-circle' : 'arrow-down-circle',
    accentColor: improving ? '#14b8a6' : '#f59e0b',
    route: '/charts',
    dismissible: true,
  };
}

function symmetryTrendInsight(metrics: MetricEntry[]): Insight | null {
  const withSym = metrics.filter((m) => m.symmetry_score != null).slice(0, 14);
  if (withSym.length < 4) return null;

  const recent = withSym.slice(0, 7);
  const older = withSym.slice(7, 14);
  if (older.length < 2) return null;

  const avgRecent = avg(recent.map((m) => m.symmetry_score!));
  const avgOlder = avg(older.map((m) => m.symmetry_score!));
  if (avgRecent == null || avgOlder == null) return null;

  const diff = avgRecent - avgOlder;
  if (Math.abs(diff) < 2) return null;

  const improving = diff > 0;

  return {
    id: 'symmetry-trend',
    category: 'trend',
    priority: 3,
    title: improving ? 'Symmetry gaining ground' : 'Symmetry slipping',
    body: improving
      ? `Symmetry score improved ${diff.toFixed(1)} points. Right-side corrective work is closing the gap.`
      : `Symmetry score dropped ${Math.abs(diff).toFixed(1)} points. Prioritize unilateral exercises on the weaker side.`,
    icon: improving ? 'swap-horizontal' : 'warning',
    accentColor: improving ? '#8b5cf6' : '#f59e0b',
    route: '/charts',
    dismissible: true,
  };
}

function streakInsights(stats: StreakStats): Insight[] {
  const insights: Insight[] = [];

  // Streak milestone celebrations
  if ([7, 14, 21, 30, 60, 90, 100].includes(stats.currentStreak)) {
    insights.push({
      id: `streak-milestone-${stats.currentStreak}`,
      category: 'milestone',
      priority: 2,
      title: `${stats.currentStreak}-day streak! 🔥`,
      body:
        stats.currentStreak >= 30
          ? `Absolutely incredible. ${stats.currentStreak} consecutive days of showing up. This is how you change your body.`
          : `${stats.currentStreak} days in a row. That's real discipline. Keep the momentum going.`,
      icon: 'flame',
      accentColor: '#f59e0b',
      dismissible: true,
    });
  }

  // Streak broken — motivational nudge
  if (stats.currentStreak === 0 && stats.bestStreak >= 3) {
    insights.push({
      id: 'streak-broken',
      category: 'streak',
      priority: 2,
      title: 'Streak reset — start fresh today',
      body: `Your best was ${stats.bestStreak} days. One workout today and you're back on track.`,
      icon: 'refresh',
      accentColor: '#3b82f6',
      route: '/workouts',
      dismissible: true,
    });
  }

  // New personal best streak
  if (
    stats.currentStreak > 0 &&
    stats.currentStreak === stats.bestStreak &&
    stats.currentStreak > 3
  ) {
    insights.push({
      id: 'streak-personal-best',
      category: 'milestone',
      priority: 2,
      title: 'New personal best streak! 🏆',
      body: `${stats.currentStreak} days — that's your longest streak ever. You're rewriting your record.`,
      icon: 'trophy',
      accentColor: '#f59e0b',
      dismissible: true,
    });
  }

  return insights;
}

function imbalanceInsight(asymmetry: AsymmetrySummary | null): Insight | null {
  if (!asymmetry) return null;
  if (Math.abs(asymmetry.currentImbalancePct) < 8) return null;

  const side = asymmetry.dominantSide === 'left' ? 'left' : 'right';
  const weakSide = side === 'left' ? 'right' : 'left';

  if (asymmetry.trendDirection === 'improving') {
    return {
      id: 'imbalance-improving',
      category: 'imbalance',
      priority: 3,
      title: 'Imbalance is closing',
      body: `${side.charAt(0).toUpperCase() + side.slice(1)}-side volume still ${Math.abs(asymmetry.currentImbalancePct)}% higher, but it was ${asymmetry.avgImbalancePrior4Weeks}% four weeks ago. Keep targeting the ${weakSide} side.`,
      icon: 'swap-horizontal',
      accentColor: '#22c55e',
      route: '/charts',
      dismissible: true,
    };
  }

  return {
    id: 'imbalance-alert',
    category: 'imbalance',
    priority: 2,
    title: `${side.charAt(0).toUpperCase() + side.slice(1)}-side dominance: ${Math.abs(asymmetry.currentImbalancePct)}%`,
    body: `Your ${side} side is doing significantly more volume. Add extra ${weakSide}-side sets to corrective sessions to even out.`,
    icon: 'alert-circle',
    accentColor: '#f97316',
    route: '/charts',
    dismissible: true,
  };
}

function recoveryInsight(painImpact: { avgPainChange: number; workoutsWithPainData: number }): Insight | null {
  if (painImpact.workoutsWithPainData < 3) return null;

  if (painImpact.avgPainChange < -0.5) {
    return {
      id: 'recovery-positive',
      category: 'recovery',
      priority: 4,
      title: 'Workouts are reducing your pain',
      body: `On average, your pain drops ${Math.abs(painImpact.avgPainChange).toFixed(1)} points after working out (based on ${painImpact.workoutsWithPainData} sessions). Movement is medicine.`,
      icon: 'heart',
      accentColor: '#22c55e',
      dismissible: true,
    };
  }

  if (painImpact.avgPainChange > 0.5) {
    return {
      id: 'recovery-concern',
      category: 'warning',
      priority: 1,
      title: 'Pain increases after workouts',
      body: `Pain rises ${painImpact.avgPainChange.toFixed(1)} points on average post-workout. Consider lighter loads, more warm-up time, or consulting a specialist.`,
      icon: 'alert-circle',
      accentColor: '#ef4444',
      route: '/analysis',
      dismissible: true,
    };
  }

  return null;
}

function consistencyInsight(workouts: Workout[]): Insight | null {
  const today = todayKey();
  const weekAgo = daysAgoKey(7);
  const twoWeeksAgo = daysAgoKey(14);

  const thisWeek = workouts.filter(
    (w) => w.date >= weekAgo && w.date <= today && w.type === 'corrective',
  );
  const lastWeek = workouts.filter(
    (w) => w.date >= twoWeeksAgo && w.date < weekAgo && w.type === 'corrective',
  );

  const thisWeekCount = thisWeek.length;
  const lastWeekCount = lastWeek.length;

  // Great consistency
  if (thisWeekCount >= 18) {
    return {
      id: 'consistency-excellent',
      category: 'milestone',
      priority: 4,
      title: 'Crushing the 3x daily protocol',
      body: `${thisWeekCount} corrective sessions this week. You're hitting the scoliosis protocol consistently. This is what real progress looks like.`,
      icon: 'checkmark-circle',
      accentColor: '#22c55e',
      dismissible: true,
    };
  }

  // Declining consistency
  if (lastWeekCount > 0 && thisWeekCount < lastWeekCount * 0.5) {
    return {
      id: 'consistency-declining',
      category: 'warning',
      priority: 2,
      title: 'Sessions dropping off',
      body: `Only ${thisWeekCount} corrective sessions this week vs ${lastWeekCount} last week. Even a 10-minute session counts — don't let the habit slip.`,
      icon: 'trending-down',
      accentColor: '#f59e0b',
      route: '/workouts',
      dismissible: true,
    };
  }

  // No sessions in 3+ days
  if (workouts.length > 0) {
    const sorted = [...workouts]
      .filter((w) => w.type === 'corrective')
      .sort((a, b) => b.date.localeCompare(a.date));
    if (sorted.length > 0) {
      const lastDate = sorted[0].date;
      const gap = daysBetween(lastDate, today);
      if (gap != null && gap >= 3) {
        return {
          id: 'consistency-gap',
          category: 'warning',
          priority: 1,
          title: `${gap} days without corrective work`,
          body: `Your last corrective session was ${gap} days ago. Your body needs the daily correction — jump back in today.`,
          icon: 'alert-circle',
          accentColor: '#ef4444',
          route: '/plan',
          dismissible: true,
        };
      }
    }
  }

  return null;
}

function postureSessionInsight(sessions: PostureSession[]): Insight | null {
  if (sessions.length < 3) return null;

  const recent = sessions.slice(0, 5);
  const avgGoodPct =
    avg(recent.filter((s) => s.good_posture_pct != null).map((s) => s.good_posture_pct!));
  if (avgGoodPct == null) return null;

  if (avgGoodPct >= 80) {
    return {
      id: 'posture-sessions-great',
      category: 'milestone',
      priority: 4,
      title: 'Posture awareness on point',
      body: `${Math.round(avgGoodPct)}% good posture in recent monitoring sessions. Your body is learning the new patterns.`,
      icon: 'body',
      accentColor: '#14b8a6',
      dismissible: true,
    };
  }

  if (avgGoodPct < 50) {
    return {
      id: 'posture-sessions-low',
      category: 'recommendation',
      priority: 2,
      title: 'Posture needs attention',
      body: `Only ${Math.round(avgGoodPct)}% good posture in recent monitoring. Try setting hourly posture reminders — small resets add up.`,
      icon: 'body',
      accentColor: '#f59e0b',
      route: '/posture',
      dismissible: true,
    };
  }

  return null;
}

function bestDayInsight(workouts: Workout[]): Insight | null {
  if (workouts.length < 14) return null;

  const dayCounts = new Map<number, number>();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  workouts.forEach((w) => {
    const d = new Date(w.date);
    if (Number.isNaN(d.getTime())) return;
    const day = d.getDay();
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  });

  if (dayCounts.size < 3) return null;

  let bestDay = 0;
  let bestCount = 0;
  let worstDay = 0;
  let worstCount = Infinity;

  dayCounts.forEach((count, day) => {
    if (count > bestCount) { bestDay = day; bestCount = count; }
    if (count < worstCount) { worstDay = day; worstCount = count; }
  });

  if (bestCount - worstCount < 3) return null;

  return {
    id: 'best-day',
    category: 'recommendation',
    priority: 5,
    title: `${dayNames[bestDay]}s are your power day`,
    body: `You train most on ${dayNames[bestDay]}s (${bestCount} sessions) and least on ${dayNames[worstDay]}s (${worstCount}). Try scheduling a mandatory session on ${dayNames[worstDay]}s.`,
    icon: 'calendar',
    accentColor: '#3b82f6',
    dismissible: true,
  };
}

function totalWorkoutMilestone(stats: StreakStats): Insight | null {
  const milestones = [10, 25, 50, 100, 200, 365, 500];
  const hit = milestones.find((m) => stats.totalWorkoutDays === m);
  if (!hit) return null;

  return {
    id: `total-milestone-${hit}`,
    category: 'milestone',
    priority: 2,
    title: `${hit} workout days! 🎉`,
    body:
      hit >= 100
        ? `You've shown up ${hit} times. That's not a phase — that's a lifestyle. Insane dedication.`
        : `${hit} days of training logged. Every session is an investment in your future body.`,
    icon: 'star',
    accentColor: '#f59e0b',
    dismissible: true,
  };
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

/**
 * Generate all relevant insights from current app data.
 * Returns insights sorted by priority (highest first), capped at maxInsights.
 */
export function generateInsights(
  input: InsightsInput,
  maxInsights: number = 5,
): Insight[] {
  const all: Insight[] = [];

  // Metric trends
  const pain = painTrendInsight(input.metrics);
  if (pain) all.push(pain);

  const posture = postureTrendInsight(input.metrics);
  if (posture) all.push(posture);

  const symmetry = symmetryTrendInsight(input.metrics);
  if (symmetry) all.push(symmetry);

  // Streak insights
  all.push(...streakInsights(input.streakStats));

  // Imbalance
  const imbalance = imbalanceInsight(input.asymmetry);
  if (imbalance) all.push(imbalance);

  // Recovery
  const recovery = recoveryInsight(input.painImpact);
  if (recovery) all.push(recovery);

  // Consistency
  const consistency = consistencyInsight(input.workouts);
  if (consistency) all.push(consistency);

  // Posture monitoring sessions
  const postureSesh = postureSessionInsight(input.postureSessions);
  if (postureSesh) all.push(postureSesh);

  // Best day analysis
  const bestDay = bestDayInsight(input.workouts);
  if (bestDay) all.push(bestDay);

  // Total workout milestones
  const totalMilestone = totalWorkoutMilestone(input.streakStats);
  if (totalMilestone) all.push(totalMilestone);

  // Sort by priority (1 = highest), then by category for tie-breaking
  all.sort((a, b) => a.priority - b.priority);

  return all.slice(0, maxInsights);
}
