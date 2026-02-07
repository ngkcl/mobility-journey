import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getLatestTrends } from '@/lib/dashboardMetrics';
import { parseInsightList } from '@/lib/trendInsights';
import { getRequestIp, rateLimit } from '@/lib/rateLimit';

const METRIC_LABELS: Record<string, string> = {
  pain_level: 'Pain level',
  posture_score: 'Posture score',
  symmetry_score: 'Symmetry score',
  energy_level: 'Energy level',
  exercise_minutes: 'Exercise minutes',
  rom_forward_bend: 'Forward bend ROM',
  rom_lateral: 'Lateral ROM',
};

const INSIGHT_PROMPT = `You are a physiotherapy coach writing short, data-driven trend insights.

Use ONLY the provided trend summaries. Each insight must:
- Be a single sentence.
- Mention the metric name and direction (improving/worsening/stable).
- Reference the change magnitude and the time window.
- Avoid medical advice or prescriptions.

Return a JSON array of 3-5 concise sentences only.`;

type TrendRow = {
  metric_key: string;
  trend: 'improving' | 'worsening' | 'stable';
  change_value?: number | null;
  change_percent?: number | null;
  start_avg?: number | null;
  end_avg?: number | null;
  window_start?: string | null;
  window_end?: string | null;
  sample_size?: number | null;
  lower_is_better?: boolean | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function formatTrendPayload(trends: TrendRow[]) {
  const latest = Array.from(getLatestTrends(trends).values()) as TrendRow[];
  return latest
    .map((trend) => ({
      metric_key: trend.metric_key,
      metric_label: METRIC_LABELS[trend.metric_key] ?? trend.metric_key,
      trend: trend.trend,
      change_value: trend.change_value ?? null,
      change_percent: trend.change_percent ?? null,
      start_avg: trend.start_avg ?? null,
      end_avg: trend.end_avg ?? null,
      window_start: trend.window_start ?? null,
      window_end: trend.window_end ?? null,
      sample_size: trend.sample_size ?? null,
      lower_is_better: trend.lower_is_better ?? null,
    }))
    .filter((trend) => trend.window_start && trend.window_end);
}

function parseCachedInsights(content: string | null | undefined) {
  if (!content) return [];
  return parseInsightList(content);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ insights: [], message: 'Supabase not configured' }, { status: 200 });
    }

    const url = new URL(request.url);
    const force = url.searchParams.get('force') === '1';
    const today = new Date().toISOString().split('T')[0];

    if (!force) {
      const { data: cached, error: cacheError } = await supabase
        .from('analysis_logs')
        .select('content')
        .eq('entry_date', today)
        .eq('category', 'ai')
        .eq('title', 'AI Trend Insights')
        .limit(1);

      if (cacheError) {
        console.error('Failed to load cached trend insights', cacheError);
      }

      const cachedContent = cached?.[0]?.content;
      const cachedInsights = parseCachedInsights(cachedContent);

      if (cachedInsights.length > 0) {
        return NextResponse.json({ insights: cachedInsights, cached: true });
      }
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ insights: [], message: 'ANTHROPIC_API_KEY not configured' }, { status: 200 });
    }

    const { data: trends, error } = await supabase
      .from('trends')
      .select('metric_key, trend, change_value, change_percent, start_avg, end_avg, window_start, window_end, sample_size, lower_is_better')
      .order('window_end', { ascending: false });

    if (error) {
      return NextResponse.json({ insights: [], error: 'Failed to load trends', details: error.message }, { status: 500 });
    }

    const payload = formatTrendPayload(trends ?? []);
    if (payload.length === 0) {
      return NextResponse.json({ insights: [], message: 'Not enough trend data to generate insights' }, { status: 200 });
    }

    const ip = getRequestIp(request);
    const limit = rateLimit(`${ip}:trend-insights`, { windowMs: 15 * 60 * 1000, max: 3 });
    if (!limit.allowed) {
      return NextResponse.json(
        { insights: [], error: 'Rate limit exceeded', retry_after_seconds: limit.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-0520',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${INSIGHT_PROMPT}\n\nTrend summaries:\n${JSON.stringify(payload, null, 2)}`,
            },
          ],
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.type === 'text' ? block.text : '')
      .join('\n')
      .trim();

    const insights = parseInsightList(text).slice(0, 5);
    if (insights.length > 0) {
      const content = insights.map((insight: string) => `- ${insight}`).join('\n');
      const { error: insertError } = await supabase.from('analysis_logs').insert({
        entry_date: today,
        category: 'ai',
        title: 'AI Trend Insights',
        content,
      });

      if (insertError) {
        console.error('Failed to cache trend insights', insertError);
      }
    }

    return NextResponse.json({
      insights,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Trend insight error:', error);
    return NextResponse.json(
      { insights: [], error: 'Trend insight generation failed', details: String(error) },
      { status: 500 },
    );
  }
}
