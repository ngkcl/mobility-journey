import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { analyzeMetricTrends, METRIC_CONFIGS } from '@/lib/trends';

const METRIC_FIELDS = METRIC_CONFIGS.map((config) => config.key);
const MAX_HISTORY = 90;

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    type MetricRow = { entry_date: string } & Record<string, number | null>;
    const { data: rows, error } = await supabase
      .from('metrics')
      .select(['entry_date', ...METRIC_FIELDS].join(','))
      .order('entry_date', { ascending: true })
      .limit(MAX_HISTORY);

    if (error) {
      return NextResponse.json({ error: 'Failed to load metrics', details: error.message }, { status: 500 });
    }

    const metricsRows = (rows ?? []) as unknown as MetricRow[];
    const trends = analyzeMetricTrends(metricsRows, METRIC_CONFIGS, { maxEntries: 14 });

    if (trends.length === 0) {
      return NextResponse.json({ message: 'Not enough data to compute trends', trends: [] });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('trends')
      .upsert(trends, { onConflict: 'metric_key,window_start,window_end' })
      .select();

    if (insertError) {
      return NextResponse.json({ error: 'Failed to save trends', details: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      trends: inserted ?? trends,
      computed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Trend analysis error:', error);
    return NextResponse.json(
      { error: 'Trend analysis failed', details: String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const { data: trends, error } = await supabase
      .from('trends')
      .select('*')
      .order('window_end', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to load trends', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ trends: trends ?? [] });
  } catch (error) {
    console.error('Trend fetch error:', error);
    return NextResponse.json(
      { error: 'Trend fetch failed', details: String(error) },
      { status: 500 },
    );
  }
}
