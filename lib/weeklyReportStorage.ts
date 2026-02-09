/**
 * Storage layer for weekly reports.
 * Handles persistence to Supabase and report retrieval.
 */

import { getSupabase } from './supabase';
import type { WeeklyReport } from './weeklyReport';

interface WeeklyReportRow {
  id: string;
  week_start: string;
  week_end: string;
  report_json: WeeklyReport;
  created_at: string;
  shared_at: string | null;
}

/**
 * Save a generated report to Supabase.
 * Uses upsert to handle regeneration of existing reports.
 */
export async function saveReport(report: WeeklyReport): Promise<{ id: string } | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('weekly_reports')
    .upsert(
      {
        week_start: report.weekStart,
        week_end: report.weekEnd,
        report_json: report,
      },
      { onConflict: 'week_start' }
    )
    .select('id')
    .single();

  if (error) {
    console.error('Failed to save weekly report:', error);
    return null;
  }

  return { id: data.id };
}

/**
 * Get a report for a specific week.
 * @param weekStart - ISO date string (YYYY-MM-DD)
 */
export async function getReport(weekStart: string): Promise<WeeklyReport | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('weekly_reports')
    .select('report_json')
    .eq('week_start', weekStart)
    .single();

  if (error || !data) {
    return null;
  }

  return data.report_json as WeeklyReport;
}

/**
 * Check if a report exists for a given week.
 */
export async function reportExists(weekStart: string): Promise<boolean> {
  const supabase = getSupabase();

  const { count, error } = await supabase
    .from('weekly_reports')
    .select('id', { count: 'exact', head: true })
    .eq('week_start', weekStart);

  if (error) {
    return false;
  }

  return (count ?? 0) > 0;
}

/**
 * List recent reports, most recent first.
 */
export async function listReports(limit: number = 12): Promise<WeeklyReportRow[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('weekly_reports')
    .select('id, week_start, week_end, report_json, created_at, shared_at')
    .order('week_start', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data as WeeklyReportRow[];
}

/**
 * Delete a report by ID.
 */
export async function deleteReport(id: string): Promise<boolean> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('weekly_reports')
    .delete()
    .eq('id', id);

  return !error;
}

/**
 * Mark a report as shared (updates shared_at timestamp).
 */
export async function markReportShared(weekStart: string): Promise<boolean> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('weekly_reports')
    .update({ shared_at: new Date().toISOString() })
    .eq('week_start', weekStart);

  return !error;
}

/**
 * Get the most recent report.
 */
export async function getLatestReport(): Promise<WeeklyReport | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('weekly_reports')
    .select('report_json')
    .order('week_start', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return data.report_json as WeeklyReport;
}

/**
 * Generate and save a report if it doesn't already exist.
 * Returns the report (either new or existing).
 */
export async function getOrGenerateReport(weekStart: Date): Promise<WeeklyReport> {
  const { generateWeeklyReport } = await import('./weeklyReport');
  
  const weekStartStr = formatDateKey(weekStart);
  
  // Check if already exists
  const existing = await getReport(weekStartStr);
  if (existing) {
    return existing;
  }

  // Generate new report
  const report = await generateWeeklyReport(weekStart);
  
  // Save it
  await saveReport(report);
  
  return report;
}

// Helper to format date as YYYY-MM-DD
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the start of the current week (Monday).
 */
export function getCurrentWeekStart(): Date {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Get the start of last week (Monday).
 */
export function getLastWeekStart(): Date {
  const current = getCurrentWeekStart();
  current.setDate(current.getDate() - 7);
  return current;
}

/**
 * Check if we should auto-generate last week's report.
 * Returns true if it's Monday-Tuesday and no report exists for last week.
 */
export async function shouldAutoGenerateReport(): Promise<{
  should: boolean;
  weekStart: Date | null;
}> {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Only auto-generate on Monday (1) or Tuesday (2)
  if (dayOfWeek !== 1 && dayOfWeek !== 2) {
    return { should: false, weekStart: null };
  }

  const lastWeekStart = getLastWeekStart();
  const exists = await reportExists(formatDateKey(lastWeekStart));

  return {
    should: !exists,
    weekStart: exists ? null : lastWeekStart,
  };
}
