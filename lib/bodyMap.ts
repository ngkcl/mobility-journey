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
