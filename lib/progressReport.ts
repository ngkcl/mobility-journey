/**
 * Progress Report Generator
 *
 * Aggregates data from all sources (metrics, workouts, body map, goals,
 * training programs, correlations) into a comprehensive HTML report
 * suitable for sharing with physiotherapists and healthcare providers.
 *
 * Uses expo-print to generate PDF from HTML.
 */

import { getSupabase } from './supabase';
import { format, subDays, differenceInDays, startOfDay } from 'date-fns';
import type { Goal } from './goals';

// ─── Types ────────────────────────────────────────────

export interface ReportMetricEntry {
  id: string;
  pain_level: number | null;
  posture_score: number | null;
  symmetry_score: number | null;
  energy_level: number | null;
  recorded_at: string;
  notes: string | null;
}

export interface ReportWorkout {
  id: string;
  workout_type: string;
  started_at: string;
  completed_at: string | null;
  pain_before: number | null;
  pain_after: number | null;
  energy_before: number | null;
  energy_after: number | null;
  notes: string | null;
}

export interface ReportBodyMapEntry {
  id: string;
  zone: string;
  intensity: number;
  sensation: string;
  notes: string | null;
  recorded_at: string;
}

export interface ReportGoal {
  id: string;
  type: string;
  title: string;
  starting_value: number;
  current_value: number;
  target_value: number;
  status: string;
  deadline: string | null;
  created_at: string;
}

export interface ReportProgram {
  id: string;
  name: string;
  goal_type: string;
  status: string;
  total_weeks: number;
  current_week: number;
  sessions_per_week: number;
  created_at: string;
}

export interface ReportData {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  metrics: {
    entries: ReportMetricEntry[];
    avgPain: number | null;
    avgPosture: number | null;
    avgSymmetry: number | null;
    avgEnergy: number | null;
    painTrend: TrendInfo;
    postureTrend: TrendInfo;
    symmetryTrend: TrendInfo;
  };
  workouts: {
    total: number;
    corrective: number;
    gym: number;
    stretch: number;
    totalVolume: number;
    avgPainReduction: number | null;
    consistencyPct: number;
    currentStreak: number;
  };
  bodyMap: {
    totalEntries: number;
    topZones: ZoneSummary[];
    asymmetries: AsymmetrySummary[];
  };
  goals: {
    active: ReportGoal[];
    completed: ReportGoal[];
  };
  program: ReportProgram | null;
  correlations: CorrelationSummary[];
}

export interface TrendInfo {
  direction: 'improving' | 'stable' | 'declining';
  changePercent: number;
  firstHalfAvg: number | null;
  secondHalfAvg: number | null;
}

export interface ZoneSummary {
  zone: string;
  avgIntensity: number;
  entryCount: number;
  dominantSensation: string;
}

export interface AsymmetrySummary {
  leftZone: string;
  rightZone: string;
  leftAvg: number;
  rightAvg: number;
  difference: number;
}

export interface CorrelationSummary {
  exerciseName: string;
  zone: string;
  deltaPct: number;
  occurrences: number;
  helpful: boolean;
}

// ─── Data Fetching ────────────────────────────────────

export async function fetchReportData(days: number = 30): Promise<ReportData> {
  const supabase = getSupabase();
  const now = new Date();
  const periodEnd = format(now, 'yyyy-MM-dd');
  const periodStart = format(subDays(now, days), 'yyyy-MM-dd');
  const startISO = subDays(now, days).toISOString();

  // Parallel fetch all data sources
  const [metricsRes, workoutsRes, bodyMapRes, goalsRes, programRes] =
    await Promise.all([
      supabase
        .from('metric_entries')
        .select('*')
        .gte('recorded_at', startISO)
        .order('recorded_at', { ascending: true }),
      supabase
        .from('workouts')
        .select('*')
        .gte('started_at', startISO)
        .order('started_at', { ascending: true }),
      supabase
        .from('body_map_entries')
        .select('*')
        .gte('recorded_at', startISO)
        .order('recorded_at', { ascending: true }),
      supabase
        .from('goals')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('training_programs')
        .select('*')
        .eq('status', 'active')
        .limit(1),
    ]);

  const metrics = (metricsRes.data || []) as ReportMetricEntry[];
  const workouts = (workoutsRes.data || []) as ReportWorkout[];
  const bodyMapEntries = (bodyMapRes.data || []) as ReportBodyMapEntry[];
  const goals = (goalsRes.data || []) as ReportGoal[];
  const programs = (programRes.data || []) as ReportProgram[];

  return {
    generatedAt: format(now, "MMMM d, yyyy 'at' h:mm a"),
    periodStart: format(subDays(now, days), 'MMMM d, yyyy'),
    periodEnd: format(now, 'MMMM d, yyyy'),
    periodDays: days,
    metrics: aggregateMetrics(metrics, days),
    workouts: aggregateWorkouts(workouts, days),
    bodyMap: aggregateBodyMap(bodyMapEntries),
    goals: {
      active: goals.filter((g) => g.status === 'active'),
      completed: goals.filter((g) => g.status === 'completed'),
    },
    program: programs[0] || null,
    correlations: [], // Filled async if correlation data exists
  };
}

// ─── Aggregation (Pure Functions) ─────────────────────

export function aggregateMetrics(
  entries: ReportMetricEntry[],
  periodDays: number
): ReportData['metrics'] {
  const painEntries = entries.filter((e) => e.pain_level != null);
  const postureEntries = entries.filter((e) => e.posture_score != null);
  const symmetryEntries = entries.filter((e) => e.symmetry_score != null);
  const energyEntries = entries.filter((e) => e.energy_level != null);

  const avg = (arr: number[]) =>
    arr.length > 0
      ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
      : null;

  return {
    entries,
    avgPain: avg(painEntries.map((e) => e.pain_level!)),
    avgPosture: avg(postureEntries.map((e) => e.posture_score!)),
    avgSymmetry: avg(symmetryEntries.map((e) => e.symmetry_score!)),
    avgEnergy: avg(energyEntries.map((e) => e.energy_level!)),
    painTrend: computeTrend(
      painEntries.map((e) => e.pain_level!),
      'lower_is_better'
    ),
    postureTrend: computeTrend(
      postureEntries.map((e) => e.posture_score!),
      'higher_is_better'
    ),
    symmetryTrend: computeTrend(
      symmetryEntries.map((e) => e.symmetry_score!),
      'higher_is_better'
    ),
  };
}

export function computeTrend(
  values: number[],
  direction: 'higher_is_better' | 'lower_is_better'
): TrendInfo {
  if (values.length < 2) {
    return {
      direction: 'stable',
      changePercent: 0,
      firstHalfAvg: values[0] ?? null,
      secondHalfAvg: values[0] ?? null,
    };
  }

  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const changePercent =
    firstAvg !== 0
      ? Math.round(((secondAvg - firstAvg) / Math.abs(firstAvg)) * 100)
      : 0;

  let dir: 'improving' | 'stable' | 'declining';
  const threshold = 5; // 5% change threshold
  if (Math.abs(changePercent) < threshold) {
    dir = 'stable';
  } else if (direction === 'lower_is_better') {
    dir = changePercent < 0 ? 'improving' : 'declining';
  } else {
    dir = changePercent > 0 ? 'improving' : 'declining';
  }

  return {
    direction: dir,
    changePercent: Math.abs(changePercent),
    firstHalfAvg: Math.round(firstAvg * 10) / 10,
    secondHalfAvg: Math.round(secondAvg * 10) / 10,
  };
}

export function aggregateWorkouts(
  workouts: ReportWorkout[],
  periodDays: number
): ReportData['workouts'] {
  const completed = workouts.filter((w) => w.completed_at);
  const corrective = completed.filter(
    (w) =>
      w.workout_type === 'corrective' ||
      w.workout_type === 'morning' ||
      w.workout_type === 'midday' ||
      w.workout_type === 'evening'
  );
  const gym = completed.filter(
    (w) =>
      w.workout_type === 'gym' ||
      w.workout_type === 'gym_compound' ||
      w.workout_type === 'gym_isolation'
  );
  const stretch = completed.filter(
    (w) =>
      w.workout_type === 'stretching' ||
      w.workout_type === 'warmup' ||
      w.workout_type === 'cooldown'
  );

  // Pain reduction from workouts
  const withPainData = completed.filter(
    (w) => w.pain_before != null && w.pain_after != null
  );
  const avgPainReduction =
    withPainData.length > 0
      ? Math.round(
          (withPainData.reduce(
            (sum, w) => sum + (w.pain_before! - w.pain_after!),
            0
          ) /
            withPainData.length) *
            10
        ) / 10
      : null;

  // Consistency: unique workout days / period days
  const uniqueDays = new Set(
    completed.map((w) => format(new Date(w.started_at), 'yyyy-MM-dd'))
  );
  const consistencyPct = Math.round((uniqueDays.size / periodDays) * 100);

  // Current streak (count back from today)
  const sortedDays = Array.from(uniqueDays).sort().reverse();
  let streak = 0;
  const today = startOfDay(new Date());
  for (let i = 0; i < sortedDays.length; i++) {
    const expected = format(subDays(today, i), 'yyyy-MM-dd');
    if (sortedDays[i] === expected) {
      streak++;
    } else if (
      i === 0 &&
      sortedDays[0] === format(subDays(today, 1), 'yyyy-MM-dd')
    ) {
      // Allow yesterday as start
      streak++;
    } else {
      break;
    }
  }

  return {
    total: completed.length,
    corrective: corrective.length,
    gym: gym.length,
    stretch: stretch.length,
    totalVolume: 0, // Would need workout_exercises join for actual volume
    avgPainReduction,
    consistencyPct: Math.min(consistencyPct, 100),
    currentStreak: streak,
  };
}

export function aggregateBodyMap(
  entries: ReportBodyMapEntry[]
): ReportData['bodyMap'] {
  if (entries.length === 0) {
    return { totalEntries: 0, topZones: [], asymmetries: [] };
  }

  // Group by zone
  const byZone = new Map<
    string,
    { intensities: number[]; sensations: string[] }
  >();
  for (const e of entries) {
    const existing = byZone.get(e.zone) || { intensities: [], sensations: [] };
    existing.intensities.push(e.intensity);
    existing.sensations.push(e.sensation);
    byZone.set(e.zone, existing);
  }

  // Top zones by average intensity
  const topZones: ZoneSummary[] = Array.from(byZone.entries())
    .map(([zone, data]) => {
      const avgIntensity =
        Math.round(
          (data.intensities.reduce((a, b) => a + b, 0) /
            data.intensities.length) *
            10
        ) / 10;
      // Most common sensation
      const sensationCounts = new Map<string, number>();
      data.sensations.forEach((s) =>
        sensationCounts.set(s, (sensationCounts.get(s) || 0) + 1)
      );
      const dominantSensation = Array.from(sensationCounts.entries()).sort(
        (a, b) => b[1] - a[1]
      )[0][0];

      return {
        zone,
        avgIntensity,
        entryCount: data.intensities.length,
        dominantSensation,
      };
    })
    .sort((a, b) => b.avgIntensity - a.avgIntensity)
    .slice(0, 8);

  // Asymmetry detection (left/right pairs)
  const pairs = [
    ['left_shoulder', 'right_shoulder'],
    ['left_hip', 'right_hip'],
    ['left_knee', 'right_knee'],
    ['left_arm', 'right_arm'],
    ['left_leg', 'right_leg'],
  ];

  const asymmetries: AsymmetrySummary[] = [];
  for (const [left, right] of pairs) {
    const leftData = byZone.get(left);
    const rightData = byZone.get(right);
    if (leftData && rightData) {
      const leftAvg =
        leftData.intensities.reduce((a, b) => a + b, 0) /
        leftData.intensities.length;
      const rightAvg =
        rightData.intensities.reduce((a, b) => a + b, 0) /
        rightData.intensities.length;
      const diff = Math.abs(leftAvg - rightAvg);
      if (diff >= 1.5) {
        asymmetries.push({
          leftZone: left,
          rightZone: right,
          leftAvg: Math.round(leftAvg * 10) / 10,
          rightAvg: Math.round(rightAvg * 10) / 10,
          difference: Math.round(diff * 10) / 10,
        });
      }
    }
  }

  return {
    totalEntries: entries.length,
    topZones,
    asymmetries: asymmetries.sort((a, b) => b.difference - a.difference),
  };
}

// ─── HTML Report Generation ───────────────────────────

export function formatZoneName(zone: string): string {
  return zone
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatSensation(sensation: string): string {
  const map: Record<string, string> = {
    pain: '⚡ Pain',
    tension: '🔗 Tension',
    numbness: '❄️ Numbness',
    stiffness: '🔒 Stiffness',
    weakness: '📉 Weakness',
  };
  return map[sensation] || sensation;
}

function trendIcon(dir: string): string {
  if (dir === 'improving') return '📈';
  if (dir === 'declining') return '📉';
  return '➡️';
}

function trendColor(dir: string): string {
  if (dir === 'improving') return '#22c55e';
  if (dir === 'declining') return '#ef4444';
  return '#94a3b8';
}

function goalProgressPct(goal: ReportGoal): number {
  const range = Math.abs(goal.target_value - goal.starting_value);
  if (range === 0) return 100;
  const progress = Math.abs(goal.current_value - goal.starting_value);
  return Math.min(Math.round((progress / range) * 100), 100);
}

export function generateReportHTML(data: ReportData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Progress Report — ${data.periodStart} to ${data.periodEnd}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #ffffff;
      color: #1e293b;
      font-size: 14px;
      line-height: 1.5;
      padding: 24px;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 2px solid #14b8a6;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .header .subtitle {
      font-size: 14px;
      color: #64748b;
    }
    .header .period {
      font-size: 16px;
      color: #14b8a6;
      font-weight: 600;
      margin-top: 8px;
    }
    .section {
      margin-bottom: 28px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
    }
    .stats-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
    }
    .stat-card {
      flex: 1;
      min-width: 120px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      text-align: center;
    }
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: #0f172a;
    }
    .stat-label {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }
    .stat-trend {
      font-size: 12px;
      margin-top: 4px;
    }
    .trend-improving { color: #22c55e; }
    .trend-declining { color: #ef4444; }
    .trend-stable { color: #94a3b8; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
      font-size: 13px;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
      color: #475569;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .progress-bar {
      background: #e2e8f0;
      border-radius: 4px;
      height: 8px;
      overflow: hidden;
      width: 100%;
    }
    .progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-yellow { background: #fef9c3; color: #854d0e; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-purple { background: #f3e8ff; color: #6b21a8; }
    .note {
      background: #f0fdfa;
      border-left: 3px solid #14b8a6;
      padding: 12px 16px;
      margin: 12px 0;
      font-size: 13px;
      color: #0f766e;
    }
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 11px;
    }
    .no-data {
      color: #94a3b8;
      font-style: italic;
      padding: 12px;
      text-align: center;
    }
    .asymmetry-alert {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 8px;
      padding: 12px;
      margin-top: 12px;
    }
    .asymmetry-alert strong { color: #92400e; }
    .correlation-helpful { color: #22c55e; }
    .correlation-harmful { color: #ef4444; }
    @media print {
      body { padding: 16px; font-size: 12px; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🏋️ Mobility & Rehabilitation Progress Report</h1>
    <div class="subtitle">Scoliosis Correction & Posture Improvement</div>
    <div class="period">${data.periodStart} — ${data.periodEnd} (${data.periodDays} days)</div>
  </div>

  ${renderMetricsSection(data)}
  ${renderWorkoutsSection(data)}
  ${renderBodyMapSection(data)}
  ${renderGoalsSection(data)}
  ${renderProgramSection(data)}
  ${renderCorrelationsSection(data)}
  ${renderRecommendationsSection(data)}

  <div class="footer">
    Generated on ${data.generatedAt}<br>
    Mobility Journey App — Progress Tracking for Scoliosis Rehabilitation
  </div>
</body>
</html>`;
}

function renderMetricsSection(data: ReportData): string {
  const m = data.metrics;
  if (m.entries.length === 0) {
    return `<div class="section">
      <div class="section-title">📊 Health Metrics</div>
      <div class="no-data">No metric entries recorded during this period.</div>
    </div>`;
  }

  return `<div class="section">
    <div class="section-title">📊 Health Metrics Overview</div>
    <div class="stats-grid">
      ${
        m.avgPain != null
          ? `<div class="stat-card">
        <div class="stat-value">${m.avgPain}</div>
        <div class="stat-label">Avg Pain (1-10)</div>
        <div class="stat-trend trend-${m.painTrend.direction}">
          ${trendIcon(m.painTrend.direction)} ${m.painTrend.changePercent}% ${m.painTrend.direction}
        </div>
      </div>`
          : ''
      }
      ${
        m.avgPosture != null
          ? `<div class="stat-card">
        <div class="stat-value">${m.avgPosture}</div>
        <div class="stat-label">Avg Posture Score</div>
        <div class="stat-trend trend-${m.postureTrend.direction}">
          ${trendIcon(m.postureTrend.direction)} ${m.postureTrend.changePercent}% ${m.postureTrend.direction}
        </div>
      </div>`
          : ''
      }
      ${
        m.avgSymmetry != null
          ? `<div class="stat-card">
        <div class="stat-value">${m.avgSymmetry}%</div>
        <div class="stat-label">Avg Symmetry</div>
        <div class="stat-trend trend-${m.symmetryTrend.direction}">
          ${trendIcon(m.symmetryTrend.direction)} ${m.symmetryTrend.changePercent}% ${m.symmetryTrend.direction}
        </div>
      </div>`
          : ''
      }
      ${
        m.avgEnergy != null
          ? `<div class="stat-card">
        <div class="stat-value">${m.avgEnergy}</div>
        <div class="stat-label">Avg Energy</div>
      </div>`
          : ''
      }
    </div>

    ${
      m.painTrend.firstHalfAvg != null && m.painTrend.secondHalfAvg != null
        ? `<div class="note">
      <strong>Pain Trend:</strong> First half of period averaged ${m.painTrend.firstHalfAvg}/10, 
      second half averaged ${m.painTrend.secondHalfAvg}/10 
      ${m.painTrend.direction === 'improving' ? '— showing improvement ✅' : m.painTrend.direction === 'declining' ? '— needs attention ⚠️' : '— holding steady'}
    </div>`
        : ''
    }

    <p style="color: #64748b; font-size: 12px; margin-top: 8px;">
      Based on ${m.entries.length} check-in${m.entries.length !== 1 ? 's' : ''} during this period.
    </p>
  </div>`;
}

function renderWorkoutsSection(data: ReportData): string {
  const w = data.workouts;

  return `<div class="section">
    <div class="section-title">💪 Workout Activity</div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${w.total}</div>
        <div class="stat-label">Total Sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${w.corrective}</div>
        <div class="stat-label">Corrective</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${w.gym}</div>
        <div class="stat-label">Gym / Strength</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${w.consistencyPct}%</div>
        <div class="stat-label">Consistency</div>
      </div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${w.currentStreak}</div>
        <div class="stat-label">Current Streak (days)</div>
      </div>
      ${
        w.avgPainReduction != null
          ? `<div class="stat-card">
        <div class="stat-value" style="color: ${w.avgPainReduction > 0 ? '#22c55e' : '#ef4444'}">
          ${w.avgPainReduction > 0 ? '-' : '+'}${Math.abs(w.avgPainReduction)}
        </div>
        <div class="stat-label">Avg Pain Change (per session)</div>
      </div>`
          : ''
      }
    </div>

    ${
      w.total === 0
        ? '<div class="no-data">No completed workouts during this period.</div>'
        : ''
    }
  </div>`;
}

function renderBodyMapSection(data: ReportData): string {
  const b = data.bodyMap;
  if (b.totalEntries === 0) {
    return `<div class="section">
      <div class="section-title">🗺️ Pain & Tension Map</div>
      <div class="no-data">No body map entries recorded during this period.</div>
    </div>`;
  }

  return `<div class="section">
    <div class="section-title">🗺️ Pain & Tension Map</div>
    <p style="color: #64748b; margin-bottom: 12px;">
      ${b.totalEntries} entries across ${b.topZones.length} body zones during this period.
    </p>

    ${
      b.topZones.length > 0
        ? `<table>
      <thead>
        <tr>
          <th>Zone</th>
          <th>Avg Intensity</th>
          <th>Entries</th>
          <th>Primary Sensation</th>
          <th>Severity</th>
        </tr>
      </thead>
      <tbody>
        ${b.topZones
          .map(
            (z) => `
          <tr>
            <td><strong>${formatZoneName(z.zone)}</strong></td>
            <td>${z.avgIntensity}/10</td>
            <td>${z.entryCount}</td>
            <td>${formatSensation(z.dominantSensation)}</td>
            <td>
              <span class="badge ${z.avgIntensity >= 7 ? 'badge-red' : z.avgIntensity >= 4 ? 'badge-yellow' : 'badge-green'}">
                ${z.avgIntensity >= 7 ? 'High' : z.avgIntensity >= 4 ? 'Moderate' : 'Low'}
              </span>
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>`
        : ''
    }

    ${
      b.asymmetries.length > 0
        ? `
    <div class="asymmetry-alert">
      <strong>⚠️ Left/Right Asymmetries Detected:</strong>
      <ul style="margin-top: 8px; padding-left: 20px;">
        ${b.asymmetries
          .map(
            (a) => `
          <li>${formatZoneName(a.leftZone)} (${a.leftAvg}) vs ${formatZoneName(a.rightZone)} (${a.rightAvg}) — 
          <strong>${a.difference} point difference</strong></li>
        `
          )
          .join('')}
      </ul>
    </div>`
        : ''
    }
  </div>`;
}

function renderGoalsSection(data: ReportData): string {
  const { active, completed } = data.goals;
  if (active.length === 0 && completed.length === 0) {
    return `<div class="section">
      <div class="section-title">🎯 Goals</div>
      <div class="no-data">No goals set yet.</div>
    </div>`;
  }

  return `<div class="section">
    <div class="section-title">🎯 Goals Progress</div>
    
    ${
      active.length > 0
        ? `<h3 style="font-size: 14px; color: #475569; margin-bottom: 8px;">Active Goals (${active.length})</h3>
    <table>
      <thead>
        <tr>
          <th>Goal</th>
          <th>Type</th>
          <th>Progress</th>
          <th>Current</th>
          <th>Target</th>
          <th>Deadline</th>
        </tr>
      </thead>
      <tbody>
        ${active
          .map((g) => {
            const pct = goalProgressPct(g);
            return `
          <tr>
            <td><strong>${g.title}</strong></td>
            <td><span class="badge badge-blue">${g.type.replace('_', ' ')}</span></td>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div class="progress-bar" style="width: 80px;">
                  <div class="progress-fill" style="width: ${pct}%; background: ${pct >= 75 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'};"></div>
                </div>
                <span style="font-size: 12px; font-weight: 600;">${pct}%</span>
              </div>
            </td>
            <td>${g.current_value}</td>
            <td>${g.target_value}</td>
            <td>${g.deadline ? format(new Date(g.deadline), 'MMM d') : '—'}</td>
          </tr>`;
          })
          .join('')}
      </tbody>
    </table>`
        : ''
    }

    ${
      completed.length > 0
        ? `<h3 style="font-size: 14px; color: #475569; margin: 16px 0 8px;">Completed Goals (${completed.length}) ✅</h3>
    <table>
      <thead>
        <tr>
          <th>Goal</th>
          <th>Type</th>
          <th>Start → Final</th>
          <th>Target</th>
        </tr>
      </thead>
      <tbody>
        ${completed
          .map(
            (g) => `
          <tr>
            <td><strong>${g.title}</strong></td>
            <td><span class="badge badge-green">${g.type.replace('_', ' ')}</span></td>
            <td>${g.starting_value} → ${g.current_value}</td>
            <td>${g.target_value}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>`
        : ''
    }
  </div>`;
}

function renderProgramSection(data: ReportData): string {
  if (!data.program) {
    return `<div class="section">
      <div class="section-title">📋 Training Program</div>
      <div class="no-data">No active training program.</div>
    </div>`;
  }

  const p = data.program;
  const weekPct = Math.round((p.current_week / p.total_weeks) * 100);

  return `<div class="section">
    <div class="section-title">📋 Training Program</div>
    <div class="stat-card" style="margin-bottom: 12px;">
      <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${p.name}</div>
      <div style="color: #64748b; margin: 4px 0;">
        <span class="badge badge-purple">${p.goal_type.replace('_', ' ')}</span>
        <span class="badge badge-blue">${p.sessions_per_week}x per week</span>
      </div>
      <div style="margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span>Week ${p.current_week} of ${p.total_weeks}</span>
          <span>${weekPct}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${weekPct}%; background: #14b8a6;"></div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderCorrelationsSection(data: ReportData): string {
  if (data.correlations.length === 0) {
    return '';
  }

  const helpful = data.correlations.filter((c) => c.helpful);
  const harmful = data.correlations.filter((c) => !c.helpful);

  return `<div class="section">
    <div class="section-title">🔬 Exercise Effectiveness Analysis</div>
    <p style="color: #64748b; margin-bottom: 12px;">
      Based on correlating workout data with pain/tension recordings.
    </p>

    ${
      helpful.length > 0
        ? `<h3 style="font-size: 14px; color: #22c55e; margin-bottom: 8px;">✅ Most Effective Exercises</h3>
    <table>
      <thead><tr><th>Exercise</th><th>Helps Zone</th><th>Pain Reduction</th><th>Confidence</th></tr></thead>
      <tbody>
        ${helpful
          .slice(0, 5)
          .map(
            (c) => `
          <tr>
            <td><strong>${c.exerciseName}</strong></td>
            <td>${formatZoneName(c.zone)}</td>
            <td class="correlation-helpful">-${Math.abs(c.deltaPct)}%</td>
            <td>${c.occurrences} occurrences</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`
        : ''
    }

    ${
      harmful.length > 0
        ? `<h3 style="font-size: 14px; color: #ef4444; margin: 16px 0 8px;">⚠️ Exercises to Monitor</h3>
    <table>
      <thead><tr><th>Exercise</th><th>Affects Zone</th><th>Pain Increase</th><th>Confidence</th></tr></thead>
      <tbody>
        ${harmful
          .slice(0, 3)
          .map(
            (c) => `
          <tr>
            <td><strong>${c.exerciseName}</strong></td>
            <td>${formatZoneName(c.zone)}</td>
            <td class="correlation-harmful">+${Math.abs(c.deltaPct)}%</td>
            <td>${c.occurrences} occurrences</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`
        : ''
    }
  </div>`;
}

function renderRecommendationsSection(data: ReportData): string {
  const recs: string[] = [];

  // Pain-based recommendations
  if (data.metrics.avgPain != null) {
    if (data.metrics.avgPain >= 6) {
      recs.push(
        'High average pain level detected. Consider discussing pain management strategies with your physiotherapist.'
      );
    }
    if (data.metrics.painTrend.direction === 'declining') {
      recs.push(
        'Pain levels are trending upward. Review recent exercise changes and consider reducing intensity.'
      );
    }
    if (data.metrics.painTrend.direction === 'improving') {
      recs.push(
        'Pain levels are improving — current exercise program appears effective. Continue current approach.'
      );
    }
  }

  // Workout recommendations
  if (data.workouts.consistencyPct < 50) {
    recs.push(
      `Workout consistency is at ${data.workouts.consistencyPct}%. Aim for at least 3-4 sessions per week for optimal rehabilitation progress.`
    );
  }
  if (data.workouts.corrective === 0 && data.workouts.total > 0) {
    recs.push(
      'No corrective exercises logged. For scoliosis management, include targeted corrective work alongside gym training.'
    );
  }

  // Asymmetry recommendations
  if (data.bodyMap.asymmetries.length > 0) {
    const worst = data.bodyMap.asymmetries[0];
    recs.push(
      `Significant left/right imbalance detected in ${formatZoneName(worst.leftZone).replace('Left ', '')} area (${worst.difference} point difference). Focus on unilateral exercises targeting the weaker side.`
    );
  }

  // Symmetry trend
  if (
    data.metrics.avgSymmetry != null &&
    data.metrics.symmetryTrend.direction === 'declining'
  ) {
    recs.push(
      'Symmetry score is declining. Review exercise form and consider increasing emphasis on bilateral/unilateral corrective work.'
    );
  }

  if (recs.length === 0) {
    return '';
  }

  return `<div class="section">
    <div class="section-title">💡 Recommendations</div>
    <div class="note">
      <strong>For discussion with your healthcare provider:</strong>
    </div>
    <ul style="padding-left: 20px; margin-top: 8px;">
      ${recs.map((r) => `<li style="margin-bottom: 8px;">${r}</li>`).join('')}
    </ul>
  </div>`;
}
