'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Info, Loader2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ToastProvider';

type ChartPoint = {
  date: string;
  painLevel?: number;
  postureScore?: number;
  symmetryScore?: number;
  energyLevel?: number;
};

const metrics = [
  {
    key: 'painLevel',
    label: 'Pain Level',
    unit: '/10',
    color: '#f97316',
    description: 'Lower is better. Daily pain rating.',
    lowerIsBetter: true,
  },
  {
    key: 'postureScore',
    label: 'Posture Score',
    unit: '/10',
    color: '#14b8a6',
    description: 'Higher is better. AI-assessed posture quality.',
    lowerIsBetter: false,
  },
  {
    key: 'symmetryScore',
    label: 'Symmetry Score',
    unit: '/10',
    color: '#8b5cf6',
    description: 'Higher is better. AI-assessed body symmetry.',
    lowerIsBetter: false,
  },
  {
    key: 'energyLevel',
    label: 'Energy Level',
    unit: '/10',
    color: '#f59e0b',
    description: 'Higher is better. How you feel overall.',
    lowerIsBetter: false,
  },
];

export default function ProgressCharts() {
  const [selectedMetric, setSelectedMetric] = useState('painLevel');
  const [data, setData] = useState<ChartPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { pushToast } = useToast();

  const getChange = (key: string) => {
    const values = data
      .map((point) => point[key as keyof ChartPoint])
      .filter((value): value is number => typeof value === 'number');
    if (values.length < 2) return { value: 0, trend: 'neutral' };
    const first = values[0];
    const last = values[values.length - 1];
    const change = last - first;
    const metric = metrics.find(m => m.key === key);

    let trend: 'improving' | 'declining' | 'neutral' = 'neutral';
    if (Math.abs(change) > 0.5) {
      if (metric?.lowerIsBetter) {
        trend = change < 0 ? 'improving' : 'declining';
      } else {
        trend = change > 0 ? 'improving' : 'declining';
      }
    }

    return { value: change, trend };
  };

  const selectedMetricConfig = metrics.find(m => m.key === selectedMetric)!;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTooltipLabel = (label: ReactNode) => {
    if (typeof label === 'string') return formatDate(label);
    return '';
  };

  const formatTooltipValue = (value: number | string | undefined) => {
    if (typeof value !== 'number') return ['--', selectedMetricConfig.label] as const;
    return [`${value}${selectedMetricConfig.unit}`, selectedMetricConfig.label] as const;
  };

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'improving') return <TrendingUp className="text-green-500" size={20} />;
    if (trend === 'declining') return <TrendingDown className="text-red-500" size={20} />;
    return <Minus className="text-slate-500" size={20} />;
  };

  useEffect(() => {
    let isMounted = true;

    const loadMetrics = async () => {
      const supabase = getSupabase();
      const { data: rows, error } = await supabase
        .from('metrics')
        .select('entry_date, pain_level, posture_score, symmetry_score, energy_level')
        .order('entry_date', { ascending: true });

      if (error) {
        console.error('Failed to load chart metrics', error);
        if (isMounted) {
          setIsLoading(false);
          pushToast('Failed to load chart data.', 'error');
        }
        return;
      }

      const normalized = (rows ?? [])
        .map((row) => ({
          date: row.entry_date,
          painLevel: row.pain_level ?? undefined,
          postureScore: row.posture_score ?? undefined,
          symmetryScore: row.symmetry_score ?? undefined,
          energyLevel: row.energy_level ?? undefined,
        }))
        .filter((point) =>
          typeof point.painLevel === 'number' ||
          typeof point.postureScore === 'number' ||
          typeof point.symmetryScore === 'number' ||
          typeof point.energyLevel === 'number'
        );

      if (isMounted) {
        setData(normalized);
        setIsLoading(false);
      }
    };

    loadMetrics();
    return () => { isMounted = false; };
  }, [pushToast]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-white">Progress Charts</h2>
        <p className="text-slate-400">Visualize your improvement over time</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => {
          const { value, trend } = getChange(metric.key);
          const latestValue = [...data]
            .reverse()
            .map((point) => point[metric.key as keyof ChartPoint])
            .find((val): val is number => typeof val === 'number');

          return (
            <button
              key={metric.key}
              onClick={() => setSelectedMetric(metric.key)}
              className={`bg-slate-900/70 rounded-2xl p-4 border text-left transition-all shadow-lg shadow-black/20 ${
                selectedMetric === metric.key
                  ? 'border-teal-400 ring-1 ring-teal-400/60'
                  : 'border-slate-800/70 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-300 text-sm">{metric.label}</span>
                <TrendIcon trend={trend} />
              </div>
              <div className="text-3xl font-bold" style={{ color: metric.color }}>
                {latestValue !== undefined ? `${latestValue}` : '—'}
                <span className="text-lg text-slate-500">{metric.unit}</span>
              </div>
              <div className={`text-sm mt-1 ${
                trend === 'improving' ? 'text-green-400' :
                trend === 'declining' ? 'text-red-400' :
                'text-slate-500'
              }`}>
                {data.length >= 2 ? `${value > 0 ? '+' : ''}${value.toFixed(1)} since start` : 'Needs more data'}
              </div>
            </button>
          );
        })}
      </div>

      {/* Main chart */}
      <div className="bg-slate-900/70 rounded-2xl p-6 border border-slate-800/70 shadow-lg shadow-black/20">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white">{selectedMetricConfig.label} Over Time</h3>
            <p className="text-sm text-slate-400 flex items-center gap-1">
              <Info size={14} />
              {selectedMetricConfig.description}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading chart data...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400">
            No data yet. Upload photos or add daily check-ins to see charts.
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`gradient-${selectedMetric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={selectedMetricConfig.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={selectedMetricConfig.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tickFormatter={formatDate} stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} domain={[0, 10]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                  labelFormatter={formatTooltipLabel}
                  formatter={formatTooltipValue}
                />
                <Area type="monotone" dataKey={selectedMetric} stroke={selectedMetricConfig.color} strokeWidth={2} fill={`url(#gradient-${selectedMetric})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* All metrics chart */}
      <div className="bg-slate-900/70 rounded-2xl p-6 border border-slate-800/70 shadow-lg shadow-black/20">
        <h3 className="text-lg font-semibold text-white mb-6">All Metrics Comparison</h3>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400">
            No data yet.
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tickFormatter={formatDate} stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} domain={[0, 10]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                  labelFormatter={formatTooltipLabel}
                />
                {metrics.map((metric) => (
                  <Line key={metric.key} type="monotone" dataKey={metric.key} name={metric.label} stroke={metric.color} strokeWidth={2} dot={{ fill: metric.color, strokeWidth: 2, r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="flex flex-wrap gap-4 mt-4 justify-center">
          {metrics.map((metric) => (
            <div key={metric.key} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: metric.color }} />
              <span className="text-sm text-slate-400">{metric.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
