/**
 * Body Map — Data model, constants & Supabase integration
 *
 * Types and helpers for the interactive body map feature that lets
 * users log pain, tension, and discomfort on anatomical zones.
 */
import { getSupabase } from './supabase';
import { colors } from './theme';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BodyZoneId =
  | 'neck'
  | 'left_shoulder'
  | 'right_shoulder'
  | 'chest'
  | 'upper_back'
  | 'mid_back'
  | 'lower_back'
  | 'left_hip'
  | 'right_hip'
  | 'left_knee'
  | 'right_knee'
  | 'left_arm'
  | 'right_arm'
  | 'left_leg'
  | 'right_leg';

export type SensationType = 'pain' | 'tension' | 'numbness' | 'stiffness' | 'weakness';

export interface BodyMapEntry {
  id: string;
  zone: BodyZoneId;
  intensity: number; // 1-10
  sensation: SensationType;
  notes: string | null;
  recorded_at: string;
}

export interface BodyZoneConfig {
  id: BodyZoneId;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  side: 'left' | 'right' | 'center';
}

// ─── Zone Configurations ─────────────────────────────────────────────────────
// Positions are relative to a 300×500 viewBox

export const BODY_ZONES_FRONT: BodyZoneConfig[] = [
  { id: 'neck', label: 'Neck', x: 130, y: 72, width: 40, height: 28, side: 'center' },
  { id: 'left_shoulder', label: 'Left Shoulder', x: 82, y: 100, width: 44, height: 34, side: 'left' },
  { id: 'right_shoulder', label: 'Right Shoulder', x: 174, y: 100, width: 44, height: 34, side: 'right' },
  { id: 'chest', label: 'Chest', x: 110, y: 130, width: 80, height: 50, side: 'center' },
  { id: 'left_arm', label: 'Left Arm', x: 52, y: 140, width: 32, height: 100, side: 'left' },
  { id: 'right_arm', label: 'Right Arm', x: 216, y: 140, width: 32, height: 100, side: 'right' },
  { id: 'lower_back', label: 'Abdomen', x: 115, y: 195, width: 70, height: 55, side: 'center' },
  { id: 'left_hip', label: 'Left Hip', x: 100, y: 255, width: 44, height: 38, side: 'left' },
  { id: 'right_hip', label: 'Right Hip', x: 156, y: 255, width: 44, height: 38, side: 'right' },
  { id: 'left_leg', label: 'Left Leg', x: 100, y: 305, width: 38, height: 100, side: 'left' },
  { id: 'right_leg', label: 'Right Leg', x: 162, y: 305, width: 38, height: 100, side: 'right' },
  { id: 'left_knee', label: 'Left Knee', x: 102, y: 360, width: 34, height: 30, side: 'left' },
  { id: 'right_knee', label: 'Right Knee', x: 164, y: 360, width: 34, height: 30, side: 'right' },
];

export const BODY_ZONES_BACK: BodyZoneConfig[] = [
  { id: 'neck', label: 'Neck', x: 130, y: 72, width: 40, height: 28, side: 'center' },
  { id: 'left_shoulder', label: 'Left Shoulder', x: 82, y: 100, width: 44, height: 34, side: 'left' },
  { id: 'right_shoulder', label: 'Right Shoulder', x: 174, y: 100, width: 44, height: 34, side: 'right' },
  { id: 'upper_back', label: 'Upper Back', x: 110, y: 120, width: 80, height: 40, side: 'center' },
  { id: 'mid_back', label: 'Mid Back', x: 115, y: 162, width: 70, height: 38, side: 'center' },
  { id: 'lower_back', label: 'Lower Back', x: 115, y: 202, width: 70, height: 45, side: 'center' },
  { id: 'left_arm', label: 'Left Arm', x: 52, y: 140, width: 32, height: 100, side: 'left' },
  { id: 'right_arm', label: 'Right Arm', x: 216, y: 140, width: 32, height: 100, side: 'right' },
  { id: 'left_hip', label: 'Left Hip', x: 100, y: 255, width: 44, height: 38, side: 'left' },
  { id: 'right_hip', label: 'Right Hip', x: 156, y: 255, width: 44, height: 38, side: 'right' },
  { id: 'left_leg', label: 'Left Leg', x: 100, y: 305, width: 38, height: 100, side: 'left' },
  { id: 'right_leg', label: 'Right Leg', x: 162, y: 305, width: 38, height: 100, side: 'right' },
  { id: 'left_knee', label: 'Left Knee', x: 102, y: 360, width: 34, height: 30, side: 'left' },
  { id: 'right_knee', label: 'Right Knee', x: 164, y: 360, width: 34, height: 30, side: 'right' },
];

// ─── Sensation Metadata ──────────────────────────────────────────────────────

export const SENSATIONS: { id: SensationType; label: string; icon: string }[] = [
  { id: 'pain', label: 'Pain', icon: 'flash' },
  { id: 'tension', label: 'Tension', icon: 'contract' },
  { id: 'numbness', label: 'Numbness', icon: 'snow' },
  { id: 'stiffness', label: 'Stiffness', icon: 'lock-closed' },
  { id: 'weakness', label: 'Weakness', icon: 'trending-down' },
];

// ─── Color Mapping ───────────────────────────────────────────────────────────

/** Map 0-10 intensity to a color for zone fills */
export function intensityToColor(intensity: number): string {
  if (intensity <= 0) return 'transparent';
  if (intensity <= 2) return 'rgba(34, 197, 94, 0.45)';   // green
  if (intensity <= 3) return 'rgba(132, 204, 22, 0.50)';  // lime-green
  if (intensity <= 4) return 'rgba(234, 179, 8, 0.50)';   // yellow
  if (intensity <= 5) return 'rgba(245, 158, 11, 0.55)';  // amber
  if (intensity <= 6) return 'rgba(249, 115, 22, 0.55)';  // orange
  if (intensity <= 7) return 'rgba(239, 68, 68, 0.55)';   // red
  if (intensity <= 8) return 'rgba(239, 68, 68, 0.65)';   // bright red
  if (intensity <= 9) return 'rgba(220, 38, 38, 0.70)';   // deeper red
  return 'rgba(185, 28, 28, 0.80)';                       // max red
}

/** Solid color version for UI elements (sliders, badges) */
export function intensityToSolidColor(intensity: number): string {
  if (intensity <= 0) return colors.textMuted;
  if (intensity <= 3) return '#22c55e';
  if (intensity <= 5) return '#f59e0b';
  if (intensity <= 7) return '#f97316';
  return '#ef4444';
}

// ─── Zone Pair Mapping (for asymmetry) ───────────────────────────────────────

const ZONE_PAIRS: [BodyZoneId, BodyZoneId, string][] = [
  ['left_shoulder', 'right_shoulder', 'Shoulders'],
  ['left_hip', 'right_hip', 'Hips'],
  ['left_knee', 'right_knee', 'Knees'],
  ['left_arm', 'right_arm', 'Arms'],
  ['left_leg', 'right_leg', 'Legs'],
];

// ─── Supabase Functions ──────────────────────────────────────────────────────

export async function saveBodyMapEntry(
  entry: Omit<BodyMapEntry, 'id'>,
): Promise<BodyMapEntry | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('body_map_entries')
    .insert({
      zone: entry.zone,
      intensity: entry.intensity,
      sensation: entry.sensation,
      notes: entry.notes,
      recorded_at: entry.recorded_at,
    })
    .select()
    .single();

  if (error) {
    console.warn('Failed to save body map entry:', error.message);
    return null;
  }
  return data as BodyMapEntry;
}

export async function getBodyMapEntries(
  dateFrom: string,
  dateTo: string,
): Promise<BodyMapEntry[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('body_map_entries')
    .select('*')
    .gte('recorded_at', dateFrom)
    .lte('recorded_at', dateTo)
    .order('recorded_at', { ascending: false });

  if (error) {
    console.warn('Failed to fetch body map entries:', error.message);
    return [];
  }
  return (data ?? []) as BodyMapEntry[];
}

export async function getLatestEntryPerZone(): Promise<Record<string, BodyMapEntry>> {
  const supabase = getSupabase();
  // Get today's entries, most recent per zone
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('body_map_entries')
    .select('*')
    .gte('recorded_at', today.toISOString())
    .order('recorded_at', { ascending: false });

  if (error) {
    console.warn('Failed to fetch latest entries:', error.message);
    return {};
  }

  const result: Record<string, BodyMapEntry> = {};
  for (const entry of (data ?? []) as BodyMapEntry[]) {
    if (!result[entry.zone]) {
      result[entry.zone] = entry;
    }
  }
  return result;
}

export async function getZoneHistory(
  zone: BodyZoneId,
  days: number = 7,
): Promise<BodyMapEntry[]> {
  const supabase = getSupabase();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const { data, error } = await supabase
    .from('body_map_entries')
    .select('*')
    .eq('zone', zone)
    .gte('recorded_at', from.toISOString())
    .order('recorded_at', { ascending: true });

  if (error) {
    console.warn('Failed to fetch zone history:', error.message);
    return [];
  }
  return (data ?? []) as BodyMapEntry[];
}

export async function deleteBodyMapEntry(id: string): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('body_map_entries')
    .delete()
    .eq('id', id);

  if (error) {
    console.warn('Failed to delete body map entry:', error.message);
    return false;
  }
  return true;
}

export async function getAsymmetryReport(): Promise<
  { zone_pair: string; left: number; right: number; diff: number }[]
> {
  const latest = await getLatestEntryPerZone();
  const results: { zone_pair: string; left: number; right: number; diff: number }[] = [];

  for (const [leftZone, rightZone, label] of ZONE_PAIRS) {
    const leftEntry = latest[leftZone];
    const rightEntry = latest[rightZone];
    const leftVal = leftEntry?.intensity ?? 0;
    const rightVal = rightEntry?.intensity ?? 0;

    if (leftVal > 0 || rightVal > 0) {
      results.push({
        zone_pair: label,
        left: leftVal,
        right: rightVal,
        diff: Math.abs(leftVal - rightVal),
      });
    }
  }

  return results.sort((a, b) => b.diff - a.diff);
}

/** Count of unique zones with entries today */
export async function getTodayPainPointCount(): Promise<number> {
  const entries = await getLatestEntryPerZone();
  return Object.keys(entries).length;
}

// ─── Trend Types ─────────────────────────────────────────────────────────────

export type TrendDirection = 'improving' | 'worsening' | 'stable';

export interface ZoneTrend {
  zone: BodyZoneId;
  label: string;
  direction: TrendDirection;
  changePercent: number;
  currentAvg: number;
  previousAvg: number;
  entryCount: number;
}

export interface WeeklySummary {
  totalEntriesThisWeek: number;
  totalEntriesLastWeek: number;
  mostAffectedZone: string | null;
  overallTrend: TrendDirection;
  avgIntensityThisWeek: number;
  avgIntensityLastWeek: number;
}

// ─── Trend Functions ─────────────────────────────────────────────────────────

const ALL_ZONES = [...BODY_ZONES_FRONT, ...BODY_ZONES_BACK];
function getZoneLabelById(id: BodyZoneId): string {
  return ALL_ZONES.find((z) => z.id === id)?.label ?? id;
}

/** Get per-zone average intensity for a date range */
async function getZoneAveragesForRange(
  from: Date,
  to: Date,
): Promise<Record<string, { avg: number; count: number }>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('body_map_entries')
    .select('zone, intensity')
    .gte('recorded_at', from.toISOString())
    .lte('recorded_at', to.toISOString());

  if (error || !data) return {};

  const groups: Record<string, { sum: number; count: number }> = {};
  for (const entry of data as { zone: string; intensity: number }[]) {
    if (!groups[entry.zone]) groups[entry.zone] = { sum: 0, count: 0 };
    groups[entry.zone].sum += entry.intensity;
    groups[entry.zone].count += 1;
  }

  const result: Record<string, { avg: number; count: number }> = {};
  for (const [zone, { sum, count }] of Object.entries(groups)) {
    result[zone] = { avg: sum / count, count };
  }
  return result;
}

/** Get top pain zones by frequency and intensity over last N days */
export async function getTopPainZones(
  days: number = 7,
  limit: number = 5,
): Promise<ZoneTrend[]> {
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - days);
  currentStart.setHours(0, 0, 0, 0);

  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - days);

  const [currentAvgs, previousAvgs] = await Promise.all([
    getZoneAveragesForRange(currentStart, now),
    getZoneAveragesForRange(previousStart, currentStart),
  ]);

  const trends: ZoneTrend[] = [];
  const allZoneIds = new Set([
    ...Object.keys(currentAvgs),
    ...Object.keys(previousAvgs),
  ]);

  for (const zone of allZoneIds) {
    const curr = currentAvgs[zone];
    const prev = previousAvgs[zone];

    if (!curr) continue; // Only show zones active in current period

    const currentAvg = curr.avg;
    const previousAvg = prev?.avg ?? currentAvg;
    const changePct =
      previousAvg > 0
        ? ((currentAvg - previousAvg) / previousAvg) * 100
        : 0;

    let direction: TrendDirection = 'stable';
    if (changePct < -10) direction = 'improving'; // intensity went down = good
    else if (changePct > 10) direction = 'worsening';

    trends.push({
      zone: zone as BodyZoneId,
      label: getZoneLabelById(zone as BodyZoneId),
      direction,
      changePercent: Math.round(changePct),
      currentAvg: Math.round(currentAvg * 10) / 10,
      previousAvg: Math.round(previousAvg * 10) / 10,
      entryCount: curr.count,
    });
  }

  // Sort by entry count * avg intensity (most problematic first)
  trends.sort((a, b) => b.currentAvg * b.entryCount - a.currentAvg * a.entryCount);
  return trends.slice(0, limit);
}

// ─── Aggregate Heatmap Data ──────────────────────────────────────────────────

export type HeatmapZoneData = {
  avgIntensity: number;
  entryCount: number;
  dominantSensation: SensationType;
  maxIntensity: number;
  trend: TrendDirection;
};

/**
 * Get aggregate pain data across all zones for a given period.
 * @param periodDays Number of days to look back, or null for all time
 */
export async function getAggregateHeatmapData(
  periodDays: number | null,
): Promise<Record<BodyZoneId, HeatmapZoneData>> {
  const supabase = getSupabase();
  const now = new Date();

  let query = supabase
    .from('body_map_entries')
    .select('zone, intensity, sensation, recorded_at')
    .order('recorded_at', { ascending: true });

  if (periodDays !== null) {
    const from = new Date(now);
    from.setDate(from.getDate() - periodDays);
    from.setHours(0, 0, 0, 0);
    query = query.gte('recorded_at', from.toISOString());
  }

  const { data, error } = await query;
  if (error || !data) return {} as Record<BodyZoneId, HeatmapZoneData>;

  const entries = data as { zone: string; intensity: number; sensation: string; recorded_at: string }[];
  if (entries.length === 0) return {} as Record<BodyZoneId, HeatmapZoneData>;

  // Group by zone
  const groups: Record<string, typeof entries> = {};
  for (const e of entries) {
    if (!groups[e.zone]) groups[e.zone] = [];
    groups[e.zone].push(e);
  }

  const result: Record<string, HeatmapZoneData> = {};

  for (const [zone, zoneEntries] of Object.entries(groups)) {
    const intensities = zoneEntries.map((e) => e.intensity);
    const avg = intensities.reduce((s, v) => s + v, 0) / intensities.length;
    const max = Math.max(...intensities);

    // Dominant sensation
    const sensationCounts: Record<string, number> = {};
    for (const e of zoneEntries) {
      sensationCounts[e.sensation] = (sensationCounts[e.sensation] || 0) + 1;
    }
    const dominantSensation = Object.entries(sensationCounts).sort(
      (a, b) => b[1] - a[1],
    )[0][0] as SensationType;

    // Trend: compare first half vs second half of period
    let trend: TrendDirection = 'stable';
    if (zoneEntries.length >= 4) {
      const mid = Math.floor(zoneEntries.length / 2);
      const firstHalf = zoneEntries.slice(0, mid);
      const secondHalf = zoneEntries.slice(mid);
      const avgFirst =
        firstHalf.reduce((s, e) => s + e.intensity, 0) / firstHalf.length;
      const avgSecond =
        secondHalf.reduce((s, e) => s + e.intensity, 0) / secondHalf.length;
      const changePct =
        avgFirst > 0 ? ((avgSecond - avgFirst) / avgFirst) * 100 : 0;
      if (changePct < -10) trend = 'improving';
      else if (changePct > 10) trend = 'worsening';
    }

    result[zone] = {
      avgIntensity: Math.round(avg * 10) / 10,
      entryCount: zoneEntries.length,
      dominantSensation,
      maxIntensity: max,
      trend,
    };
  }

  return result as Record<BodyZoneId, HeatmapZoneData>;
}

/** Get weekly summary comparing this week to last week */
export async function getWeeklySummary(): Promise<WeeklySummary> {
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(thisWeekStart.getDate() - 7);
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const [thisWeekAvgs, lastWeekAvgs] = await Promise.all([
    getZoneAveragesForRange(thisWeekStart, now),
    getZoneAveragesForRange(lastWeekStart, thisWeekStart),
  ]);

  // Total entries
  let thisWeekTotal = 0;
  let thisWeekIntensitySum = 0;
  let thisWeekCount = 0;
  let maxZone: string | null = null;
  let maxScore = 0;

  for (const [zone, { avg, count }] of Object.entries(thisWeekAvgs)) {
    thisWeekTotal += count;
    thisWeekIntensitySum += avg * count;
    thisWeekCount += count;
    const score = avg * count;
    if (score > maxScore) {
      maxScore = score;
      maxZone = zone;
    }
  }

  let lastWeekTotal = 0;
  let lastWeekIntensitySum = 0;
  let lastWeekCount = 0;
  for (const { avg, count } of Object.values(lastWeekAvgs)) {
    lastWeekTotal += count;
    lastWeekIntensitySum += avg * count;
    lastWeekCount += count;
  }

  const avgThis = thisWeekCount > 0 ? thisWeekIntensitySum / thisWeekCount : 0;
  const avgLast = lastWeekCount > 0 ? lastWeekIntensitySum / lastWeekCount : 0;

  let overallTrend: TrendDirection = 'stable';
  if (avgLast > 0) {
    const change = ((avgThis - avgLast) / avgLast) * 100;
    if (change < -10) overallTrend = 'improving';
    else if (change > 10) overallTrend = 'worsening';
  }

  return {
    totalEntriesThisWeek: thisWeekTotal,
    totalEntriesLastWeek: lastWeekTotal,
    mostAffectedZone: maxZone ? getZoneLabelById(maxZone as BodyZoneId) : null,
    overallTrend,
    avgIntensityThisWeek: Math.round(avgThis * 10) / 10,
    avgIntensityLastWeek: Math.round(avgLast * 10) / 10,
  };
}
