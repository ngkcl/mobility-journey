import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getSupabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import LoadingState from '../../components/LoadingState';
import { colors } from '@/lib/theme';
import type { AnalysisEntry as AnalysisRow, AnalysisType } from '../../lib/types';

const FILTERS: readonly ('all' | AnalysisType)[] = ['all', 'ai', 'personal', 'specialist'];

const typeConfig: Record<AnalysisType, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  ai: { icon: 'sparkles', color: '#fbbf24', bg: 'bg-amber-500/20' },
  personal: { icon: 'person', color: '#38bdf8', bg: 'bg-sky-500/20' },
  specialist: { icon: 'medkit', color: '#34d399', bg: 'bg-emerald-500/20' },
};

type AnalysisEntryView = {
  id: string;
  date: string;
  type: AnalysisType;
  title: string;
  content: string;
};

export default function AnalysisScreen() {
  const [entries, setEntries] = useState<AnalysisEntryView[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filter, setFilter] = useState<'all' | AnalysisType>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});
  const { pushToast } = useToast();
  const [newEntry, setNewEntry] = useState<Partial<AnalysisEntryView>>({
    date: new Date().toISOString().split('T')[0],
    type: 'personal',
  });

  const loadEntries = async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('analysis_logs')
      .select('id, entry_date, category, title, content')
      .order('entry_date', { ascending: false });

    if (error) {
      pushToast('Failed to load analysis entries.', 'error');
      setIsLoading(false);
      return;
    }

    const normalized = (data ?? []).map((row: AnalysisRow) => ({
      id: row.id,
      date: row.entry_date,
      type: row.category as AnalysisType,
      title: row.title ?? '',
      content: row.content,
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
    if (!newEntry.date || !newEntry.title || !newEntry.content) {
      pushToast('Please fill in all fields.', 'error');
      return;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('analysis_logs')
      .insert({
        entry_date: newEntry.date,
        category: newEntry.type || 'personal',
        title: newEntry.title ?? null,
        content: newEntry.content,
      })
      .select('id, entry_date, category, title, content')
      .single();

    if (error || !data) {
      pushToast('Failed to save entry.', 'error');
      return;
    }

    const entry: AnalysisEntryView = {
      id: data.id,
      date: data.entry_date,
      type: data.category as AnalysisType,
      title: data.title ?? '',
      content: data.content,
    };

    setEntries((prev) =>
      [entry, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    );
    setNewEntry({ date: new Date().toISOString().split('T')[0], type: 'personal' });
    setShowAddForm(false);
    pushToast('Entry saved!', 'success');
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
          const { error } = await supabase.from('analysis_logs').delete().eq('id', id);
          if (error) {
            setEntries(prev);
            pushToast('Failed to delete.', 'error');
          }
        },
      },
    ]);
  };

  const filteredEntries =
    filter === 'all' ? entries : entries.filter((e) => e.type === filter);

  const typeButtons: AnalysisType[] = ['personal', 'ai', 'specialist'];
  const contentStyle = Platform.OS === 'web' ? ({ whiteSpace: 'pre-wrap' } as any) : undefined;

  return (
    <ScrollView
      className="flex-1 bg-[#0b1020]"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealLight} />
      }
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-semibold text-white">Analysis Log</Text>
          <Text className="text-slate-400 text-sm">AI insights, notes & specialist feedback</Text>
        </View>
        <Pressable
          onPress={() => setShowAddForm(true)}
          className="bg-teal-500 px-4 py-2 rounded-xl flex-row items-center gap-2"
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text className="text-white font-medium text-sm">Add Entry</Text>
        </Pressable>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
        <View className="flex-row gap-2">
          {FILTERS.map((type) => (
            <Pressable
              key={type}
              onPress={() => setFilter(type)}
              className={`px-4 py-2 rounded-full ${
                filter === type ? 'bg-teal-500' : 'bg-slate-900'
              }`}
            >
              <Text
                className={`text-sm capitalize ${
                  filter === type ? 'text-white font-semibold' : 'text-slate-300'
                }`}
              >
                {type === 'ai' ? 'AI Analysis' : type}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Add form */}
      {showAddForm && (
        <View className="bg-slate-900 rounded-2xl p-5 border border-slate-800 mb-6">
          <Text className="text-lg font-semibold text-white mb-4">Add Analysis Entry</Text>

          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-sm text-slate-300 mb-1">Date</Text>
              <TextInput
                value={newEntry.date}
                onChangeText={(text) => setNewEntry((prev) => ({ ...prev, date: text }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#64748b"
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm text-slate-300 mb-1">Type</Text>
              <View className="flex-row gap-1">
                {typeButtons.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setNewEntry((prev) => ({ ...prev, type: t }))}
                    className={`flex-1 px-2 py-2 rounded-lg items-center ${
                      newEntry.type === t ? 'bg-teal-500' : 'bg-slate-800'
                    }`}
                  >
                    <Text
                      className={`text-xs capitalize ${
                        newEntry.type === t ? 'text-white font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {t === 'ai' ? 'AI' : t}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-sm text-slate-300 mb-1">Title</Text>
            <TextInput
              value={newEntry.title || ''}
              onChangeText={(text) => setNewEntry((prev) => ({ ...prev, title: text }))}
              placeholder="e.g., Weekly Progress Review"
              placeholderTextColor="#64748b"
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm text-slate-300 mb-1">Content</Text>
            <TextInput
              value={newEntry.content || ''}
              onChangeText={(text) => setNewEntry((prev) => ({ ...prev, content: text }))}
              placeholder="Your analysis, observations, or notes..."
              placeholderTextColor="#64748b"
              multiline
              numberOfLines={6}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white min-h-[160px]"
              textAlignVertical="top"
            />
          </View>

          <View className="flex-row gap-2">
            <Pressable
              onPress={addEntry}
              className="bg-teal-500 px-4 py-2.5 rounded-xl flex-1 items-center"
            >
              <Text className="text-white font-medium">Save Entry</Text>
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

      {/* Entries */}
      {isLoading ? (
        <LoadingState label="Loading analysis log..." />
      ) : filteredEntries.length === 0 ? (
        <View className="bg-slate-900 rounded-2xl p-8 border border-slate-800 border-dashed items-center">
          <Text className="text-slate-300 text-center">
            No entries yet. Add your first analysis to start documenting your journey.
          </Text>
        </View>
      ) : (
        filteredEntries.map((entry) => {
          const config = typeConfig[entry.type];
          const isExpanded = expandedEntries[entry.id] ?? false;
          const isLong =
            entry.content.length > 240 || entry.content.split('\n').length > 6;
          return (
            <View
              key={entry.id}
              className="bg-slate-900 rounded-2xl p-5 border border-slate-800 mb-3"
            >
              <View className="flex-row items-start justify-between gap-3 mb-3">
                <View className="flex-row items-center gap-3 flex-1">
                  <View className={`p-2 rounded-lg ${config.bg}`}>
                    <Ionicons name={config.icon} size={20} color={config.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-semibold" numberOfLines={2}>
                      {entry.title}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <Ionicons name="calendar-outline" size={12} color="#94a3b8" />
                      <Text className="text-slate-400 text-xs">
                        {format(new Date(entry.date), 'MMMM d, yyyy')}
                      </Text>
                      <View className={`${config.bg} px-2 py-0.5 rounded`}>
                        <Text className="text-xs capitalize" style={{ color: config.color }}>
                          {entry.type === 'ai' ? 'AI Analysis' : entry.type}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <Pressable onPress={() => deleteEntry(entry.id)} className="p-2">
                  <Ionicons name="trash-outline" size={16} color="#94a3b8" />
                </Pressable>
              </View>

              <Text
                className="text-slate-200 text-sm leading-6"
                numberOfLines={isExpanded ? undefined : 8}
                style={contentStyle}
              >
                {entry.content}
              </Text>
              {isLong ? (
                <Pressable
                  onPress={() =>
                    setExpandedEntries((prev) => ({ ...prev, [entry.id]: !isExpanded }))
                  }
                  className="mt-3"
                >
                  <Text className="text-teal-400 text-sm font-medium">
                    {isExpanded ? 'Show less' : 'Show more'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
