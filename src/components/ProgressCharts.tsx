'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

type ChartPoint = {
  date: string;
  cobbAngle?: number;
  painLevel?: number;
  flexibility?: number;
};

const metrics = [
  { 
    key: 'cobbAngle', 
    label: 'Cobb Angle', 
    unit: '°', 
    color: '#3b82f6',
    description: 'Lower is better. Measures spinal curvature.',
    lowerIsBetter: true,
  },
  { 
    key: 'painLevel', 
    label: 'Pain Level', 
    unit: '/10', 
    color: '#ef4444',
    description: 'Lower is better. Daily pain rating.',
    lowerIsBetter: true,
  },
  { 
    key: 'flexibility', 
    label: 'Flexibility', 
    unit: '/10', 
    color: '#22c55e',
    description: 'Higher is better. Overall flexibility score.',
    lowerIsBetter: false,
  },
];

export default function ProgressCharts() {
  const [selectedMetric, setSelectedMetric] = useState('cobbAngle');
  const [data, setData] = useState<ChartPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'improving') return <TrendingUp className="text-green-500" size={20} />;
    if (trend === 'declining') return <TrendingDown className="text-red-500" size={20} />;
    return <Minus className="text-gray-500" size={20} />;
  };

  useEffect(() => {
    let isMounted = true;

    const loadMetrics = async () => {
      const { data: rows, error } = await supabase
        .from('metrics')
        .select('entry_date, cobb_angle, pain_level, flexibility')
        .order('entry_date', { ascending: true });

      if (error) {
        console.error('Failed to load chart metrics', error);
        if (isMounted) setIsLoading(false);
        return;
      }

      const normalized = (rows ?? [])
        .map((row) => ({
          date: row.entry_date,
          cobbAngle: row.cobb_angle ?? undefined,
          painLevel: row.pain_level ?? undefined,
          flexibility: row.flexibility ?? undefined,
        }))
        .filter((point) =>
          typeof point.cobbAngle === 'number' ||
          typeof point.painLevel === 'number' ||
          typeof point.flexibility === 'number'
        );

      if (isMounted) {
        setData(normalized);
        setIsLoading(false);
      }
    };

    loadMetrics();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Progress Charts</h2>
        <p className="text-gray-400">Visualize your improvement over time</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              className={`bg-gray-900 rounded-xl p-4 border text-left transition-all ${
                selectedMetric === metric.key 
                  ? 'border-blue-500 ring-1 ring-blue-500' 
                  : 'border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400">{metric.label}</span>
                <TrendIcon trend={trend} />
              </div>
              <div className="text-3xl font-bold" style={{ color: metric.color }}>
                {latestValue !== undefined ? `${latestValue}${metric.unit}` : '—'}
              </div>
              <div className={`text-sm mt-1 ${
                trend === 'improving' ? 'text-green-400' : 
                trend === 'declining' ? 'text-red-400' : 
                'text-gray-500'
              }`}>
                {value > 0 ? '+' : ''}{value.toFixed(1)} since start
              </div>
            </button>
          );
        })}
      </div>

      {/* Main chart */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white">{selectedMetricConfig.label} Over Time</h3>
            <p className="text-sm text-gray-400 flex items-center gap-1">
              <Info size={14} />
              {selectedMetricConfig.description}
            </p>
          </div>
        </div>
        
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-gray-400">
            Loading chart data...
          </div>
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400">
            No data yet. Add metrics to see your progress chart.
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
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatDate}
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                />
                <YAxis 
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  domain={['auto', 'auto']}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  labelFormatter={formatDate}
                  formatter={(value: number) => [`${value}${selectedMetricConfig.unit}`, selectedMetricConfig.label]}
                />
                <Area 
                  type="monotone" 
                  dataKey={selectedMetric} 
                  stroke={selectedMetricConfig.color}
                  strokeWidth={2}
                  fill={`url(#gradient-${selectedMetric})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* All metrics chart */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-6">All Metrics Comparison</h3>
        
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-gray-400">
            Loading chart data...
          </div>
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400">
            No data yet. Add metrics to see comparison chart.
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatDate}
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                />
                <YAxis 
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  labelFormatter={formatDate}
                />
                {metrics.map((metric) => (
                  <Line 
                    key={metric.key}
                    type="monotone" 
                    dataKey={metric.key} 
                    name={metric.label}
                    stroke={metric.color}
                    strokeWidth={2}
                    dot={{ fill: metric.color, strokeWidth: 2, r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 justify-center">
          {metrics.map((metric) => (
            <div key={metric.key} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: metric.color }} />
              <span className="text-sm text-gray-400">{metric.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
