import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
  buildWeeklySummaryFallback,
  buildWeeklySummaryPrompt,
  computeWeeklyMetricChanges,
} from '@/lib/weeklySummary';
import { getRequestIp, rateLimit } from '@/lib/rateLimit';

const SUMMARY_TITLE = 'Weekly Summary';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function toDateString(date: Date) {
  return date.toISOString().split('T')[0];
}

function parseDateParam(value: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getWeekRange(endDate: Date) {
  const weekEnd = new Date(endDate);
  const weekStart = new Date(endDate);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  return {
    weekStart: toDateString(weekStart),
    weekEnd: toDateString(weekEnd),
  };
}

function extractHighlights(rows: Array<{ title?: string | null; content?: string | null }> = []) {
  const highlights: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row) => {
    if (highlights.length >= 5) return;

    if (row.title && !seen.has(row.title)) {
      highlights.push(row.title);
      seen.add(row.title);
      return;
    }

    const content = row.content || '';
    const bullets = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- ') || line.startsWith('• '))
      .map((line) => line.replace(/^[-•]\s+/, '').trim())
      .filter(Boolean);

    if (bullets.length > 0) {
      bullets.forEach((bullet) => {
        if (highlights.length >= 5) return;
        if (!seen.has(bullet)) {
          highlights.push(bullet);
          seen.add(bullet);
        }
      });
      return;
    }

    const fallback = content
      .split(/\.|\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (fallback && !seen.has(fallback)) {
      highlights.push(fallback);
      seen.add(fallback);
    }
  });

  return highlights.slice(0, 5);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ summary: null, message: 'Supabase not configured' }, { status: 200 });
    }

    const url = new URL(request.url);
    const force = url.searchParams.get('force') === '1';
    const dateParam = url.searchParams.get('date');
    const baseDate = parseDateParam(dateParam) ?? new Date();

    const isSunday = baseDate.getUTCDay() === 0;
    if (!force && !isSunday) {
      return NextResponse.json(
        {
          summary: null,
          message: 'Weekly summary runs on Sundays. Use ?force=1 for on-demand generation.',
        },
        { status: 200 },
      );
    }

    const { weekStart, weekEnd } = getWeekRange(baseDate);

    if (!force) {
      const { data: cached } = await supabase
        .from('analysis_logs')
        .select('content')
        .eq('entry_date', weekEnd)
        .eq('category', 'ai')
        .eq('title', SUMMARY_TITLE)
        .limit(1);

      if (cached?.[0]?.content) {
        return NextResponse.json({
          summary: cached[0].content,
          cached: true,
          week_start: weekStart,
          week_end: weekEnd,
        });
      }
    }

    const rangeStart = `${weekStart}T00:00:00.000Z`;
    const rangeEnd = `${weekEnd}T23:59:59.999Z`;

    const [metricsRes, photosRes, todosRes, aiRes] = await Promise.all([
      supabase
        .from('metrics')
        .select('entry_date, pain_level, posture_score, symmetry_score, energy_level, exercise_minutes, rom_forward_bend, rom_lateral')
        .gte('entry_date', weekStart)
        .lte('entry_date', weekEnd)
        .order('entry_date', { ascending: true }),
      supabase
        .from('photos')
        .select('id, taken_at')
        .gte('taken_at', rangeStart)
        .lte('taken_at', rangeEnd),
      supabase
        .from('todos')
        .select('id, completed_at, category, completed')
        .eq('category', 'exercise')
        .eq('completed', true)
        .gte('completed_at', rangeStart)
        .lte('completed_at', rangeEnd),
      supabase
        .from('analysis_logs')
        .select('title, content')
        .eq('category', 'ai')
        .gte('entry_date', weekStart)
        .lte('entry_date', weekEnd)
        .neq('title', SUMMARY_TITLE)
        .neq('title', 'AI Trend Insights')
        .order('entry_date', { ascending: false }),
    ]);

    if (metricsRes.error || photosRes.error || todosRes.error || aiRes.error) {
      const details = {
        metrics: metricsRes.error?.message,
        photos: photosRes.error?.message,
        todos: todosRes.error?.message,
        ai: aiRes.error?.message,
      };
      return NextResponse.json(
        { summary: null, error: 'Failed to load weekly summary data', details },
        { status: 500 },
      );
    }

    const metricsRows = metricsRes.data ?? [];
    const metricsChanges = computeWeeklyMetricChanges(metricsRows);
    const photosTaken = photosRes.data?.length ?? 0;
    const exercisesCompleted = todosRes.data?.length ?? 0;
    const aiHighlights = extractHighlights(aiRes.data ?? []);

    const ip = getRequestIp(request);
    const limit = rateLimit(`${ip}:weekly-summary`, { windowMs: 60 * 60 * 1000, max: 2 });
    if (!limit.allowed) {
      return NextResponse.json(
        { summary: null, error: 'Rate limit exceeded', retry_after_seconds: limit.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    let summary = '';
    let modelUsed: string | null = null;

    if (anthropicKey) {
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const prompt = buildWeeklySummaryPrompt({
        weekStart,
        weekEnd,
        metricsChanges,
        photosTaken,
        exercisesCompleted,
        aiHighlights,
      });

      const response = await anthropic.messages.create({
        model: 'claude-opus-4-0520',
        max_tokens: 700,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: prompt }],
          },
        ],
      });

      summary = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n')
        .trim();
      modelUsed = 'claude-opus-4-0520';
    } else {
      summary = buildWeeklySummaryFallback({
        weekStart,
        weekEnd,
        metricsChanges,
        photosTaken,
        exercisesCompleted,
        aiHighlights,
      });
    }

    if (!summary) {
      summary = buildWeeklySummaryFallback({
        weekStart,
        weekEnd,
        metricsChanges,
        photosTaken,
        exercisesCompleted,
        aiHighlights,
      });
    }

    const { error: deleteError } = await supabase
      .from('analysis_logs')
      .delete()
      .eq('entry_date', weekEnd)
      .eq('title', SUMMARY_TITLE);

    if (deleteError) {
      return NextResponse.json(
        { summary: null, error: 'Failed to clear previous weekly summary', details: deleteError.message },
        { status: 500 },
      );
    }

    const { error: insertError } = await supabase.from('analysis_logs').insert({
      entry_date: weekEnd,
      category: 'ai',
      title: SUMMARY_TITLE,
      content: summary,
    });

    if (insertError) {
      return NextResponse.json(
        { summary: null, error: 'Failed to store weekly summary', details: insertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      summary,
      week_start: weekStart,
      week_end: weekEnd,
      metrics_changes: metricsChanges,
      photos_taken: photosTaken,
      exercises_completed: exercisesCompleted,
      ai_highlights: aiHighlights,
      generated_at: new Date().toISOString(),
      model: modelUsed,
    });
  } catch (error) {
    console.error('Weekly summary error:', error);
    return NextResponse.json(
      { error: 'Weekly summary generation failed', details: String(error) },
      { status: 500 },
    );
  }
}
