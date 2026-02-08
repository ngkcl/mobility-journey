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
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getSupabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import LoadingState from '../../components/LoadingState';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';
import type { AnalysisEntry as AnalysisRow, AnalysisType } from '../../lib/types';

const FILTERS: readonly ('all' | AnalysisType)[] = ['all', 'ai', 'personal', 'specialist'];

const typeConfig: Record<AnalysisType, { icon: keyof typeof Ionicons.glyphMap; color: string; bgDim: string }> = {
  ai: { icon: 'sparkles', color: '#fbbf24', bgDim: 'rgba(245,158,11,0.15)' },
  personal: { icon: 'person', color: '#38bdf8', bgDim: 'rgba(56,189,248,0.15)' },
  specialist: { icon: 'medkit', color: '#34d399', bgDim: 'rgba(52,211,153,0.15)' },
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

  useEffect(() => { loadEntries(); }, []);

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
          if (error) { setEntries(prev); pushToast('Failed to delete.', 'error'); }
        },
      },
    ]);
  };

  const filteredEntries = filter === 'all' ? entries : entries.filter((e) => e.type === filter);
  const typeButtons: AnalysisType[] = ['personal', 'ai', 'specialist'];
  const contentStyle = Platform.OS === 'web' ? ({ whiteSpace: 'pre-wrap' } as any) : undefined;

  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealLight} />}
    >
      {/* Header */}
      <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
        <View>
          <Text style={shared.pageTitle}>Analysis Log</Text>
          <Text style={shared.pageSubtitle}>AI insights, notes & specialist feedback</Text>
        </View>
        <Pressable onPress={() => setShowAddForm(true)} style={[shared.btnPrimary, shared.btnSmall]}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ ...typography.captionMedium, color: '#fff' }}>Add Entry</Text>
        </Pressable>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
        <View style={[shared.row, { gap: spacing.sm }]}>
          {FILTERS.map((type) => (
            <Pressable
              key={type}
              onPress={() => setFilter(type)}
              style={{
                paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.full,
                backgroundColor: filter === type ? colors.teal : colors.bgBase,
              }}
            >
              <Text style={{
                ...typography.caption,
                color: filter === type ? '#fff' : colors.textSecondary,
                fontWeight: filter === type ? '600' : '400',
                textTransform: 'capitalize',
              }}>
                {type === 'ai' ? 'AI Analysis' : type}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Add form */}
      {showAddForm && (
        <View style={[shared.card, { marginBottom: spacing.lg }]}>
          <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg }}>Add Analysis Entry</Text>

          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Text style={shared.inputLabel}>Date</Text>
              <TextInput value={newEntry.date} onChangeText={(text) => setNewEntry((prev) => ({ ...prev, date: text }))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textPlaceholder} style={shared.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={shared.inputLabel}>Type</Text>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {typeButtons.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setNewEntry((prev) => ({ ...prev, type: t }))}
                    style={{
                      flex: 1, paddingVertical: spacing.sm, borderRadius: radii.md, alignItems: 'center',
                      backgroundColor: newEntry.type === t ? colors.teal : colors.bgCard,
                    }}
                  >
                    <Text style={{ ...typography.small, color: newEntry.type === t ? '#fff' : colors.textTertiary, fontWeight: newEntry.type === t ? '600' : '400', textTransform: 'capitalize' }}>
                      {t === 'ai' ? 'AI' : t}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View style={{ marginBottom: spacing.lg }}>
            <Text style={shared.inputLabel}>Title</Text>
            <TextInput value={newEntry.title || ''} onChangeText={(text) => setNewEntry((prev) => ({ ...prev, title: text }))} placeholder="e.g., Weekly Progress Review" placeholderTextColor={colors.textPlaceholder} style={shared.input} />
          </View>

          <View style={{ marginBottom: spacing.lg }}>
            <Text style={shared.inputLabel}>Content</Text>
            <TextInput value={newEntry.content || ''} onChangeText={(text) => setNewEntry((prev) => ({ ...prev, content: text }))} placeholder="Your analysis, observations, or notes..." placeholderTextColor={colors.textPlaceholder} multiline numberOfLines={6} style={[shared.input, { minHeight: 160, textAlignVertical: 'top' }]} />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable onPress={addEntry} style={[shared.btnPrimary, { flex: 1 }]}>
              <Text style={shared.btnPrimaryText}>Save Entry</Text>
            </Pressable>
            <Pressable onPress={() => setShowAddForm(false)} style={shared.btnSecondary}>
              <Text style={shared.btnSecondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Entries */}
      {isLoading ? (
        <LoadingState label="Loading analysis log..." />
      ) : filteredEntries.length === 0 ? (
        <View style={[shared.card, { borderStyle: 'dashed', alignItems: 'center', paddingVertical: spacing['3xl'] }]}>
          <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
          <Text style={shared.emptyStateTitle}>No entries yet</Text>
          <Text style={shared.emptyStateText}>
            Add your first analysis to start documenting your journey.
          </Text>
        </View>
      ) : (
        filteredEntries.map((entry) => {
          const config = typeConfig[entry.type];
          const isExpanded = expandedEntries[entry.id] ?? false;
          const isLong = entry.content.length > 240 || entry.content.split('\n').length > 6;
          return (
            <View key={entry.id} style={[shared.card, { marginBottom: spacing.md }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}>
                  <View style={{ padding: spacing.sm, borderRadius: radii.md, backgroundColor: config.bgDim }}>
                    <Ionicons name={config.icon} size={20} color={config.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...typography.bodySemibold, color: colors.textPrimary }} numberOfLines={2}>{entry.title}</Text>
                    <View style={[shared.row, { gap: spacing.sm, marginTop: spacing.xs }]}>
                      <Ionicons name="calendar-outline" size={12} color={colors.textTertiary} />
                      <Text style={{ ...typography.small, color: colors.textTertiary }}>{format(new Date(entry.date), 'MMMM d, yyyy')}</Text>
                      <View style={[shared.badge, { backgroundColor: config.bgDim }]}>
                        <Text style={{ ...typography.small, color: config.color, textTransform: 'capitalize' }}>
                          {entry.type === 'ai' ? 'AI Analysis' : entry.type}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <Pressable onPress={() => deleteEntry(entry.id)} style={{ padding: spacing.sm }}>
                  <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                </Pressable>
              </View>

              <Text style={[{ ...typography.body, color: colors.textSecondary, lineHeight: 22 }, contentStyle]} numberOfLines={isExpanded ? undefined : 8}>
                {entry.content}
              </Text>
              {isLong ? (
                <Pressable onPress={() => setExpandedEntries((prev) => ({ ...prev, [entry.id]: !isExpanded }))} style={{ marginTop: spacing.md }}>
                  <Text style={{ ...typography.captionMedium, color: colors.tealLight }}>{isExpanded ? 'Show less' : 'Show more'}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
});
