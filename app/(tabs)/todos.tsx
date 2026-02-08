import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getSupabase } from '../../lib/supabase';
import LoadingState from '../../components/LoadingState';
import { useToast } from '../../components/Toast';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';
import type { Todo as TodoRow, TodoCategory, TodoFrequency } from '../../lib/types';

type TodoItem = {
  id: string;
  title: string;
  details?: string;
  completed: boolean;
  completedAt?: string | null;
  dueDate?: string | null;
  category: TodoCategory;
  frequency?: TodoFrequency | null;
};

const CATEGORY_OPTIONS: TodoCategory[] = ['exercise', 'appointment', 'supplement', 'other'];
const FREQUENCY_OPTIONS: TodoFrequency[] = ['daily', 'weekly', 'once'];

const categoryConfig: Record<
  TodoCategory,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bgDim: string }
> = {
  exercise: { label: 'Exercise', icon: 'barbell', color: '#7dd3fc', bgDim: 'rgba(56,189,248,0.15)' },
  appointment: { label: 'Appointment', icon: 'calendar', color: '#6ee7b7', bgDim: 'rgba(110,231,183,0.15)' },
  supplement: { label: 'Supplement', icon: 'medkit', color: '#fcd34d', bgDim: 'rgba(252,211,77,0.15)' },
  other: { label: 'Other', icon: 'ellipse', color: '#94a3b8', bgDim: 'rgba(148,163,184,0.15)' },
};

const formatDate = (date?: string | null) => {
  if (!date) return 'No due date';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return format(parsed, 'MMM d, yyyy');
};

export default function TodosScreen() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TodoCategory>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { pushToast } = useToast();
  const [newTodo, setNewTodo] = useState<Partial<TodoItem>>({
    category: 'exercise',
    frequency: 'daily',
    completed: false,
  });

  const loadTodos = async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('todos')
      .select('id, title, details, completed, completed_at, due_date, category, frequency')
      .order('due_date', { ascending: true });

    if (error) { pushToast('Failed to load tasks.', 'error'); setIsLoading(false); return; }

    const normalized = (data ?? []).map((row: TodoRow) => ({
      id: row.id,
      title: row.title,
      details: row.details ?? undefined,
      completed: row.completed ?? false,
      completedAt: row.completed_at,
      dueDate: row.due_date,
      category: (row.category ?? 'other') as TodoCategory,
      frequency: row.frequency ?? undefined,
    }));

    setTodos(normalized);
    setIsLoading(false);
  };

  useEffect(() => { loadTodos(); }, []);

  const onRefresh = async () => { setRefreshing(true); await loadTodos(); setRefreshing(false); };

  const addTodo = async () => {
    if (!newTodo.title?.trim()) { pushToast('Title is required.', 'error'); return; }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('todos')
      .insert({ title: newTodo.title.trim(), details: newTodo.details ?? null, category: newTodo.category ?? 'other', frequency: newTodo.frequency ?? null, due_date: newTodo.dueDate ?? null, completed: false })
      .select('id, title, details, completed, completed_at, due_date, category, frequency')
      .single();

    if (error || !data) { pushToast('Failed to save task.', 'error'); return; }

    const todo: TodoItem = {
      id: data.id, title: data.title, details: data.details ?? undefined, completed: data.completed ?? false,
      completedAt: data.completed_at, dueDate: data.due_date, category: (data.category ?? 'other') as TodoCategory, frequency: data.frequency ?? undefined,
    };

    setTodos((prev) => [todo, ...prev]);
    setNewTodo({ category: 'exercise', frequency: 'daily', completed: false });
    setShowAddForm(false);
    pushToast('Task added!', 'success');
  };

  const toggleComplete = (todo: TodoItem) => {
    const nextCompleted = !todo.completed;
    const nextCompletedAt = nextCompleted ? new Date().toISOString() : null;
    setTodos((prev) => prev.map((item) => item.id === todo.id ? { ...item, completed: nextCompleted, completedAt: nextCompletedAt } : item));
    (async () => {
      const supabase = getSupabase();
      const { error } = await supabase.from('todos').update({ completed: nextCompleted, completed_at: nextCompletedAt }).eq('id', todo.id);
      if (error) {
        setTodos((prev) => prev.map((item) => item.id === todo.id ? { ...item, completed: todo.completed, completedAt: todo.completedAt } : item));
        pushToast('Failed to update task.', 'error');
      }
    })();
  };

  const deleteTodo = (id: string) => {
    Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const prev = todos;
          setTodos((current) => current.filter((todo) => todo.id !== id));
          const supabase = getSupabase();
          const { error } = await supabase.from('todos').delete().eq('id', id);
          if (error) { setTodos(prev); pushToast('Failed to delete task.', 'error'); }
        },
      },
    ]);
  };

  const filteredTodos = todos.filter((todo) => {
    if (statusFilter === 'pending' && todo.completed) return false;
    if (statusFilter === 'completed' && !todo.completed) return false;
    if (categoryFilter !== 'all' && todo.category !== categoryFilter) return false;
    return true;
  });

  const pendingCount = todos.filter((todo) => !todo.completed).length;
  const completedToday = todos.filter((todo) => {
    if (!todo.completed || !todo.completedAt) return false;
    return format(new Date(todo.completedAt), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  }).length;
  const completionRate = todos.length > 0 ? Math.round((todos.filter((todo) => todo.completed).length / todos.length) * 100) : 0;

  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealLight} />}
    >
      {/* Header */}
      <View style={[shared.rowBetween, { marginBottom: spacing.lg }]}>
        <View>
          <Text style={shared.pageTitle}>Protocol & Tasks</Text>
          <Text style={shared.pageSubtitle}>Exercises, appointments, and daily routine</Text>
        </View>
        <Pressable onPress={() => setShowAddForm(true)} style={[shared.btnPrimary, shared.btnSmall]}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ ...typography.captionMedium, color: '#fff' }}>Add Task</Text>
        </Pressable>
      </View>

      {/* Stats */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg }}>
        {[
          { label: 'Total Tasks', value: todos.length, color: colors.textPrimary },
          { label: 'Pending', value: pendingCount, color: colors.warning },
          { label: 'Completed Today', value: completedToday, color: colors.success },
          { label: 'Completion Rate', value: `${completionRate}%`, color: colors.info },
        ].map((stat) => (
          <View key={stat.label} style={[shared.card, { flex: 1, minWidth: 140 }]}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: stat.color }}>{stat.value}</Text>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Filters */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.bgBase, padding: spacing.xs, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border }}>
          {(['all', 'pending', 'completed'] as const).map((status) => (
            <Pressable
              key={status}
              onPress={() => setStatusFilter(status)}
              style={{ paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.md, backgroundColor: statusFilter === status ? colors.teal : 'transparent' }}
            >
              <Text style={{ ...typography.caption, color: statusFilter === status ? '#fff' : colors.textSecondary, textTransform: 'capitalize' }}>{status}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.bgBase, padding: spacing.xs, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border }}>
          {(['all', ...CATEGORY_OPTIONS] as const).map((category) => (
            <Pressable
              key={category}
              onPress={() => setCategoryFilter(category as 'all' | TodoCategory)}
              style={{ paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.md, backgroundColor: categoryFilter === category ? colors.teal : 'transparent' }}
            >
              <Text style={{ ...typography.caption, color: categoryFilter === category ? '#fff' : colors.textSecondary, textTransform: 'capitalize' }}>{category}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Add Form */}
      {showAddForm && (
        <View style={[shared.card, { marginBottom: spacing.lg }]}>
          <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: spacing.lg }}>Add New Task</Text>

          <TextInput placeholder="Title" placeholderTextColor={colors.textTertiary} style={[shared.input, { marginBottom: spacing.md }]} value={newTodo.title ?? ''} onChangeText={(text) => setNewTodo((prev) => ({ ...prev, title: text }))} />
          <TextInput placeholder="Description" placeholderTextColor={colors.textTertiary} style={[shared.input, { marginBottom: spacing.md }]} value={newTodo.details ?? ''} onChangeText={(text) => setNewTodo((prev) => ({ ...prev, details: text }))} multiline />
          <TextInput placeholder="Due date (YYYY-MM-DD)" placeholderTextColor={colors.textTertiary} style={[shared.input, { marginBottom: spacing.lg }]} value={newTodo.dueDate ?? ''} onChangeText={(text) => setNewTodo((prev) => ({ ...prev, dueDate: text }))} />

          <Text style={[shared.inputLabel, { marginBottom: spacing.sm }]}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
            {CATEGORY_OPTIONS.map((category) => (
              <Pressable key={category} onPress={() => setNewTodo((prev) => ({ ...prev, category }))} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, backgroundColor: newTodo.category === category ? colors.teal : 'transparent', borderColor: newTodo.category === category ? colors.teal : colors.border }}>
                <Text style={{ ...typography.caption, color: newTodo.category === category ? '#fff' : colors.textSecondary, textTransform: 'capitalize' }}>{category}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[shared.inputLabel, { marginBottom: spacing.sm }]}>Frequency</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
            {FREQUENCY_OPTIONS.map((frequency) => (
              <Pressable key={frequency} onPress={() => setNewTodo((prev) => ({ ...prev, frequency }))} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, backgroundColor: newTodo.frequency === frequency ? colors.teal : 'transparent', borderColor: newTodo.frequency === frequency ? colors.teal : colors.border }}>
                <Text style={{ ...typography.caption, color: newTodo.frequency === frequency ? '#fff' : colors.textSecondary, textTransform: 'capitalize' }}>{frequency}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md }}>
            <Pressable onPress={() => setShowAddForm(false)} style={shared.btnSecondary}>
              <Text style={shared.btnSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={addTodo} style={shared.btnPrimary}>
              <Text style={shared.btnPrimaryText}>Save Task</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* List */}
      {isLoading ? (
        <LoadingState label="Loading tasks..." />
      ) : filteredTodos.length === 0 ? (
        <View style={[shared.card, { borderStyle: 'dashed', alignItems: 'center', paddingVertical: spacing['3xl'] }]}>
          <Ionicons name="checkbox-outline" size={40} color={colors.textMuted} />
          <Text style={shared.emptyStateTitle}>No tasks yet</Text>
          <Text style={shared.emptyStateText}>Add your first protocol task to get started.</Text>
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {filteredTodos.map((todo) => {
            const categoryMeta = categoryConfig[todo.category];
            return (
              <View key={todo.id} style={[shared.card, todo.completed && { opacity: 0.6 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                  <Pressable
                    onPress={() => toggleComplete(todo)}
                    style={{
                      width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
                      borderColor: todo.completed ? colors.tealBorder : colors.border,
                      backgroundColor: todo.completed ? colors.tealDim : 'transparent',
                    }}
                  >
                    {todo.completed ? <Ionicons name="checkmark" size={18} color={colors.tealLight} /> : null}
                  </Pressable>

                  <View style={{ flex: 1 }}>
                    <View style={shared.rowBetween}>
                      <Text style={{ ...typography.bodySemibold, color: todo.completed ? colors.textTertiary : colors.textPrimary, textDecorationLine: todo.completed ? 'line-through' : 'none' }}>{todo.title}</Text>
                      <Pressable onPress={() => deleteTodo(todo.id)}>
                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                      </Pressable>
                    </View>

                    {todo.details ? <Text style={{ ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs }}>{todo.details}</Text> : null}

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
                      <View style={[shared.badge, { backgroundColor: categoryMeta.bgDim }]}>
                        <Ionicons name={categoryMeta.icon} size={14} color={categoryMeta.color} />
                        <Text style={{ ...typography.small, color: colors.textSecondary }}>{categoryMeta.label}</Text>
                      </View>
                      {todo.frequency ? (
                        <View style={[shared.badge, { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border }]}>
                          <Text style={{ ...typography.small, color: colors.textSecondary, textTransform: 'capitalize' }}>{todo.frequency}</Text>
                        </View>
                      ) : null}
                      <View style={[shared.badge, { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border }]}>
                        <Text style={{ ...typography.small, color: colors.textSecondary }}>{formatDate(todo.dueDate)}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
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
