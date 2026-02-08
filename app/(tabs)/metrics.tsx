import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Switch,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getSupabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import LoadingState from '../../components/LoadingState';
import { colors, typography, spacing, radii, shared, getGreeting } from '../../lib/theme';
import type { MetricEntry as MetricRow } from '../../lib/types';

const quickMetrics = [
  { key: 'painLevel' as const, label: 'Pain', unit: '/10', icon: 'pulse' as const, color: '#f43f5e' },
  { key: 'postureScore' as const, label: 'Posture', unit: '/10', icon: 'body' as const, color: '#14b8a6' },
  { key: 'symmetryScore' as const, label: 'Symmetry', unit: '/10', icon: 'flash' as const, color: '#8b5cf6' },
  { key: 'energyLevel' as const, label: 'Energy', unit: '/10', icon: 'flame' as const, color: '#f59e0b' },
];

const RIB_HUMP_OPTIONS = ['', 'none', 'mild', 'moderate', 'severe'];

type MetricEntryView = {
  id: string;
  date: string;
  painLevel?: number;
  postureScore?: number;
  symmetryScore?: number;
  energyLevel?: number;
  exerciseDone?: boolean;
  exerciseMinutes?: number;
  exerciseNames?: string;
  functionalMilestone?: string;
  romForwardBend?: number;
  romLateral?: number;
  ribHump?: string;
  notes?: string;
};

type MetricKey = (typeof quickMetrics)[number]['key'];

const SCORE_LABELS: Record<MetricKey, string> = {
  painLevel: 'Pain',
  postureScore: 'Posture',
  symmetryScore: 'Symmetry',
  energyLevel: 'Energy',
};

const TREND_META = {
  up: { icon: 'arrow-up' as const, color: '#22c55e', label: 'Improving' },
  down: { icon: 'arrow-down' as const, color: '#ef4444', label: 'Declining' },
  flat: { icon: 'remove' as const, color: '#94a3b8', label: 'Neutral' },
};

export default function MetricsScreen() {
  const [entries, setEntries] = useState<MetricEntryView[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { pushToast } = useToast();
  const [newEntry, setNewEntry] = useState<Partial<MetricEntryView>>({
    date: new Date().toISOString().split('T')[0],
    exerciseDone: false,
  });

  const loadEntries = async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('metrics')
      .select('*')
      .order('entry_date', { ascending: false });

    if (error) {
      pushToast('Failed to load metrics.', 'error');
      setIsLoading(false);
      return;
    }

    const normalized = (data ?? []).map((row: MetricRow) => ({
      id: row.id,
      date: row.entry_date,
      painLevel: row.pain_level ?? undefined,
      postureScore: row.posture_score ?? undefined,
      symmetryScore: row.symmetry_score ?? undefined,
      energyLevel: row.energy_level ?? undefined,
      exerciseDone: row.exercise_done ?? undefined,
      exerciseMinutes: row.exercise_minutes ?? undefined,
      exerciseNames: row.exercise_names ?? undefined,
      functionalMilestone: row.functional_milestone ?? undefined,
      romForwardBend: row.rom_forward_bend ?? undefined,
      romLateral: row.rom_lateral ?? undefined,
      ribHump: row.rib_hump ?? undefined,
      notes: row.notes ?? undefined,
    }));

    setEntries(normalized);
    setIsLoading(false);
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  };

  const addEntry = async () => {
    if (!newEntry.date) {
      pushToast('Date is required.', 'error');
      return;
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(newEntry.date)) {
      pushToast('Use date format YYYY-MM-DD.', 'error');
      return;
    }

    const invalidScore = quickMetrics.find((metric) => {
      const value = newEntry[metric.key as keyof MetricEntryView];
      if (value === undefined || value === null) return false;
      const numericValue = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numericValue)) return true;
      return numericValue < 1 || numericValue > 10;
    });

    if (invalidScore) {
      pushToast(`${SCORE_LABELS[invalidScore.key]} must be 1-10.`, 'error');
      return;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('metrics')
      .insert({
        entry_date: newEntry.date,
        pain_level: newEntry.painLevel ?? null,
        posture_score: newEntry.postureScore ?? null,
        symmetry_score: newEntry.symmetryScore ?? null,
        energy_level: newEntry.energyLevel ?? null,
        exercise_done: newEntry.exerciseDone ?? null,
        exercise_minutes: newEntry.exerciseMinutes ?? null,
        exercise_names: newEntry.exerciseNames ?? null,
        functional_milestone: newEntry.functionalMilestone ?? null,
        rom_forward_bend: newEntry.romForwardBend ?? null,
        rom_lateral: newEntry.romLateral ?? null,
        rib_hump: newEntry.ribHump ?? null,
        notes: newEntry.notes ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      pushToast('Failed to save entry.', 'error');
      return;
    }

    const entry: MetricEntryView = {
      id: data.id,
      date: data.entry_date,
      painLevel: data.pain_level ?? undefined,
      postureScore: data.posture_score ?? undefined,
      symmetryScore: data.symmetry_score ?? undefined,
      energyLevel: data.energy_level ?? undefined,
      exerciseDone: data.exercise_done ?? undefined,
      exerciseMinutes: data.exercise_minutes ?? undefined,
      exerciseNames: data.exercise_names ?? undefined,
      functionalMilestone: data.functional_milestone ?? undefined,
      romForwardBend: data.rom_forward_bend ?? undefined,
      romLateral: data.rom_lateral ?? undefined,
      ribHump: data.rib_hump ?? undefined,
      notes: data.notes ?? undefined,
    };

    setEntries((prev) =>
      [entry, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    );
    setNewEntry({ date: new Date().toISOString().split('T')[0], exerciseDone: false });
    setShowAddForm(false);
    pushToast('Check-in saved!', 'success');
  };

  const deleteEntry = (id: string) => {
    Alert.alert('Delete Entry', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const supabase = getSupabase();
          const prev = entries;
          setEntries((p) => p.filter((e) => e.id !== id));
          const { error } = await supabase.from('metrics').delete().eq('id', id);
          if (error) {
            setEntries(prev);
            pushToast('Failed to delete.', 'error');
          }
        },
      },
    ]);
  };

  const getLatestValue = (key: string) => {
    const entry = entries.find((e) => e[key as keyof MetricEntryView] !== undefined);
    return entry ? (entry[key as keyof MetricEntryView] as number) : null;
  };

  const getTrend = (key: MetricKey) => {
    const values = entries
      .map((entry) => entry[key])
      .filter((value): value is number => typeof value === 'number')
      .slice(0, 5);

    if (values.length < 2) return TREND_META.flat;

    const diff = values[0] - values[values.length - 1];
    if (diff >= 1) return TREND_META.up;
    if (diff <= -1) return TREND_META.down;
    return TREND_META.flat;
  };

  // Exercise stats
  const streak = entries.filter((e) => e.exerciseDone).length;
  const totalMinutes = entries.reduce((sum, e) => sum + (e.exerciseMinutes ?? 0), 0);

  const updateNum = (key: string, text: string) => {
    const val = text ? parseInt(text, 10) : undefined;
    setNewEntry((prev) => ({ ...prev, [key]: isNaN(val as number) ? undefined : val }));
  };

  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={shared.screenContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealLight} />
      }
    >
      {/* Header */}
      <View style={[shared.rowBetween, { marginBottom: spacing.xl }]}>
        <View>
          <Text style={shared.pageTitle}>Daily Check-in</Text>
          <Text style={shared.pageSubtitle}>Track how you feel and what you did</Text>
        </View>
        <Pressable onPress={() => setShowAddForm(true)} style={[shared.btnPrimary, shared.btnSmall]}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ ...typography.captionMedium, color: '#fff' }}>Check-in</Text>
        </Pressable>
      </View>

      {/* Quick stats */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg }}>
        {quickMetrics.map((metric) => {
          const value = getLatestValue(metric.key);
          const trend = getTrend(metric.key);
          return (
            <View
              key={metric.key}
              style={{
                flex: 1,
                minWidth: 150,
                backgroundColor: colors.bgBase,
                borderRadius: radii.xl,
                padding: spacing.lg,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={[shared.row, { gap: spacing.sm, marginBottom: spacing.sm }]}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: `${metric.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={metric.icon} size={14} color={metric.color} />
                </View>
                <Text style={{ ...typography.captionMedium, color: colors.textSecondary }}>{metric.label}</Text>
              </View>
              <View style={shared.rowBetween}>
                <Text style={{ fontSize: 28, fontWeight: '700', color: colors.textPrimary }}>
                  {value !== null ? `${value}` : '—'}
                  <Text style={{ fontSize: 16, color: colors.textMuted }}>{metric.unit}</Text>
                </Text>
                <View style={[shared.row, { gap: 4 }]}>
                  <Ionicons name={trend.icon} size={16} color={trend.color} />
                  <Text style={{ ...typography.small, color: trend.color }}>
                    {trend.label}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Exercise streak */}
      <View style={[shared.cardAccent, { marginBottom: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }]}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.tealDim, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="barbell" size={20} color={colors.teal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }}>
            {streak} sessions logged
          </Text>
          <Text style={{ ...typography.caption, color: colors.textTertiary }}>
            {totalMinutes} minutes total exercise time
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>

      {/* Add entry form */}
      {showAddForm && (
        <View className="bg-slate-900 rounded-2xl p-5 border border-slate-800 mb-6">
          <Text className="text-lg font-semibold text-white mb-4">Daily Check-in</Text>

          {/* Date */}
          <Text className="text-sm text-slate-300 mb-1">Date</Text>
          <TextInput
            value={newEntry.date}
            onChangeText={(text) => setNewEntry((prev) => ({ ...prev, date: text }))}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white mb-4"
          />

          {/* Quick scores */}
          <View className="flex-row flex-wrap gap-3 mb-4">
            {quickMetrics.map((metric) => (
              <View key={metric.key} className="flex-1 min-w-[120px]">
                <Text className="text-sm text-slate-300 mb-1">{metric.label} (1-10)</Text>
                <TextInput
                  keyboardType="numeric"
                  placeholder="—"
                  placeholderTextColor="#64748b"
                  value={
                    newEntry[metric.key as keyof MetricEntryView] !== undefined
                      ? String(newEntry[metric.key as keyof MetricEntryView])
                      : ''
                  }
                  onChangeText={(text) => updateNum(metric.key, text)}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </View>
            ))}
          </View>

          {/* Exercise toggle */}
          <View className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-white font-medium">Did exercises today</Text>
              <Switch
                value={newEntry.exerciseDone || false}
                onValueChange={(val) => setNewEntry((prev) => ({ ...prev, exerciseDone: val }))}
                trackColor={{ false: '#334155', true: '#14b8a6' }}
                thumbColor="#fff"
              />
            </View>

            {newEntry.exerciseDone && (
              <View className="gap-3">
                <View>
                  <Text className="text-sm text-slate-300 mb-1">Duration (minutes)</Text>
                  <TextInput
                    keyboardType="numeric"
                    placeholder="30"
                    placeholderTextColor="#64748b"
                    value={newEntry.exerciseMinutes ? String(newEntry.exerciseMinutes) : ''}
                    onChangeText={(text) => updateNum('exerciseMinutes', text)}
                    className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </View>
                <View>
                  <Text className="text-sm text-slate-300 mb-1">Which exercises</Text>
                  <TextInput
                    placeholder="Planks, bird dogs, cat-cow..."
                    placeholderTextColor="#64748b"
                    value={newEntry.exerciseNames || ''}
                    onChangeText={(text) =>
                      setNewEntry((prev) => ({ ...prev, exerciseNames: text }))
                    }
                    className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </View>
              </View>
            )}
          </View>

          {/* ROM */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-sm text-slate-300 mb-1">Forward Bend ROM (°)</Text>
              <TextInput
                keyboardType="numeric"
                placeholder="—"
                placeholderTextColor="#64748b"
                value={newEntry.romForwardBend ? String(newEntry.romForwardBend) : ''}
                onChangeText={(text) => updateNum('romForwardBend', text)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm text-slate-300 mb-1">Lateral Flexion (°)</Text>
              <TextInput
                keyboardType="numeric"
                placeholder="—"
                placeholderTextColor="#64748b"
                value={newEntry.romLateral ? String(newEntry.romLateral) : ''}
                onChangeText={(text) => updateNum('romLateral', text)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
              />
            </View>
          </View>

          {/* Rib hump picker */}
          <View className="mb-4">
            <Text className="text-sm text-slate-300 mb-1">Rib Hump</Text>
            <View className="flex-row gap-2">
              {RIB_HUMP_OPTIONS.filter(Boolean).map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => setNewEntry((prev) => ({ ...prev, ribHump: opt }))}
                  className={`px-3 py-2 rounded-xl ${
                    newEntry.ribHump === opt ? 'bg-teal-500' : 'bg-slate-800 border border-slate-700'
                  }`}
                >
                  <Text
                    className={`text-sm capitalize ${
                      newEntry.ribHump === opt ? 'text-white font-semibold' : 'text-slate-300'
                    }`}
                  >
                    {opt}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Milestone */}
          <View className="mb-4">
            <Text className="text-sm text-slate-300 mb-1">Functional Milestone 🎯</Text>
            <TextInput
              placeholder="e.g. Held plank for 60s..."
              placeholderTextColor="#64748b"
              value={newEntry.functionalMilestone || ''}
              onChangeText={(text) =>
                setNewEntry((prev) => ({ ...prev, functionalMilestone: text }))
              }
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
            />
          </View>

          {/* Notes */}
          <View className="mb-4">
            <Text className="text-sm text-slate-300 mb-1">Notes</Text>
            <TextInput
              placeholder="How you feel, anything unusual..."
              placeholderTextColor="#64748b"
              multiline
              numberOfLines={3}
              value={newEntry.notes || ''}
              onChangeText={(text) => setNewEntry((prev) => ({ ...prev, notes: text }))}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white min-h-[80px]"
              textAlignVertical="top"
            />
          </View>

          <View className="flex-row gap-2">
            <Pressable
              onPress={addEntry}
              className="bg-teal-500 px-4 py-2.5 rounded-xl flex-1 items-center"
            >
              <Text className="text-white font-medium">Save Check-in</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowAddForm(false)}
              className="bg-slate-800 px-4 py-2.5 rounded-xl"
            >
              <Text className="text-slate-300">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* History */}
      <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md }}>History</Text>

      {isLoading ? (
        <LoadingState label="Loading check-ins..." rows={4} />
      ) : entries.length === 0 ? (
        <View style={[shared.card, { borderStyle: 'dashed', alignItems: 'center', paddingVertical: spacing['3xl'] }]}>
          <Ionicons name="pulse-outline" size={40} color={colors.textMuted} />
          <Text style={shared.emptyStateTitle}>No check-ins yet</Text>
          <Text style={shared.emptyStateText}>
            Start your first daily check-in to begin tracking your journey.
          </Text>
        </View>
      ) : (
        entries.map((entry) => (
          <View
            key={entry.id}
            style={[shared.card, { marginBottom: spacing.md }]}
          >
            <View style={[shared.rowBetween, { marginBottom: spacing.md }]}>
              <View style={[shared.row, { gap: spacing.sm }]}>
                <Text style={{ ...typography.bodyMedium, color: colors.textPrimary }}>
                  {format(new Date(entry.date), 'MMM d, yyyy')}
                </Text>
                {entry.exerciseDone && (
                  <View style={[shared.badge, { backgroundColor: colors.tealDim }]}>
                    <Ionicons name="barbell" size={10} color={colors.tealLight} />
                    <Text style={{ ...typography.tiny, color: colors.tealLight }}>
                      {entry.exerciseMinutes ? `${entry.exerciseMinutes}min` : '✓'}
                    </Text>
                  </View>
                )}
              </View>
              <Pressable onPress={() => deleteEntry(entry.id)} style={{ padding: spacing.sm }}>
                <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* Metric pills row */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {entry.painLevel !== undefined && (
                <View style={[shared.badge, { backgroundColor: `${colors.pain}15` }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.pain }} />
                  <Text style={{ ...typography.small, color: colors.textSecondary }}>
                    Pain {entry.painLevel}/10
                  </Text>
                </View>
              )}
              {entry.postureScore !== undefined && (
                <View style={[shared.badge, { backgroundColor: `${colors.posture}15` }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.posture }} />
                  <Text style={{ ...typography.small, color: colors.textSecondary }}>
                    Posture {entry.postureScore}/10
                  </Text>
                </View>
              )}
              {entry.symmetryScore !== undefined && (
                <View style={[shared.badge, { backgroundColor: `${colors.symmetry}15` }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.symmetry }} />
                  <Text style={{ ...typography.small, color: colors.textSecondary }}>
                    Sym. {entry.symmetryScore}/10
                  </Text>
                </View>
              )}
              {entry.energyLevel !== undefined && (
                <View style={[shared.badge, { backgroundColor: `${colors.energy}15` }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.energy }} />
                  <Text style={{ ...typography.small, color: colors.textSecondary }}>
                    Energy {entry.energyLevel}/10
                  </Text>
                </View>
              )}
              {entry.ribHump && (
                <View style={[shared.badge, { backgroundColor: colors.bgCard }]}>
                  <Text style={{ ...typography.small, color: colors.textSecondary }}>
                    Rib hump: {entry.ribHump}
                  </Text>
                </View>
              )}
            </View>

            {entry.exerciseNames && (
              <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm }}>
                🏋️ {entry.exerciseNames}
              </Text>
            )}
            {entry.functionalMilestone && (
              <Text style={{ ...typography.caption, color: colors.tealLight, marginTop: spacing.xs }}>
                🎯 {entry.functionalMilestone}
              </Text>
            )}
            {entry.notes && (
              <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm, fontStyle: 'italic' }}>
                &ldquo;{entry.notes}&rdquo;
              </Text>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}
