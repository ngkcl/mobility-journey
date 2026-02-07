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
    if (!newEntry.date) return;

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

  // Exercise stats
  const streak = entries.filter((e) => e.exerciseDone).length;
  const totalMinutes = entries.reduce((sum, e) => sum + (e.exerciseMinutes ?? 0), 0);

  const updateNum = (key: string, text: string) => {
    const val = text ? parseInt(text, 10) : undefined;
    setNewEntry((prev) => ({ ...prev, [key]: isNaN(val as number) ? undefined : val }));
  };

  return (
    <ScrollView
      className="flex-1 bg-[#0b1020]"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5eead4" />
      }
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-semibold text-white">Daily Check-in</Text>
          <Text className="text-slate-400 text-sm">Track how you feel and what you did</Text>
        </View>
        <Pressable
          onPress={() => setShowAddForm(true)}
          className="bg-teal-500 px-4 py-2 rounded-xl flex-row items-center gap-2"
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text className="text-white font-medium text-sm">Check-in</Text>
        </Pressable>
      </View>

      {/* Quick stats */}
      <View className="flex-row flex-wrap gap-3 mb-4">
        {quickMetrics.map((metric) => {
          const value = getLatestValue(metric.key);
          return (
            <View
              key={metric.key}
              className="flex-1 min-w-[140px] bg-slate-900 rounded-2xl p-4 border border-slate-800"
            >
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons name={metric.icon} size={16} color={metric.color} />
                <Text className="text-slate-300 text-sm">{metric.label}</Text>
              </View>
              <Text className="text-3xl font-bold text-white">
                {value !== null ? `${value}` : '—'}
                <Text className="text-lg text-slate-500">{metric.unit}</Text>
              </Text>
            </View>
          );
        })}
      </View>

      {/* Exercise streak */}
      <View className="bg-slate-900 rounded-2xl p-4 border border-slate-800 mb-6">
        <View className="flex-row items-center gap-3">
          <Ionicons name="barbell" size={20} color="#14b8a6" />
          <Text className="text-white font-semibold">{streak} sessions</Text>
          <Text className="text-slate-400 text-sm">• {totalMinutes} minutes total</Text>
        </View>
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
      <Text className="text-lg font-semibold text-white mb-3">History</Text>

      {isLoading ? (
        <LoadingState label="Loading check-ins..." />
      ) : entries.length === 0 ? (
        <View className="bg-slate-900 rounded-2xl p-8 border border-slate-800 border-dashed items-center">
          <Text className="text-slate-300 text-center">
            No check-ins yet. Start your first daily check-in!
          </Text>
        </View>
      ) : (
        entries.map((entry) => (
          <View
            key={entry.id}
            className="bg-slate-900 rounded-2xl p-4 border border-slate-800 mb-3"
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-3">
                <Text className="text-white font-medium">
                  {format(new Date(entry.date), 'MMMM d, yyyy')}
                </Text>
                {entry.exerciseDone && (
                  <View className="bg-teal-500/20 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                    <Ionicons name="barbell" size={12} color="#5eead4" />
                    <Text className="text-teal-400 text-xs">
                      {entry.exerciseMinutes ? `${entry.exerciseMinutes}min` : '✓'}
                    </Text>
                  </View>
                )}
              </View>
              <Pressable onPress={() => deleteEntry(entry.id)} className="p-2">
                <Ionicons name="trash-outline" size={16} color="#94a3b8" />
              </Pressable>
            </View>

            <View className="flex-row flex-wrap gap-4">
              {entry.painLevel !== undefined && (
                <Text className="text-sm">
                  <Text className="text-slate-400">Pain: </Text>
                  <Text className="text-white font-medium">{entry.painLevel}/10</Text>
                </Text>
              )}
              {entry.postureScore !== undefined && (
                <Text className="text-sm">
                  <Text className="text-slate-400">Posture: </Text>
                  <Text className="text-white font-medium">{entry.postureScore}/10</Text>
                </Text>
              )}
              {entry.symmetryScore !== undefined && (
                <Text className="text-sm">
                  <Text className="text-slate-400">Symmetry: </Text>
                  <Text className="text-white font-medium">{entry.symmetryScore}/10</Text>
                </Text>
              )}
              {entry.energyLevel !== undefined && (
                <Text className="text-sm">
                  <Text className="text-slate-400">Energy: </Text>
                  <Text className="text-white font-medium">{entry.energyLevel}/10</Text>
                </Text>
              )}
              {entry.ribHump && (
                <Text className="text-sm">
                  <Text className="text-slate-400">Rib hump: </Text>
                  <Text className="text-white font-medium">{entry.ribHump}</Text>
                </Text>
              )}
            </View>

            {entry.exerciseNames && (
              <Text className="text-slate-400 text-sm mt-2">🏋️ {entry.exerciseNames}</Text>
            )}
            {entry.functionalMilestone && (
              <Text className="text-teal-400 text-sm mt-1">🎯 {entry.functionalMilestone}</Text>
            )}
            {entry.notes && (
              <Text className="text-slate-400 text-sm mt-2 italic">"{entry.notes}"</Text>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}
