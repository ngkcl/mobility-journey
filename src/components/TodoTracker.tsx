'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Check, Circle, Clock, Calendar, Dumbbell, Stethoscope, Pill } from 'lucide-react';
import { format, isSameDay, isWithinInterval, startOfWeek, endOfWeek, startOfDay, subDays, eachDayOfInterval, isAfter } from 'date-fns';
import { getSupabase } from '@/lib/supabaseClient';
import LoadingState from '@/components/LoadingState';
import { useToast } from '@/components/ToastProvider';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

interface Todo {
  id: string;
  title: string;
  description?: string;
  category: 'exercise' | 'appointment' | 'supplement' | 'other';
  frequency?: 'daily' | 'mwf' | 'custom' | 'once' | 'weekly';
  scheduleDays?: DayKey[];
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
}

const categoryConfig = {
  exercise: { icon: Dumbbell, color: 'text-sky-300', bg: 'bg-sky-500/20' },
  appointment: { icon: Stethoscope, color: 'text-emerald-300', bg: 'bg-emerald-500/20' },
  supplement: { icon: Pill, color: 'text-amber-300', bg: 'bg-amber-500/20' },
  other: { icon: Circle, color: 'text-slate-400', bg: 'bg-slate-500/20' },
};

const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};
const DAY_INDEX_MAP: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MWF_DAYS: DayKey[] = ['mon', 'wed', 'fri'];

const scheduleOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'mwf', label: 'M/W/F' },
  { value: 'custom', label: 'Custom days' },
  { value: 'once', label: 'One-time' },
] as const;

const getDayKeyForDate = (date: Date): DayKey => DAY_INDEX_MAP[date.getDay()];

const formatScheduleLabel = (todo: Todo) => {
  switch (todo.frequency) {
    case 'daily':
      return 'Daily';
    case 'mwf':
      return 'Mon / Wed / Fri';
    case 'custom': {
      const scheduleDays = new Set(todo.scheduleDays ?? []);
      const days = DAY_ORDER.filter((day) => scheduleDays.has(day)).map((day) => DAY_LABELS[day]);
      return days.length > 0 ? days.join(' / ') : 'Custom days';
    }
    case 'once':
      return 'One-time';
    case 'weekly':
      return 'Weekly';
    default:
      return 'Daily';
  }
};

const isScheduledForDate = (todo: Todo, date: Date) => {
  const dayKey = getDayKeyForDate(date);

  if (todo.frequency === 'once') {
    if (!todo.dueDate) return false;
    return isSameDay(new Date(todo.dueDate), date);
  }

  if (todo.frequency === 'custom') {
    return (todo.scheduleDays ?? []).includes(dayKey);
  }

  if (todo.frequency === 'mwf') {
    return MWF_DAYS.includes(dayKey);
  }

  if (todo.frequency === 'weekly') {
    if (todo.scheduleDays && todo.scheduleDays.length > 0) {
      return todo.scheduleDays.includes(dayKey);
    }
    if (todo.dueDate) {
      return getDayKeyForDate(new Date(todo.dueDate)) === dayKey;
    }
    return false;
  }

  return true;
};

const isCompletedOnDate = (todo: Todo, date: Date) => {
  if (!todo.completed) return false;
  if (!todo.completedAt) return true;
  return isSameDay(new Date(todo.completedAt), date);
};

const isRecurringTodo = (todo: Todo) => todo.frequency !== 'once';

const isCompleteForDate = (todo: Todo, date: Date) => {
  if (isRecurringTodo(todo)) {
    return isCompletedOnDate(todo, date);
  }
  return todo.completed;
};

export default function TodoTracker() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | Todo['category']>('all');
  const [isLoading, setIsLoading] = useState(true);
  const { pushToast } = useToast();
  const [newTodo, setNewTodo] = useState<Partial<Todo>>({
    category: 'exercise',
    frequency: 'daily',
    scheduleDays: [],
    completed: false,
  });

  useEffect(() => {
    let isMounted = true;

    const loadTodos = async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('todos')
        .select('id, title, details, completed, completed_at, due_date, category, frequency, schedule_days')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to load todos', error);
        if (isMounted) {
          setIsLoading(false);
          pushToast('Failed to load tasks. Please try again.', 'error');
        }
        return;
      }

      const normalized = (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.details ?? undefined,
        category: (row.category ?? 'other') as Todo['category'],
        frequency: (row.frequency ?? 'daily') as Todo['frequency'] | undefined,
        scheduleDays: (row.schedule_days ?? undefined) as Todo['scheduleDays'] | undefined,
        dueDate: row.due_date ?? undefined,
        completed: row.completed ?? false,
        completedAt: row.completed_at ?? undefined,
      }));

      if (isMounted) {
        setTodos(normalized);
        setIsLoading(false);
      }
    };

    loadTodos();

    return () => {
      isMounted = false;
    };
  }, [pushToast]);

  const addTodo = async () => {
    if (!newTodo.title) return;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('todos')
      .insert({
        title: newTodo.title,
        details: newTodo.description ?? null,
        category: newTodo.category ?? 'other',
        frequency: newTodo.frequency ?? null,
        schedule_days: newTodo.frequency === 'custom' || newTodo.frequency === 'mwf' ? newTodo.scheduleDays ?? [] : null,
        due_date: newTodo.frequency === 'once' ? newTodo.dueDate ?? null : null,
        completed: false,
      })
      .select('id, title, details, completed, completed_at, due_date, category, frequency, schedule_days')
      .single();

    if (error || !data) {
      console.error('Failed to save todo', error);
      pushToast('Failed to save task. Please try again.', 'error');
      return;
    }

    const todo: Todo = {
      id: data.id,
      title: data.title,
      description: data.details ?? undefined,
      category: (data.category ?? 'other') as Todo['category'],
      frequency: (data.frequency ?? undefined) as Todo['frequency'] | undefined,
      scheduleDays: (data.schedule_days ?? undefined) as Todo['scheduleDays'] | undefined,
      dueDate: data.due_date ?? undefined,
      completed: data.completed ?? false,
      completedAt: data.completed_at ?? undefined,
    };

    setTodos(prev => [todo, ...prev]);
    setNewTodo({ 
      category: 'exercise',
      frequency: 'daily',
      scheduleDays: [],
      completed: false,
    });
    setShowAddForm(false);
  };

  const toggleComplete = async (id: string) => {
    const supabase = getSupabase();
    const target = todos.find(todo => todo.id === id);
    if (!target) return;

    const now = new Date();
    const isCompleting = isRecurringTodo(target) ? !isCompletedOnDate(target, now) : !target.completed;
    const completedAt = isCompleting ? now.toISOString() : undefined;

    setTodos(prev => prev.map(t => 
      t.id === id 
        ? { ...t, completed: isCompleting, completedAt }
        : t
    ));

    const { error } = await supabase
      .from('todos')
      .update({
        completed: isCompleting,
        completed_at: isCompleting ? completedAt : null,
      })
      .eq('id', id);

    if (error) {
      console.error('Failed to update todo', error);
      pushToast('Failed to update task. Please refresh.', 'error');
    }
  };

  const deleteTodo = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    const supabase = getSupabase();
    const prev = todos;
    setTodos(p => p.filter(t => t.id !== id));
    const { error } = await supabase.from('todos').delete().eq('id', id);
    if (error) {
      setTodos(prev);
      console.error('Failed to delete. Restored.', error);
      pushToast('Failed to delete. Restored.', 'error');
    }
  };

  const today = useMemo(() => startOfDay(new Date()), []);
  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);
  const weekEnd = useMemo(() => endOfWeek(today, { weekStartsOn: 1 }), [today]);
  const calendarEnd = useMemo(() => endOfWeek(today, { weekStartsOn: 1 }), [today]);
  const calendarStart = useMemo(() => subDays(calendarEnd, 83), [calendarEnd]);

  const filteredTodos = todos.filter(todo => {
    const isComplete = isCompleteForDate(todo, today);
    if (filter === 'pending' && isComplete) return false;
    if (filter === 'completed' && !isComplete) return false;
    if (categoryFilter !== 'all' && todo.category !== categoryFilter) return false;
    return true;
  });

  const scheduledToday = useMemo(
    () => todos.filter((todo) => todo.category === 'exercise' && isScheduledForDate(todo, today)),
    [today, todos],
  );

  const pendingCount = todos.filter((todo) => !isCompleteForDate(todo, today)).length;
  const completedTodayCount = scheduledToday.filter((todo) => isCompleteForDate(todo, today)).length;
  const dailyCompliance = scheduledToday.length > 0 ? Math.round((completedTodayCount / scheduledToday.length) * 100) : 0;

  const scheduledThisWeek = todos.filter((todo) => {
    if (todo.category !== 'exercise') return false;
    if (todo.frequency === 'once') {
      if (!todo.dueDate) return false;
      return isWithinInterval(new Date(todo.dueDate), { start: weekStart, end: weekEnd });
    }
    if (todo.frequency === 'custom' && todo.scheduleDays && todo.scheduleDays.length === 0) return false;
    return true;
  });

  const completedThisWeek = scheduledThisWeek.filter((todo) => {
    if (!todo.completed) return false;
    if (!todo.completedAt) return true;
    return isWithinInterval(new Date(todo.completedAt), { start: weekStart, end: weekEnd });
  }).length;

  const weeklyCompliance = scheduledThisWeek.length > 0 ? Math.round((completedThisWeek / scheduledThisWeek.length) * 100) : 0;
  const getStatusForDate = useCallback((date: Date) => {
    if (isAfter(date, today)) return 'future';
    const scheduled = todos.filter((todo) => todo.category === 'exercise' && isScheduledForDate(todo, date));
    if (scheduled.length === 0) return 'rest';
    const completed = scheduled.every((todo) => isCompleteForDate(todo, date));
    return completed ? 'complete' : 'missed';
  }, [today, todos]);

  const streakSummary = useMemo(() => {
    const streakRange = eachDayOfInterval({ start: subDays(today, 180), end: today });
    let current = 0;
    let longest = 0;
    let run = 0;
    let totalActive = 0;

    streakRange.forEach((date) => {
      const status = getStatusForDate(date);
      if (status === 'complete') {
        run += 1;
        totalActive += 1;
        if (run > longest) longest = run;
      } else {
        run = 0;
      }
    });

    for (let i = streakRange.length - 1; i >= 0; i -= 1) {
      const status = getStatusForDate(streakRange[i]);
      if (status === 'complete') {
        current += 1;
      } else {
        break;
      }
    }

    return { current, longest, totalActive };
  }, [getStatusForDate, today]);

  const calendarDays = useMemo(
    () =>
      eachDayOfInterval({ start: calendarStart, end: calendarEnd }).map((date) => ({
        date,
        status: getStatusForDate(date),
      })),
    [calendarStart, calendarEnd, getStatusForDate],
  );

  const milestoneMessage = useMemo(() => {
    const milestones = [3, 7, 14, 21, 30, 60, 90];
    if (!milestones.includes(streakSummary.current)) return null;
    return `🔥 ${streakSummary.current}-day streak! Keep the momentum going.`;
  }, [streakSummary]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Protocol & Tasks</h2>
          <p className="text-slate-400">Exercises, appointments, and daily routine</p>
        </div>
        
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-400 transition-colors flex items-center gap-2 shadow-lg shadow-teal-500/20"
        >
          <Plus size={18} />
          <span>Add Task</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-white">{todos.length}</div>
          <div className="text-slate-400 text-sm">Total Tasks</div>
        </div>
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-amber-300">{pendingCount}</div>
          <div className="text-slate-400 text-sm">Pending</div>
        </div>
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-sky-300">{scheduledToday.length}</div>
          <div className="text-slate-400 text-sm">Scheduled Today</div>
        </div>
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-emerald-300">{dailyCompliance}%</div>
          <div className="text-slate-400 text-sm">Daily Compliance</div>
        </div>
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-teal-300">{weeklyCompliance}%</div>
          <div className="text-slate-400 text-sm">Weekly Compliance</div>
        </div>
      </div>

      {/* Streaks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-emerald-300">{streakSummary.current}</div>
          <div className="text-slate-400 text-sm">Current Streak</div>
        </div>
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-sky-300">{streakSummary.longest}</div>
          <div className="text-slate-400 text-sm">Longest Streak</div>
        </div>
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-amber-300">{streakSummary.totalActive}</div>
          <div className="text-slate-400 text-sm">Days Completed</div>
        </div>
      </div>

      {milestoneMessage && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {milestoneMessage}
        </div>
      )}

      {/* Streak calendar */}
      <div className="bg-slate-900/60 rounded-2xl p-6 border border-slate-800/70 shadow-lg shadow-black/20">
        <div className="flex flex-col gap-1 mb-4">
          <h3 className="text-lg font-semibold text-white">Streak Calendar</h3>
          <p className="text-sm text-slate-400">Last 12 weeks of scheduled exercise completion</p>
        </div>
        <div className="grid grid-rows-7 grid-flow-col gap-1">
          {calendarDays.map(({ date, status }) => {
            const label = `${format(date, 'MMM d')} • ${status === 'complete' ? 'Completed' : status === 'missed' ? 'Missed' : status === 'rest' ? 'Rest' : 'Upcoming'}`;
            const colorClass =
              status === 'complete'
                ? 'bg-emerald-500/80'
                : status === 'missed'
                  ? 'bg-rose-500/60'
                  : status === 'rest'
                    ? 'bg-slate-800/70'
                    : 'bg-slate-800/40';
            return (
              <div
                key={date.toISOString()}
                title={label}
                className={`h-3 w-3 rounded-sm border border-slate-700/60 ${colorClass}`}
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-slate-700/60 bg-emerald-500/80" />
            Complete
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-slate-700/60 bg-rose-500/60" />
            Missed
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-slate-700/60 bg-slate-800/70" />
            Rest day
          </span>
        </div>
      </div>

      {/* Today's protocol */}
      <div className="bg-slate-900/60 rounded-2xl p-6 border border-slate-800/70 shadow-lg shadow-black/20">
        <div className="flex flex-col gap-1 mb-4">
          <h3 className="text-lg font-semibold text-white">Today&apos;s Exercises</h3>
          <p className="text-sm text-slate-400">Scheduled for {format(today, 'EEEE, MMM d')}</p>
        </div>
        {scheduledToday.length === 0 ? (
          <div className="rounded-xl border border-slate-800/70 border-dashed p-5 text-sm text-slate-400">
            No exercises scheduled today. Add a custom schedule or switch to daily.
          </div>
        ) : (
          <div className="grid gap-2">
            {scheduledToday.map((todo) => {
              const isCompleteToday = isCompleteForDate(todo, today);
              return (
              <div
                key={`today-${todo.id}`}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-800/70 bg-slate-900/70 p-4 ${
                  isCompleteToday ? 'opacity-70' : ''
                }`}
              >
                <button
                  onClick={() => toggleComplete(todo.id)}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isCompleteToday 
                      ? 'bg-emerald-500 border-emerald-500' 
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  {isCompleteToday && <Check size={14} className="text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium ${isCompleteToday ? 'line-through text-slate-500' : 'text-white'}`}>
                    {todo.title}
                  </div>
                  {todo.description && (
                    <p className="text-sm text-slate-400 truncate">{todo.description}</p>
                  )}
                  <div className="mt-1 text-xs text-slate-500">Schedule: {formatScheduleLabel(todo)}</div>
                </div>
                {todo.completedAt && (
                  <div className="text-xs text-slate-500">Done {format(new Date(todo.completedAt), 'MMM d, h:mm a')}</div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 bg-slate-900/70 p-1 rounded-xl border border-slate-800/70">
          {['all', 'pending', 'completed'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as typeof filter)}
              className={`px-3 py-1.5 rounded-lg capitalize text-sm transition-all ${
                filter === f
                  ? 'bg-teal-500 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        
        <div className="flex gap-1 bg-slate-900/70 p-1 rounded-xl border border-slate-800/70">
          {['all', 'exercise', 'appointment', 'supplement', 'other'].map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c as typeof categoryFilter)}
              className={`px-3 py-1.5 rounded-lg capitalize text-sm transition-all ${
                categoryFilter === c
                  ? 'bg-teal-500 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-slate-900/70 rounded-2xl p-6 border border-slate-800/70 shadow-lg shadow-black/20">
          <h3 className="text-lg font-semibold text-white mb-4">Add New Task</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-300 mb-1">Task Title</label>
              <input
                type="text"
                value={newTodo.title || ''}
                onChange={(e) => setNewTodo(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Schroth breathing exercises"
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            
            <div>
              <label className="block text-sm text-slate-300 mb-1">Category</label>
              <select
                value={newTodo.category}
                onChange={(e) => setNewTodo(prev => ({ ...prev, category: e.target.value as Todo['category'] }))}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="exercise">Exercise</option>
                <option value="appointment">Appointment</option>
                <option value="supplement">Supplement</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-slate-300 mb-1">Schedule</label>
              <select
                value={newTodo.frequency}
                onChange={(e) => setNewTodo(prev => ({ 
                  ...prev, 
                  frequency: e.target.value as Todo['frequency'],
                  scheduleDays: e.target.value === 'mwf' ? [...MWF_DAYS] : prev.scheduleDays ?? [],
                }))}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                {scheduleOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            
            {newTodo.frequency === 'once' && (
              <div>
                <label className="block text-sm text-slate-300 mb-1">Due Date</label>
                <input
                  type="date"
                  value={newTodo.dueDate || ''}
                  onChange={(e) => setNewTodo(prev => ({ ...prev, dueDate: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            )}
          </div>

          {newTodo.frequency === 'custom' && (
            <div className="mb-4">
              <label className="block text-sm text-slate-300 mb-2">Custom Days</label>
              <div className="flex flex-wrap gap-2">
                {DAY_ORDER.map((day) => {
                  const active = newTodo.scheduleDays?.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setNewTodo((prev) => {
                        const nextDays = new Set(prev.scheduleDays ?? []);
                        if (nextDays.has(day)) {
                          nextDays.delete(day);
                        } else {
                          nextDays.add(day);
                        }
                        return { ...prev, scheduleDays: Array.from(nextDays) as DayKey[] };
                      })}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                        active
                          ? 'bg-teal-500 text-white border-teal-500'
                          : 'border-slate-700/70 text-slate-300 hover:border-teal-400'
                      }`}
                    >
                      {DAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm text-slate-300 mb-1">Description (optional)</label>
            <textarea
              value={newTodo.description || ''}
              onChange={(e) => setNewTodo(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Additional details, instructions, etc."
              className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none h-20"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={addTodo}
              className="px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-400 transition-colors"
            >
              Add Task
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-slate-800/70 text-slate-300 rounded-xl hover:bg-slate-700/70 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Todos list */}
      <div className="space-y-2">
        {isLoading ? (
          <LoadingState label="Loading tasks..." />
        ) : filteredTodos.length === 0 ? (
          <div className="bg-slate-900/70 rounded-2xl p-8 border border-slate-800/70 border-dashed text-center">
            <p className="text-slate-300">No tasks yet. Add exercises, appointments, or daily routines to track.</p>
          </div>
        ) : (
          filteredTodos.map((todo) => {
            const config = categoryConfig[todo.category];
            const Icon = config.icon;
            const isComplete = isCompleteForDate(todo, today);
            
            return (
              <div 
                key={todo.id} 
                className={`bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 transition-opacity shadow-lg shadow-black/20 ${
                  isComplete ? 'opacity-60' : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <button
                    onClick={() => toggleComplete(todo.id)}
                    className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isComplete 
                        ? 'bg-emerald-500 border-emerald-500' 
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    {isComplete && <Check size={14} className="text-white" />}
                  </button>
                  
                  <div className={`p-2 rounded-lg ${config.bg}`}>
                    <Icon size={18} className={config.color} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                  <div className={`font-medium ${isComplete ? 'line-through text-slate-500' : 'text-white'}`}>
                    {todo.title}
                  </div>
                    {todo.description && (
                      <p className="text-sm text-slate-400 truncate">{todo.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                      {todo.frequency && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatScheduleLabel(todo)}
                        </span>
                      )}
                      {todo.dueDate && (
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {format(new Date(todo.dueDate), 'MMM d')}
                        </span>
                      )}
                      {todo.completedAt && (
                        <span className="flex items-center gap-1">
                          <Check size={12} />
                          {format(new Date(todo.completedAt), 'MMM d, h:mm a')}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/70 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
