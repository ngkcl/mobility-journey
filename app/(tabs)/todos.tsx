import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getSupabase } from '../../lib/supabase';
import LoadingState from '../../components/LoadingState';
import { useToast } from '../../components/Toast';
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
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  exercise: { label: 'Exercise', icon: 'barbell', color: '#7dd3fc', bg: 'bg-sky-500/20' },
  appointment: { label: 'Appointment', icon: 'calendar', color: '#6ee7b7', bg: 'bg-emerald-500/20' },
  supplement: { label: 'Supplement', icon: 'medkit', color: '#fcd34d', bg: 'bg-amber-500/20' },
  other: { label: 'Other', icon: 'ellipse', color: '#94a3b8', bg: 'bg-slate-500/20' },
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

    if (error) {
      pushToast('Failed to load tasks.', 'error');
      setIsLoading(false);
      return;
    }

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

  useEffect(() => {
    loadTodos();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTodos();
    setRefreshing(false);
  };

  const addTodo = async () => {
    if (!newTodo.title?.trim()) {
      pushToast('Title is required.', 'error');
      return;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('todos')
      .insert({
        title: newTodo.title.trim(),
        details: newTodo.details ?? null,
        category: newTodo.category ?? 'other',
        frequency: newTodo.frequency ?? null,
        due_date: newTodo.dueDate ?? null,
        completed: false,
      })
      .select('id, title, details, completed, completed_at, due_date, category, frequency')
      .single();

    if (error || !data) {
      pushToast('Failed to save task.', 'error');
      return;
    }

    const todo: TodoItem = {
      id: data.id,
      title: data.title,
      details: data.details ?? undefined,
      completed: data.completed ?? false,
      completedAt: data.completed_at,
      dueDate: data.due_date,
      category: (data.category ?? 'other') as TodoCategory,
      frequency: data.frequency ?? undefined,
    };

    setTodos((prev) => [todo, ...prev]);
    setNewTodo({ category: 'exercise', frequency: 'daily', completed: false });
    setShowAddForm(false);
    pushToast('Task added!', 'success');
  };

  const toggleComplete = (todo: TodoItem) => {
    const nextCompleted = !todo.completed;
    const nextCompletedAt = nextCompleted ? new Date().toISOString() : null;

    setTodos((prev) =>
      prev.map((item) =>
        item.id === todo.id
          ? { ...item, completed: nextCompleted, completedAt: nextCompletedAt }
          : item,
      ),
    );

    (async () => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('todos')
        .update({ completed: nextCompleted, completed_at: nextCompletedAt })
        .eq('id', todo.id);

      if (error) {
        setTodos((prev) =>
          prev.map((item) =>
            item.id === todo.id
              ? { ...item, completed: todo.completed, completedAt: todo.completedAt }
              : item,
          ),
        );
        pushToast('Failed to update task.', 'error');
      }
    })();
  };

  const deleteTodo = (id: string) => {
    Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const prev = todos;
          setTodos((current) => current.filter((todo) => todo.id !== id));
          const supabase = getSupabase();
          const { error } = await supabase.from('todos').delete().eq('id', id);
          if (error) {
            setTodos(prev);
            pushToast('Failed to delete task.', 'error');
          }
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
    return (
      format(new Date(todo.completedAt), 'yyyy-MM-dd') ===
      format(new Date(), 'yyyy-MM-dd')
    );
  }).length;
  const completionRate =
    todos.length > 0 ? Math.round((todos.filter((todo) => todo.completed).length / todos.length) * 100) : 0;

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
          <Text className="text-2xl font-semibold text-white">Protocol & Tasks</Text>
          <Text className="text-slate-400 text-sm">Exercises, appointments, and daily routine</Text>
        </View>
        <Pressable
          onPress={() => setShowAddForm(true)}
          className="bg-teal-500 px-4 py-2 rounded-xl flex-row items-center gap-2"
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text className="text-white font-medium text-sm">Add Task</Text>
        </Pressable>
      </View>

      {/* Stats */}
      <View className="flex-row flex-wrap gap-3 mb-6">
        <View className="flex-1 min-w-[140px] bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70">
          <Text className="text-2xl font-bold text-white">{todos.length}</Text>
          <Text className="text-slate-400 text-sm">Total Tasks</Text>
        </View>
        <View className="flex-1 min-w-[140px] bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70">
          <Text className="text-2xl font-bold text-amber-300">{pendingCount}</Text>
          <Text className="text-slate-400 text-sm">Pending</Text>
        </View>
        <View className="flex-1 min-w-[140px] bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70">
          <Text className="text-2xl font-bold text-emerald-300">{completedToday}</Text>
          <Text className="text-slate-400 text-sm">Completed Today</Text>
        </View>
        <View className="flex-1 min-w-[140px] bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70">
          <Text className="text-2xl font-bold text-sky-300">{completionRate}%</Text>
          <Text className="text-slate-400 text-sm">Completion Rate</Text>
        </View>
      </View>

      {/* Filters */}
      <View className="flex flex-row flex-wrap gap-3 mb-6">
        <View className="flex-row gap-1 bg-slate-900/70 p-1 rounded-xl border border-slate-800/70">
          {(['all', 'pending', 'completed'] as const).map((status) => (
            <Pressable
              key={status}
              onPress={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg ${statusFilter === status ? 'bg-teal-500' : ''}`}
            >
              <Text
                className={`text-sm capitalize ${statusFilter === status ? 'text-white' : 'text-slate-300'}`}
              >
                {status}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="flex-row gap-1 bg-slate-900/70 p-1 rounded-xl border border-slate-800/70">
          {(['all', ...CATEGORY_OPTIONS] as const).map((category) => (
            <Pressable
              key={category}
              onPress={() => setCategoryFilter(category as 'all' | TodoCategory)}
              className={`px-3 py-1.5 rounded-lg ${categoryFilter === category ? 'bg-teal-500' : ''}`}
            >
              <Text
                className={`text-sm capitalize ${categoryFilter === category ? 'text-white' : 'text-slate-300'}`}
              >
                {category}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Add Form */}
      {showAddForm && (
        <View className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800/70 mb-6">
          <Text className="text-lg font-semibold text-white mb-4">Add New Task</Text>

          <TextInput
            placeholder="Title"
            placeholderTextColor="#94a3b8"
            className="bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white mb-3"
            value={newTodo.title ?? ''}
            onChangeText={(text) => setNewTodo((prev) => ({ ...prev, title: text }))}
          />

          <TextInput
            placeholder="Description"
            placeholderTextColor="#94a3b8"
            className="bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white mb-3"
            value={newTodo.details ?? ''}
            onChangeText={(text) => setNewTodo((prev) => ({ ...prev, details: text }))}
            multiline
          />

          <TextInput
            placeholder="Due date (YYYY-MM-DD)"
            placeholderTextColor="#94a3b8"
            className="bg-slate-950/70 border border-slate-800/70 rounded-xl px-4 py-3 text-white mb-4"
            value={newTodo.dueDate ?? ''}
            onChangeText={(text) => setNewTodo((prev) => ({ ...prev, dueDate: text }))}
          />

          <Text className="text-slate-300 text-sm mb-2">Category</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {CATEGORY_OPTIONS.map((category) => (
              <Pressable
                key={category}
                onPress={() => setNewTodo((prev) => ({ ...prev, category }))}
                className={`px-3 py-2 rounded-lg border ${
                  newTodo.category === category ? 'bg-teal-500 border-teal-400' : 'border-slate-700'
                }`}
              >
                <Text className={`${newTodo.category === category ? 'text-white' : 'text-slate-300'} capitalize`}>
                  {category}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="text-slate-300 text-sm mb-2">Frequency</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {FREQUENCY_OPTIONS.map((frequency) => (
              <Pressable
                key={frequency}
                onPress={() => setNewTodo((prev) => ({ ...prev, frequency }))}
                className={`px-3 py-2 rounded-lg border ${
                  newTodo.frequency === frequency ? 'bg-teal-500 border-teal-400' : 'border-slate-700'
                }`}
              >
                <Text className={`${newTodo.frequency === frequency ? 'text-white' : 'text-slate-300'} capitalize`}>
                  {frequency}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-xl border border-slate-700"
            >
              <Text className="text-slate-300">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={addTodo}
              className="px-4 py-2 rounded-xl bg-teal-500"
            >
              <Text className="text-white font-medium">Save Task</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* List */}
      {isLoading ? (
        <LoadingState label="Loading tasks..." />
      ) : filteredTodos.length === 0 ? (
        <View className="bg-slate-900/70 rounded-2xl p-6 border border-slate-800/70 items-center">
          <Text className="text-white font-semibold mb-2">No tasks yet</Text>
          <Text className="text-slate-400 text-center">
            Add your first protocol task to get started.
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          {filteredTodos.map((todo) => {
            const categoryMeta = categoryConfig[todo.category];
            return (
              <View
                key={todo.id}
                className={`rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4 ${
                  todo.completed ? 'opacity-60' : ''
                }`}
              >
                <View className="flex-row items-start gap-3">
                  <Pressable
                    onPress={() => toggleComplete(todo)}
                    className={`w-8 h-8 rounded-full border items-center justify-center ${
                      todo.completed ? 'border-teal-400 bg-teal-500/20' : 'border-slate-600'
                    }`}
                  >
                    {todo.completed ? (
                      <Ionicons name="checkmark" size={18} color="#5eead4" />
                    ) : null}
                  </Pressable>

                  <View className="flex-1">
                    <View className="flex-row items-center justify-between">
                      <Text
                        className={`text-base font-semibold ${
                          todo.completed ? 'text-slate-400 line-through' : 'text-white'
                        }`}
                      >
                        {todo.title}
                      </Text>
                      <Pressable onPress={() => deleteTodo(todo.id)}>
                        <Ionicons name="trash-outline" size={18} color="#fca5a5" />
                      </Pressable>
                    </View>

                    {todo.details ? (
                      <Text className="text-slate-400 text-sm mt-1">{todo.details}</Text>
                    ) : null}

                    <View className="flex-row flex-wrap items-center gap-2 mt-3">
                      <View className={`flex-row items-center gap-2 px-2.5 py-1 rounded-full ${categoryMeta.bg}`}>
                        <Ionicons name={categoryMeta.icon} size={14} color={categoryMeta.color} />
                        <Text className="text-xs text-slate-200">{categoryMeta.label}</Text>
                      </View>

                      {todo.frequency ? (
                        <View className="px-2.5 py-1 rounded-full border border-slate-700">
                          <Text className="text-xs text-slate-300 capitalize">{todo.frequency}</Text>
                        </View>
                      ) : null}

                      <View className="px-2.5 py-1 rounded-full border border-slate-700">
                        <Text className="text-xs text-slate-300">{formatDate(todo.dueDate)}</Text>
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
