'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Check, Circle, Clock, Calendar, Dumbbell, Stethoscope, Pill } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabaseClient';
import LoadingState from '@/components/LoadingState';
import { useToast } from '@/components/ToastProvider';

interface Todo {
  id: string;
  title: string;
  description?: string;
  category: 'exercise' | 'appointment' | 'supplement' | 'other';
  frequency?: 'daily' | 'weekly' | 'once';
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
    completed: false,
  });

  useEffect(() => {
    let isMounted = true;

    const loadTodos = async () => {
      const { data, error } = await supabase
        .from('todos')
        .select('id, title, details, completed, completed_at, due_date, category, frequency')
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
        frequency: (row.frequency ?? undefined) as Todo['frequency'] | undefined,
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

    const { data, error } = await supabase
      .from('todos')
      .insert({
        title: newTodo.title,
        details: newTodo.description ?? null,
        category: newTodo.category ?? 'other',
        frequency: newTodo.frequency ?? null,
        due_date: newTodo.dueDate ?? null,
        completed: false,
      })
      .select('id, title, details, completed, completed_at, due_date, category, frequency')
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
      dueDate: data.due_date ?? undefined,
      completed: data.completed ?? false,
      completedAt: data.completed_at ?? undefined,
    };

    setTodos(prev => [todo, ...prev]);
    setNewTodo({ 
      category: 'exercise',
      frequency: 'daily',
      completed: false,
    });
    setShowAddForm(false);
  };

  const toggleComplete = async (id: string) => {
    const target = todos.find(todo => todo.id === id);
    if (!target) return;

    const isCompleting = !target.completed;
    const completedAt = isCompleting ? new Date().toISOString() : undefined;

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
    setTodos(prev => prev.filter(t => t.id !== id));
    const { error } = await supabase.from('todos').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete todo', error);
      pushToast('Failed to delete task. Please refresh.', 'error');
    }
  };

  const filteredTodos = todos.filter(todo => {
    if (filter === 'pending' && todo.completed) return false;
    if (filter === 'completed' && !todo.completed) return false;
    if (categoryFilter !== 'all' && todo.category !== categoryFilter) return false;
    return true;
  });

  const pendingCount = todos.filter(t => !t.completed).length;
  const completedToday = todos.filter(t => 
    t.completed && 
    t.completedAt && 
    format(new Date(t.completedAt), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
  ).length;

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-white">{todos.length}</div>
          <div className="text-slate-400 text-sm">Total Tasks</div>
        </div>
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-amber-300">{pendingCount}</div>
          <div className="text-slate-400 text-sm">Pending</div>
        </div>
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-emerald-300">{completedToday}</div>
          <div className="text-slate-400 text-sm">Completed Today</div>
        </div>
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-sky-300">
            {todos.length > 0 ? Math.round((todos.filter(t => t.completed).length / todos.length) * 100) : 0}%
          </div>
          <div className="text-slate-400 text-sm">Completion Rate</div>
        </div>
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
              <label className="block text-sm text-slate-300 mb-1">Frequency</label>
              <select
                value={newTodo.frequency}
                onChange={(e) => setNewTodo(prev => ({ ...prev, frequency: e.target.value as Todo['frequency'] }))}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="once">One-time</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-slate-300 mb-1">Due Date (optional)</label>
              <input
                type="date"
                value={newTodo.dueDate || ''}
                onChange={(e) => setNewTodo(prev => ({ ...prev, dueDate: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

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
            
            return (
              <div 
                key={todo.id} 
                className={`bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 transition-opacity shadow-lg shadow-black/20 ${
                  todo.completed ? 'opacity-60' : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <button
                    onClick={() => toggleComplete(todo.id)}
                    className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      todo.completed 
                        ? 'bg-emerald-500 border-emerald-500' 
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    {todo.completed && <Check size={14} className="text-white" />}
                  </button>
                  
                  <div className={`p-2 rounded-lg ${config.bg}`}>
                    <Icon size={18} className={config.color} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium ${todo.completed ? 'line-through text-slate-500' : 'text-white'}`}>
                      {todo.title}
                    </div>
                    {todo.description && (
                      <p className="text-sm text-slate-400 truncate">{todo.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                      {todo.frequency && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {todo.frequency}
                        </span>
                      )}
                      {todo.dueDate && (
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {format(new Date(todo.dueDate), 'MMM d')}
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
