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
import { format } from 'date-fns';
import { getSupabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';
import type { ChartPoint, Exercise, PostureSession, Workout, WorkoutExercise } from '../../lib/types';
import { useNavigation, useRouter } from 'expo-router';
import { buildPostureTrend, type PostureTrendMode } from '../../lib/postureSessions';
import {
  buildExerciseWeightTrend,
  buildSideVolumeTrend,
  buildWeeklyConsistency,
  buildWeeklyWorkoutVolume,
  computeStreakStats,
  computeAsymmetrySummary,
  computePainImpact,
  type WorkoutHistoryItem,
} from '../../lib/workoutAnalytics';
import StreakCard from '../../components/StreakCard';

const screenWidth = Dimensions.get('window').width - 32;

const metrics = [
  {
    key: 'painLevel' as const,
    label: 'Pain Level',
    unit: '/10',
    color: colors.pain,
    description: 'Lower is better.',
    lowerIsBetter: true,
  },
  {
    key: 'postureScore' as const,
    label: 'Posture',
    unit: '/10',
    color: colors.posture,
    description: 'Higher is better.',
    lowerIsBetter: false,
  },
  {
    key: 'symmetryScore' as const,
    label: 'Symmetry',
    unit: '/10',
    color: colors.symmetry,
    description: 'Higher is better.',
    lowerIsBetter: false,
  },
  {
    key: 'energyLevel' as const,
    label: 'Energy',
    unit: '/10',
    color: colors.energy,
    description: 'Higher is better.',
    lowerIsBetter: false,
  },
];

const chartConfig = {
  backgroundGradientFrom: colors.bgBase,
  backgroundGradientTo: colors.bgBase,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(20, 184, 166, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
  style: { borderRadius: radii.lg },
  propsForDots: { r: '4', strokeWidth: '2', stroke: colors.teal },
  propsForBackgroundLines: { strokeDasharray: '3 3', stroke: 'rgba(51, 65, 85, 0.8)' },
};

export default function ChartsScreen() {
  const [selectedMetric, setSelectedMetric] = useState<string>('painLevel');
  const [data, setData] = useState<ChartPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [postureSessions, setPostureSessions] = useState<PostureSession[]>([]);
  const [postureTrendMode, setPostureTrendMode] = useState<PostureTrendMode>('weekly');
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutHistoryItem[]>([]);
  const [exerciseLibrary, setExerciseLibrary] = useState<Exercise[]>([]);
  const [selectedGymExerciseId, setSelectedGymExerciseId] = useState<string | null>(null);
  const [selectedSideExerciseId, setSelectedSideExerciseId] = useState<string | null>(null);
  const { pushToast } = useToast();
  const navigation = useNavigation();
  const router = useRouter();

  const gymExercises = useMemo(
    () =>
      exerciseLibrary.filter(
        (exercise) => exercise.category === 'gym_compound' || exercise.category === 'gym_isolation',
      ),
    [exerciseLibrary],
  );

  const unilateralExercises = useMemo(
    () => exerciseLibrary.filter((exercise) => exercise.side_specific),
    [exerciseLibrary],
  );

  const weeklyConsistency = useMemo(() => buildWeeklyConsistency(workoutHistory), [workoutHistory]);
  const streakStats = useMemo(() => computeStreakStats(workoutHistory), [workoutHistory]);
  const volumeTrend = useMemo(() => buildWeeklyWorkoutVolume(workoutHistory), [workoutHistory]);
  const weightTrend = useMemo(
    () => (selectedGymExerciseId ? buildExerciseWeightTrend(workoutHistory, selectedGymExerciseId) : []),
    [selectedGymExerciseId, workoutHistory],
  );
  const sideTrend = useMemo(
    () => (selectedSideExerciseId ? buildSideVolumeTrend(workoutHistory, selectedSideExerciseId) : []),
    [selectedSideExerciseId, workoutHistory],
  );
  
  const asymmetrySummary = useMemo(
    () => computeAsymmetrySummary(workoutHistory),
    [workoutHistory],
  );
  
  const painImpact = useMemo(
    () => computePainImpact(workoutHistory),
    [workoutHistory],
  );

  useEffect(() => {
    if (!selectedGymExerciseId && gymExercises.length > 0) {
      setSelectedGymExerciseId(gymExercises[0].id);
    }
  }, [gymExercises, selectedGymExerciseId]);

  useEffect(() => {
    if (!selectedSideExerciseId && unilateralExercises.length > 0) {
      setSelectedSideExerciseId(unilateralExercises[0].id);
    }
  }, [selectedSideExerciseId, unilateralExercises]);

  const loadMetrics = async () => {
    const supabase = getSupabase();
    const [metricsResponse, postureResponse, workoutResponse, exerciseResponse] = await Promise.all([
      supabase
        .from('metrics')
        .select('entry_date, pain_level, posture_score, symmetry_score, energy_level')
        .order('entry_date', { ascending: true }),
      supabase
        .from('posture_sessions')
        .select('id, started_at, ended_at, duration_seconds, good_posture_pct')
        .order('started_at', { ascending: true }),
      supabase.from('workouts').select('*').order('date', { ascending: true }),
      supabase.from('exercises').select('id, name, category, side_specific').order('name', { ascending: true }),
    ]);

    if (metricsResponse.error) {
      pushToast('Failed to load chart data.', 'error');
    }

    if (postureResponse.error) {
      pushToast('Failed to load posture trends.', 'error');
    }

    if (workoutResponse.error) {
      pushToast('Failed to load workout history.', 'error');
    }

    if (exerciseResponse.error) {
      pushToast('Failed to load exercise library.', 'error');
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
    setExerciseLibrary((exerciseResponse.data ?? []) as Exercise[]);

    const workoutRows = (workoutResponse.data ?? []) as Workout[];
    let workoutExercises: WorkoutExercise[] = [];
    if (workoutRows.length > 0) {
      const { data: exerciseRows } = await supabase
        .from('workout_exercises')
        .select('*')
        .in(
          'workout_id',
          workoutRows.map((row) => row.id),
        );
      workoutExercises = (exerciseRows ?? []) as WorkoutExercise[];
    }

    const history = workoutRows.map((row) => ({
      workout: row,
      exercises: workoutExercises.filter((exercise) => exercise.workout_id === row.id),
    }));
    setWorkoutHistory(history);
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
          style={{
            marginRight: spacing.lg, flexDirection: 'row', alignItems: 'center',
            borderRadius: radii.full, backgroundColor: colors.bgBase,
            paddingHorizontal: spacing.md, paddingVertical: 6,
            borderWidth: 1, borderColor: colors.border,
          }}
        >
          {isExporting ? (
            <ActivityIndicator color={colors.tealLight} />
          ) : (
            <Ionicons name="download-outline" size={16} color={colors.tealLight} />
          )}
          <Text style={{ ...typography.caption, color: colors.tealLight, marginLeft: spacing.sm }}>Export</Text>
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
  const shrinkLabels = (labels: string[]) =>
    labels.length > maxLabels
      ? labels.map((label, i) => (i % Math.ceil(labels.length / maxLabels) === 0 ? label : ''))
      : labels;
  const displayLabels = shrinkLabels(chartLabels);
  const postureDisplayLabels = shrinkLabels(postureTrendLabels);

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'improving')
      return <Ionicons name="trending-up" size={18} color="#22c55e" />;
    if (trend === 'declining')
      return <Ionicons name="trending-down" size={18} color="#ef4444" />;
    return <Ionicons name="remove" size={18} color="#64748b" />;
  };

  const volumeLabels = shrinkLabels(
    volumeTrend.map((point) => format(new Date(point.weekStart), 'MMM d')),
  );
  const volumeValues = volumeTrend.map((point) =>
    Number.isFinite(point.totalVolumeKg) ? Math.round(point.totalVolumeKg) : 0,
  );

  const consistencyLabels = shrinkLabels(
    weeklyConsistency.map((point) => format(new Date(point.weekStart), 'MMM d')),
  );
  const consistencyValues = weeklyConsistency.map((point) =>
    Number.isFinite(point.completionPct) ? point.completionPct : 0,
  );

  const weightLabels = shrinkLabels(weightTrend.map((point) => format(new Date(point.date), 'MMM d')));
  const weightValues = weightTrend.map((point) =>
    Number.isFinite(point.weightKg) ? point.weightKg : 0,
  );

  const sideLabels = shrinkLabels(
    sideTrend.map((point) => format(new Date(point.weekStart), 'MMM d')),
  );
  const sideLeftValues = sideTrend.map((point) =>
    Number.isFinite(point.leftVolumeKg) ? Math.round(point.leftVolumeKg) : 0,
  );
  const sideRightValues = sideTrend.map((point) =>
    Number.isFinite(point.rightVolumeKg) ? Math.round(point.rightVolumeKg) : 0,
  );
  const latestConsistency = weeklyConsistency[weeklyConsistency.length - 1];

  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['4xl'] }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealLight} />
      }
    >
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={shared.pageTitle}>Progress Charts</Text>
        <Text style={shared.pageSubtitle}>Visualize your improvement over time</Text>
      </View>

      {/* Quick access sub-pages */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
        <Pressable
          onPress={() => router.push('/photos')}
          style={[shared.card, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }]}
        >
          <Ionicons name="camera" size={18} color={colors.teal} />
          <Text style={{ ...typography.captionMedium, color: colors.textPrimary }}>Photos</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/videos')}
          style={[shared.card, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }]}
        >
          <Ionicons name="videocam" size={18} color={colors.evening} />
          <Text style={{ ...typography.captionMedium, color: colors.textPrimary }}>Videos</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/analysis')}
          style={[shared.card, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }]}
        >
          <Ionicons name="document-text" size={18} color={colors.warning} />
          <Text style={{ ...typography.captionMedium, color: colors.textPrimary }}>Analysis</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/metrics')}
          style={[shared.card, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }]}
        >
          <Ionicons name="pulse" size={18} color={colors.pain} />
          <Text style={{ ...typography.captionMedium, color: colors.textPrimary }}>Metrics</Text>
        </Pressable>
      </View>

      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <View style={shared.rowBetween}>
          <View style={{ flex: 1, paddingRight: spacing.lg }}>
            <Text style={{ ...typography.h3, color: colors.textPrimary }}>Data Export</Text>
            <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs }}>
              Share a JSON backup of all your mobility data.
            </Text>
          </View>
          <Pressable
            onPress={handleExport}
            disabled={isExporting}
            style={[shared.cardAccent, { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.full }]}
          >
            {isExporting ? (
              <View style={[shared.row, shared.gap8]}>
                <ActivityIndicator color={colors.tealLight} />
                <Text style={{ ...typography.caption, color: colors.tealLight }}>Exporting</Text>
              </View>
            ) : (
              <View style={[shared.row, shared.gap8]}>
                <Ionicons name="download-outline" size={16} color={colors.tealLight} />
                <Text style={{ ...typography.caption, color: colors.tealLight }}>Export</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
          <View>
            <Text style={{ ...typography.h3, color: colors.textPrimary }}>Posture Monitoring Trend</Text>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Average good posture %</Text>
          </View>
          <View style={[shared.row, shared.gap8]}>
            <Pressable
              onPress={() => setPostureTrendMode('daily')}
              style={{
                paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
                borderRadius: radii.full, borderWidth: 1,
                borderColor: postureTrendMode === 'daily' ? colors.tealBorder : colors.border,
                backgroundColor: postureTrendMode === 'daily' ? colors.tealDim : 'transparent',
              }}
            >
              <Text style={{ ...typography.small, color: colors.textSecondary }}>Daily</Text>
            </Pressable>
            <Pressable
              onPress={() => setPostureTrendMode('weekly')}
              style={{
                paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
                borderRadius: radii.full, borderWidth: 1,
                borderColor: postureTrendMode === 'weekly' ? colors.tealBorder : colors.border,
                backgroundColor: postureTrendMode === 'weekly' ? colors.tealDim : 'transparent',
              }}
            >
              <Text style={{ ...typography.small, color: colors.textSecondary }}>Weekly</Text>
            </Pressable>
          </View>
        </View>

        {isLoading ? (
          <View style={{ height: 208, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
            <ActivityIndicator color={colors.tealLight} />
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Loading posture trend...</Text>
          </View>
        ) : postureTrendValues.length === 0 ? (
          <View style={{ height: 208, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...typography.body, color: colors.textTertiary }}>No posture sessions yet.</Text>
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
            style={{ borderRadius: radii.lg }}
            fromZero
          />
        )}
      </View>

      <View style={{ marginBottom: spacing.lg }}>
        <Text style={{ ...typography.h2, color: colors.textPrimary }}>Workout Analytics</Text>
        <Text style={{ ...typography.caption, color: colors.textTertiary }}>Consistency, volume, and imbalance trends</Text>
      </View>

      {/* Streak Card with Calendar Heat Map */}
      <StreakCard 
        workoutHistory={workoutHistory} 
        onPressWorkout={() => router.push('/workouts')}
      />

      {/* Weekly Consistency Chart */}
      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
          <View>
            <Text style={{ ...typography.h3, color: colors.textPrimary }}>Weekly Consistency</Text>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Corrective sessions out of 21 per week</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ ...typography.small, color: colors.textTertiary }}>Best streak</Text>
            <Text style={{ ...typography.h2, color: colors.warning }}>{streakStats.bestStreak} days</Text>
          </View>
        </View>

        {weeklyConsistency.length === 0 ? (
          <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.textTertiary }}>No corrective sessions yet.</Text>
          </View>
        ) : (
          <>
            <View style={[shared.rowBetween, { marginBottom: spacing.md }]}>
              <Text style={{ ...typography.caption, color: colors.textSecondary }}>
                Latest week: {latestConsistency?.sessions ?? 0} / 21 sessions
              </Text>
              <Text style={{ ...typography.caption, color: colors.textSecondary }}>
                {latestConsistency?.completionPct ?? 0}% complete
              </Text>
            </View>
            <LineChart
              data={{
                labels: consistencyLabels,
                datasets: [
                  {
                    data: consistencyValues,
                    color: (opacity = 1) => `rgba(45, 212, 191, ${opacity})`,
                    strokeWidth: 2,
                  },
                ],
              }}
              width={screenWidth - 32}
              height={200}
              yAxisSuffix="%"
              yAxisInterval={1}
              chartConfig={{
                ...chartConfig,
                color: (opacity = 1) => `rgba(45, 212, 191, ${opacity})`,
                propsForDots: { r: '4', strokeWidth: '2', stroke: '#2dd4bf' },
              }}
              bezier
              style={{ borderRadius: radii.lg }}
              fromZero
            />
          </>
        )}
      </View>

      {/* Asymmetry & Pain Impact Summary */}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
        {/* Asymmetry Summary Card */}
        <View style={[shared.card, { flex: 1 }]}>
          <View style={{ marginBottom: spacing.md }}>
            <Text style={{ ...typography.h3, color: colors.textPrimary }}>Balance Status</Text>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>L/R asymmetry trend</Text>
          </View>
          {asymmetrySummary ? (
            <>
              <View style={[shared.rowBetween, { marginBottom: spacing.sm }]}>
                <Text style={{ ...typography.small, color: colors.textSecondary }}>Current</Text>
                <Text style={{
                  ...typography.bodySemibold,
                  color: Math.abs(asymmetrySummary.currentImbalancePct) <= 5
                    ? colors.success
                    : Math.abs(asymmetrySummary.currentImbalancePct) <= 15
                    ? colors.warning
                    : colors.error,
                }}>
                  {asymmetrySummary.currentImbalancePct > 0 ? '+' : ''}
                  {asymmetrySummary.currentImbalancePct}%
                </Text>
              </View>
              <View style={[shared.rowBetween, { marginBottom: spacing.sm }]}>
                <Text style={{ ...typography.small, color: colors.textSecondary }}>Dominant</Text>
                <Text style={{
                  ...typography.bodySemibold,
                  color: asymmetrySummary.dominantSide === 'balanced'
                    ? colors.success
                    : asymmetrySummary.dominantSide === 'left'
                    ? colors.leftSide
                    : colors.rightSide,
                }}>
                  {asymmetrySummary.dominantSide === 'balanced' ? '⚖️ Balanced' : 
                   asymmetrySummary.dominantSide === 'left' ? '← Left' : 'Right →'}
                </Text>
              </View>
              <View style={[shared.rowBetween]}>
                <Text style={{ ...typography.small, color: colors.textSecondary }}>Trend</Text>
                <View style={[shared.row, shared.gap8]}>
                  <Ionicons
                    name={
                      asymmetrySummary.trendDirection === 'improving' ? 'trending-up' :
                      asymmetrySummary.trendDirection === 'worsening' ? 'trending-down' : 'remove'
                    }
                    size={16}
                    color={
                      asymmetrySummary.trendDirection === 'improving' ? colors.success :
                      asymmetrySummary.trendDirection === 'worsening' ? colors.error : colors.textMuted
                    }
                  />
                  <Text style={{
                    ...typography.bodySemibold,
                    color: asymmetrySummary.trendDirection === 'improving' ? colors.success :
                           asymmetrySummary.trendDirection === 'worsening' ? colors.error : colors.textMuted,
                  }}>
                    {asymmetrySummary.trendDirection === 'improving' ? 'Improving' :
                     asymmetrySummary.trendDirection === 'worsening' ? 'Needs work' : 'Stable'}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg }}>
              <Text style={{ ...typography.caption, color: colors.textTertiary }}>Log side-specific sets</Text>
            </View>
          )}
        </View>

        {/* Pain Impact Card */}
        <View style={[shared.card, { flex: 1 }]}>
          <View style={{ marginBottom: spacing.md }}>
            <Text style={{ ...typography.h3, color: colors.textPrimary }}>Pain Impact</Text>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Workout effect on pain</Text>
          </View>
          {painImpact.workoutsWithPainData > 0 ? (
            <>
              <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
                <Text style={{
                  fontSize: 36,
                  fontWeight: '700',
                  color: painImpact.avgPainChange < 0 ? colors.success :
                         painImpact.avgPainChange > 0 ? colors.error : colors.textMuted,
                }}>
                  {painImpact.avgPainChange > 0 ? '+' : ''}{painImpact.avgPainChange}
                </Text>
                <Text style={{ ...typography.caption, color: colors.textTertiary }}>
                  avg. pain change
                </Text>
              </View>
              <View style={[shared.rowBetween]}>
                <Text style={{ ...typography.small, color: colors.textSecondary }}>Based on</Text>
                <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>
                  {painImpact.workoutsWithPainData} workouts
                </Text>
              </View>
              <Text style={{
                ...typography.caption,
                color: painImpact.avgPainChange < 0 ? colors.success : colors.textTertiary,
                marginTop: spacing.sm,
                textAlign: 'center',
              }}>
                {painImpact.avgPainChange < -0.5 ? '🎉 Workouts are helping!' :
                 painImpact.avgPainChange > 0.5 ? '⚠️ Consider intensity' : 'Neutral effect'}
              </Text>
            </>
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg }}>
              <Text style={{ ...typography.caption, color: colors.textTertiary }}>Log pain before/after</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
          <View>
            <Text style={{ ...typography.h3, color: colors.textPrimary }}>Weekly Volume Trend</Text>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Total weight lifted per week</Text>
          </View>
        </View>

        {volumeTrend.length === 0 ? (
          <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.textTertiary }}>Log workouts to see volume trends.</Text>
          </View>
        ) : (
          <LineChart
            data={{
              labels: volumeLabels,
              datasets: [
                {
                  data: volumeValues,
                  color: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
                  strokeWidth: 2,
                },
              ],
            }}
            width={screenWidth - 32}
            height={200}
            yAxisSuffix="kg"
            yAxisInterval={1}
            chartConfig={{
              ...chartConfig,
              color: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
              propsForDots: { r: '4', strokeWidth: '2', stroke: '#94a3b8' },
            }}
            bezier
            style={{ borderRadius: radii.lg }}
            fromZero
          />
        )}
      </View>

      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <View style={[shared.rowBetween, { marginBottom: spacing.md }]}>
          <View>
            <Text style={{ ...typography.h3, color: colors.textPrimary }}>Strength Progression</Text>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Max weight per session</Text>
          </View>
        </View>

        {gymExercises.length === 0 ? (
          <View style={{ height: 128, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.textTertiary }}>Add gym exercises to track progression.</Text>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
              <View style={[shared.row, shared.gap8]}>
                {gymExercises.map((exercise) => {
                  const active = exercise.id === selectedGymExerciseId;
                  return (
                    <Pressable
                      key={exercise.id}
                      onPress={() => setSelectedGymExerciseId(exercise.id)}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
                        borderRadius: radii.full, borderWidth: 1,
                        backgroundColor: active ? colors.gym_compound.bg : colors.bgDeep,
                        borderColor: active ? colors.gym_compound.border : colors.border,
                      }}
                    >
                      <Text style={{ ...typography.small, color: active ? colors.gym_compound.text : colors.textSecondary }}>
                        {exercise.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {weightTrend.length === 0 ? (
              <View style={{ height: 128, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.textTertiary }}>No sets logged for this exercise yet.</Text>
              </View>
            ) : (
              <LineChart
                data={{
                  labels: weightLabels,
                  datasets: [
                    {
                      data: weightValues,
                      color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
                      strokeWidth: 2,
                    },
                  ],
                }}
                width={screenWidth - 32}
                height={200}
                yAxisSuffix="kg"
                yAxisInterval={1}
                chartConfig={{
                  ...chartConfig,
                  color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
                  propsForDots: { r: '4', strokeWidth: '2', stroke: '#6366f1' },
                }}
                bezier
                style={{ borderRadius: radii.lg }}
                fromZero
              />
            )}
          </>
        )}
      </View>

      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <View style={[shared.rowBetween, { marginBottom: spacing.md }]}>
          <View>
            <Text style={{ ...typography.h3, color: colors.textPrimary }}>Left vs Right Balance</Text>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Weekly volume for unilateral work</Text>
          </View>
        </View>

        {unilateralExercises.length === 0 ? (
          <View style={{ height: 128, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.textTertiary }}>Log side-specific exercises to compare.</Text>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
              <View style={[shared.row, shared.gap8]}>
                {unilateralExercises.map((exercise) => {
                  const active = exercise.id === selectedSideExerciseId;
                  return (
                    <Pressable
                      key={exercise.id}
                      onPress={() => setSelectedSideExerciseId(exercise.id)}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
                        borderRadius: radii.full, borderWidth: 1,
                        backgroundColor: active ? colors.stretching.bg : colors.bgDeep,
                        borderColor: active ? colors.stretching.border : colors.border,
                      }}
                    >
                      <Text style={{ ...typography.small, color: active ? colors.stretching.text : colors.textSecondary }}>
                        {exercise.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {sideTrend.length === 0 ? (
              <View style={{ height: 128, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.textTertiary }}>No side-specific sets logged yet.</Text>
              </View>
            ) : (
              <>
                <LineChart
                  data={{
                    labels: sideLabels,
                    datasets: [
                      {
                        data: sideLeftValues,
                        color: (opacity = 1) => `rgba(56, 189, 248, ${opacity})`,
                        strokeWidth: 2,
                      },
                      {
                        data: sideRightValues,
                        color: (opacity = 1) => `rgba(248, 113, 113, ${opacity})`,
                        strokeWidth: 2,
                      },
                    ],
                  }}
                  width={screenWidth - 32}
                  height={200}
                  yAxisSuffix="kg"
                  yAxisInterval={1}
                  chartConfig={chartConfig}
                  bezier
                  style={{ borderRadius: radii.lg }}
                  fromZero
                />
                <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md, justifyContent: 'center' }}>
                  <View style={[shared.row, shared.gap8]}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.leftSide }} />
                    <Text style={{ ...typography.caption, color: colors.textTertiary }}>Left</Text>
                  </View>
                  <View style={[shared.row, shared.gap8]}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.error }} />
                    <Text style={{ ...typography.caption, color: colors.textTertiary }}>Right</Text>
                  </View>
                </View>
              </>
            )}
          </>
        )}
      </View>

      {/* Metric selector cards */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing['2xl'] }}>
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
              style={[shared.card, {
                flex: 1, minWidth: 140,
                borderColor: selectedMetric === metric.key ? colors.tealBorder : colors.border,
              }]}
            >
              <View style={[shared.rowBetween, { marginBottom: spacing.sm }]}>
                <Text style={{ ...typography.caption, color: colors.textSecondary }}>{metric.label}</Text>
                <TrendIcon trend={trend} />
              </View>
              <Text style={{ fontSize: 30, fontWeight: '700', color: metric.color }}>
                {latestValue !== undefined ? `${latestValue}` : '—'}
                <Text style={{ fontSize: 18, color: colors.textMuted }}>{metric.unit}</Text>
              </Text>
              <Text
                style={{
                  ...typography.caption,
                  marginTop: spacing.xs,
                  color: trend === 'improving' ? colors.success : trend === 'declining' ? colors.error : colors.textMuted,
                }}
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
      <View style={[shared.card, { marginBottom: spacing.lg }]}>
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={{ ...typography.h3, color: colors.textPrimary }}>
            {selectedConfig.label} Over Time
          </Text>
          <View style={[shared.row, { gap: spacing.xs, marginTop: spacing.xs }]}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>{selectedConfig.description}</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={{ height: 208, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
            <ActivityIndicator color={colors.tealLight} />
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>Loading chart data...</Text>
          </View>
        ) : chartValues.length === 0 ? (
          <View style={{ height: 208, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.textTertiary }}>
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
            style={{ borderRadius: radii.lg }}
            fromZero
          />
        )}
      </View>

      {/* All metrics comparison */}
      <View style={shared.card}>
        <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg }}>All Metrics Comparison</Text>

        {isLoading ? (
          <View style={{ height: 208, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.tealLight} />
          </View>
        ) : data.length === 0 ? (
          <View style={{ height: 208, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.textTertiary }}>No data yet.</Text>
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
              style={{ borderRadius: radii.lg }}
              fromZero
            />
            {/* Legend */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.lg, justifyContent: 'center' }}>
              {metrics.map((metric) => (
                <View key={metric.key} style={[shared.row, shared.gap8]}>
                  <View
                    style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: metric.color }}
                  />
                  <Text style={{ ...typography.caption, color: colors.textTertiary }}>{metric.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
