import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getSupabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import type { ChartPoint, PostureSession } from '../../lib/types';
import { useNavigation } from 'expo-router';
import { buildPostureTrend, type PostureTrendMode } from '../../lib/postureSessions';

const screenWidth = Dimensions.get('window').width - 32;

const metrics = [
  {
    key: 'painLevel' as const,
    label: 'Pain Level',
    unit: '/10',
    color: '#f97316',
    description: 'Lower is better.',
    lowerIsBetter: true,
  },
  {
    key: 'postureScore' as const,
    label: 'Posture',
    unit: '/10',
    color: '#14b8a6',
    description: 'Higher is better.',
    lowerIsBetter: false,
  },
  {
    key: 'symmetryScore' as const,
    label: 'Symmetry',
    unit: '/10',
    color: '#8b5cf6',
    description: 'Higher is better.',
    lowerIsBetter: false,
  },
  {
    key: 'energyLevel' as const,
    label: 'Energy',
    unit: '/10',
    color: '#f59e0b',
    description: 'Higher is better.',
    lowerIsBetter: false,
  },
];

const chartConfig = {
  backgroundGradientFrom: '#0f172a',
  backgroundGradientTo: '#0f172a',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(20, 184, 166, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
  style: { borderRadius: 16 },
  propsForDots: { r: '4', strokeWidth: '2', stroke: '#14b8a6' },
  propsForBackgroundLines: { strokeDasharray: '3 3', stroke: '#334155' },
};

export default function ChartsScreen() {
  const [selectedMetric, setSelectedMetric] = useState<string>('painLevel');
  const [data, setData] = useState<ChartPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [postureSessions, setPostureSessions] = useState<PostureSession[]>([]);
  const [postureTrendMode, setPostureTrendMode] = useState<PostureTrendMode>('weekly');
  const { pushToast } = useToast();
  const navigation = useNavigation();

  const loadMetrics = async () => {
    const supabase = getSupabase();
    const [metricsResponse, postureResponse] = await Promise.all([
      supabase
        .from('metrics')
        .select('entry_date, pain_level, posture_score, symmetry_score, energy_level')
        .order('entry_date', { ascending: true }),
      supabase
        .from('posture_sessions')
        .select('id, started_at, ended_at, duration_seconds, good_posture_pct')
        .order('started_at', { ascending: true }),
    ]);

    if (metricsResponse.error) {
      pushToast('Failed to load chart data.', 'error');
    }

    if (postureResponse.error) {
      pushToast('Failed to load posture trends.', 'error');
    }

    const normalized = (metricsResponse.data ?? [])
      .map((row: any) => ({
        date: row.entry_date,
        painLevel: row.pain_level ?? undefined,
        postureScore: row.posture_score ?? undefined,
        symmetryScore: row.symmetry_score ?? undefined,
        energyLevel: row.energy_level ?? undefined,
      }))
      .filter(
        (point: ChartPoint) =>
          typeof point.painLevel === 'number' ||
          typeof point.postureScore === 'number' ||
          typeof point.symmetryScore === 'number' ||
          typeof point.energyLevel === 'number',
      );

    setData(normalized);
    setPostureSessions((postureResponse.data ?? []) as PostureSession[]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMetrics();
    setRefreshing(false);
  };

  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const supabase = getSupabase();
      const [photos, videos, metricsRows, analysisLogs, todos, postureSessions] = await Promise.all([
        supabase.from('photos').select('*').order('taken_at', { ascending: true }),
        supabase.from('videos').select('*').order('recorded_at', { ascending: true }),
        supabase.from('metrics').select('*').order('entry_date', { ascending: true }),
        supabase.from('analysis_logs').select('*').order('entry_date', { ascending: true }),
        supabase.from('todos').select('*').order('due_date', { ascending: true }),
        supabase.from('posture_sessions').select('*').order('started_at', { ascending: true }),
      ]);

      const errors = [
        photos.error,
        videos.error,
        metricsRows.error,
        analysisLogs.error,
        todos.error,
        postureSessions.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        pushToast('Failed to export data. Please try again.', 'error');
        return;
      }

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        photos: photos.data ?? [],
        videos: videos.data ?? [],
        metrics: metricsRows.data ?? [],
        analysisLogs: analysisLogs.data ?? [],
        todos: todos.data ?? [],
        postureSessions: postureSessions.data ?? [],
      };

      const fileName = `mobility-export-${exportPayload.exportedAt.replace(
        /[:.]/g,
        '-',
      )}.json`;
      const json = JSON.stringify(exportPayload, null, 2);

      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        pushToast('Export ready for download.', 'success');
      } else {
        const fileUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, json, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          pushToast('Sharing is unavailable on this device.', 'error');
          return;
        }
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Mobility Data',
          UTI: 'public.json',
        });
        pushToast('Export ready to share.', 'success');
      }
    } catch (error) {
      pushToast('Failed to export data. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, pushToast]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={handleExport}
          disabled={isExporting}
          className="mr-4 flex-row items-center rounded-full bg-slate-900 px-3 py-1.5 border border-slate-800"
        >
          {isExporting ? (
            <ActivityIndicator color="#5eead4" />
          ) : (
            <Ionicons name="download-outline" size={16} color="#5eead4" />
          )}
          <Text className="text-sm text-teal-200 ml-2">Export</Text>
        </Pressable>
      ),
    });
  }, [handleExport, isExporting, navigation]);

  const postureTrend = useMemo(
    () => buildPostureTrend(postureSessions, postureTrendMode),
    [postureSessions, postureTrendMode],
  );
  const postureTrendValues = postureTrend.map((point) =>
    Number.isFinite(point.value) ? Number(point.value.toFixed(1)) : 0,
  );
  const postureTrendLabels = postureTrend.map((point) => {
    const date = new Date(point.date);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  });

  const selectedConfig = metrics.find((m) => m.key === selectedMetric)!;

  const getChange = (key: string) => {
    const values = data
      .map((point) => point[key as keyof ChartPoint])
      .filter((v): v is number => typeof v === 'number');
    if (values.length < 2) return { value: 0, trend: 'neutral' as const };
    const first = values[0];
    const last = values[values.length - 1];
    const change = last - first;
    const metric = metrics.find((m) => m.key === key);

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

  // Build chart data for selected metric
  const chartValues = data
    .map((point) => point[selectedMetric as keyof ChartPoint])
    .filter((v): v is number => typeof v === 'number');

  const chartLabels = data
    .filter((point) => typeof point[selectedMetric as keyof ChartPoint] === 'number')
    .map((point) => {
      const d = new Date(point.date);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });

  // Only show last 10 labels to avoid crowding
  const maxLabels = 10;
  const displayLabels =
    chartLabels.length > maxLabels
      ? chartLabels.map((label, i) =>
          i % Math.ceil(chartLabels.length / maxLabels) === 0 ? label : '',
        )
      : chartLabels;
  const postureDisplayLabels =
    postureTrendLabels.length > maxLabels
      ? postureTrendLabels.map((label, i) =>
          i % Math.ceil(postureTrendLabels.length / maxLabels) === 0 ? label : '',
        )
      : postureTrendLabels;

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'improving')
      return <Ionicons name="trending-up" size={18} color="#22c55e" />;
    if (trend === 'declining')
      return <Ionicons name="trending-down" size={18} color="#ef4444" />;
    return <Ionicons name="remove" size={18} color="#64748b" />;
  };

  return (
    <ScrollView
      className="flex-1 bg-slate-950"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5eead4" />
      }
    >
      <View className="mb-6">
        <Text className="text-2xl font-semibold text-white">Progress Charts</Text>
        <Text className="text-slate-400 text-sm">Visualize your improvement over time</Text>
      </View>

      <View className="bg-slate-900 rounded-2xl p-4 border border-slate-800 mb-6">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-lg font-semibold text-white">Data Export</Text>
            <Text className="text-sm text-slate-400 mt-1">
              Share a JSON backup of all your mobility data.
            </Text>
          </View>
          <Pressable
            onPress={handleExport}
            disabled={isExporting}
            className="bg-teal-500/20 border border-teal-400/40 rounded-full px-4 py-2"
          >
            {isExporting ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color="#5eead4" />
                <Text className="text-sm text-teal-100">Exporting</Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-2">
                <Ionicons name="download-outline" size={16} color="#5eead4" />
                <Text className="text-sm text-teal-100">Export</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <View className="bg-slate-900 rounded-2xl p-4 border border-slate-800 mb-6">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-lg font-semibold text-white">Posture Monitoring Trend</Text>
            <Text className="text-sm text-slate-400">Average good posture %</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => setPostureTrendMode('daily')}
              className={`px-3 py-1 rounded-full border ${
                postureTrendMode === 'daily'
                  ? 'border-teal-400 bg-teal-500/20'
                  : 'border-slate-700'
              }`}
            >
              <Text className="text-xs text-slate-200">Daily</Text>
            </Pressable>
            <Pressable
              onPress={() => setPostureTrendMode('weekly')}
              className={`px-3 py-1 rounded-full border ${
                postureTrendMode === 'weekly'
                  ? 'border-teal-400 bg-teal-500/20'
                  : 'border-slate-700'
              }`}
            >
              <Text className="text-xs text-slate-200">Weekly</Text>
            </Pressable>
          </View>
        </View>

        {isLoading ? (
          <View className="h-52 items-center justify-center gap-2">
            <ActivityIndicator color="#5eead4" />
            <Text className="text-slate-400 text-sm">Loading posture trend...</Text>
          </View>
        ) : postureTrendValues.length === 0 ? (
          <View className="h-52 items-center justify-center">
            <Text className="text-slate-400">No posture sessions yet.</Text>
          </View>
        ) : (
          <LineChart
            data={{
              labels: postureDisplayLabels,
              datasets: [
                {
                  data: postureTrendValues,
                  color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
                  strokeWidth: 2,
                },
              ],
            }}
            width={screenWidth - 32}
            height={220}
            yAxisSuffix="%"
            yAxisInterval={1}
            chartConfig={{
              ...chartConfig,
              color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
              propsForDots: { r: '4', strokeWidth: '2', stroke: '#22c55e' },
            }}
            bezier
            style={{ borderRadius: 16 }}
            fromZero
          />
        )}
      </View>

      {/* Metric selector cards */}
      <View className="flex-row flex-wrap gap-3 mb-6">
        {metrics.map((metric) => {
          const { value, trend } = getChange(metric.key);
          const latestValue = [...data]
            .reverse()
            .map((p) => p[metric.key as keyof ChartPoint])
            .find((v): v is number => typeof v === 'number');

          return (
            <Pressable
              key={metric.key}
              onPress={() => setSelectedMetric(metric.key)}
              className={`flex-1 min-w-[140px] bg-slate-900 rounded-2xl p-4 border ${
                selectedMetric === metric.key
                  ? 'border-teal-400'
                  : 'border-slate-800'
              }`}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-slate-300 text-sm">{metric.label}</Text>
                <TrendIcon trend={trend} />
              </View>
              <Text className="text-3xl font-bold" style={{ color: metric.color }}>
                {latestValue !== undefined ? `${latestValue}` : '—'}
                <Text className="text-lg text-slate-500">{metric.unit}</Text>
              </Text>
              <Text
                className={`text-sm mt-1 ${
                  trend === 'improving'
                    ? 'text-green-400'
                    : trend === 'declining'
                      ? 'text-red-400'
                      : 'text-slate-500'
                }`}
              >
                {data.length >= 2
                  ? `${value > 0 ? '+' : ''}${value.toFixed(1)} since start`
                  : 'Needs more data'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Main chart */}
      <View className="bg-slate-900 rounded-2xl p-4 border border-slate-800 mb-6">
        <View className="mb-4">
          <Text className="text-lg font-semibold text-white">
            {selectedConfig.label} Over Time
          </Text>
          <View className="flex-row items-center gap-1 mt-1">
            <Ionicons name="information-circle-outline" size={14} color="#94a3b8" />
            <Text className="text-sm text-slate-400">{selectedConfig.description}</Text>
          </View>
        </View>

        {isLoading ? (
          <View className="h-52 items-center justify-center gap-2">
            <ActivityIndicator color="#5eead4" />
            <Text className="text-slate-400 text-sm">Loading chart data...</Text>
          </View>
        ) : chartValues.length === 0 ? (
          <View className="h-52 items-center justify-center">
            <Text className="text-slate-400">
              No data yet. Add daily check-ins to see charts.
            </Text>
          </View>
        ) : (
          <LineChart
            data={{
              labels: displayLabels,
              datasets: [
                {
                  data: chartValues,
                  color: (opacity = 1) => {
                    const c = selectedConfig.color;
                    // Convert hex to rgba
                    const r = parseInt(c.slice(1, 3), 16);
                    const g = parseInt(c.slice(3, 5), 16);
                    const b = parseInt(c.slice(5, 7), 16);
                    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
                  },
                  strokeWidth: 2,
                },
              ],
            }}
            width={screenWidth - 32}
            height={220}
            yAxisSuffix=""
            yAxisInterval={1}
            chartConfig={{
              ...chartConfig,
              color: (opacity = 1) => {
                const c = selectedConfig.color;
                const r = parseInt(c.slice(1, 3), 16);
                const g = parseInt(c.slice(3, 5), 16);
                const b = parseInt(c.slice(5, 7), 16);
                return `rgba(${r}, ${g}, ${b}, ${opacity})`;
              },
            }}
            bezier
            style={{ borderRadius: 16 }}
            fromZero
          />
        )}
      </View>

      {/* All metrics comparison */}
      <View className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
        <Text className="text-lg font-semibold text-white mb-4">All Metrics Comparison</Text>

        {isLoading ? (
          <View className="h-52 items-center justify-center">
            <ActivityIndicator color="#5eead4" />
          </View>
        ) : data.length === 0 ? (
          <View className="h-52 items-center justify-center">
            <Text className="text-slate-400">No data yet.</Text>
          </View>
        ) : (
          <>
            <LineChart
              data={{
                labels: displayLabels,
                datasets: metrics
                  .map((metric) => {
                    const values = data
                      .map((p) => p[metric.key as keyof ChartPoint])
                      .map((v) => (typeof v === 'number' ? v : 0));
                    const r = parseInt(metric.color.slice(1, 3), 16);
                    const g = parseInt(metric.color.slice(3, 5), 16);
                    const b = parseInt(metric.color.slice(5, 7), 16);
                    return {
                      data: values.length > 0 ? values : [0],
                      color: (opacity = 1) => `rgba(${r}, ${g}, ${b}, ${opacity})`,
                      strokeWidth: 2,
                    };
                  }),
              }}
              width={screenWidth - 32}
              height={220}
              yAxisSuffix=""
              chartConfig={chartConfig}
              bezier
              style={{ borderRadius: 16 }}
              fromZero
            />
            {/* Legend */}
            <View className="flex-row flex-wrap gap-4 mt-4 justify-center">
              {metrics.map((metric) => (
                <View key={metric.key} className="flex-row items-center gap-2">
                  <View
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: metric.color }}
                  />
                  <Text className="text-sm text-slate-400">{metric.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
