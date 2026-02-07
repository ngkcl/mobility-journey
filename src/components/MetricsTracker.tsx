'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, Minus, Flame, Dumbbell, Activity, Brain, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { getSupabase } from '@/lib/supabaseClient';
import LoadingState from '@/components/LoadingState';
import { useToast } from '@/components/ToastProvider';

interface MetricEntry {
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
}

const quickMetrics = [
  { key: 'painLevel', label: 'Pain', unit: '/10', icon: Activity, color: 'rose', lowerBetter: true },
  { key: 'postureScore', label: 'Posture', unit: '/10', icon: Brain, color: 'teal', lowerBetter: false },
  { key: 'symmetryScore', label: 'Symmetry', unit: '/10', icon: Zap, color: 'violet', lowerBetter: false },
  { key: 'energyLevel', label: 'Energy', unit: '/10', icon: Flame, color: 'amber', lowerBetter: false },
];

export default function MetricsTracker() {
  const [entries, setEntries] = useState<MetricEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { pushToast } = useToast();
  const [newEntry, setNewEntry] = useState<Partial<MetricEntry>>({
    date: new Date().toISOString().split('T')[0],
    exerciseDone: false,
  });

  useEffect(() => {
    let isMounted = true;

    const loadEntries = async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('metrics')
        .select('*')
        .order('entry_date', { ascending: false });

      if (error) {
        console.error('Failed to load metrics', error);
        if (isMounted) {
          setIsLoading(false);
          pushToast('Failed to load metrics. Please try again.', 'error');
        }
        return;
      }

      const normalized = (data ?? []).map((row) => ({
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

      if (isMounted) {
        setEntries(normalized);
        setIsLoading(false);
      }
    };

    loadEntries();
    return () => { isMounted = false; };
  }, [pushToast]);

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
      console.error('Failed to save metric entry', error);
      pushToast('Failed to save entry. Please try again.', 'error');
      return;
    }

    const entry: MetricEntry = {
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

    setEntries(prev => [entry, ...prev].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    ));
    setNewEntry({ date: new Date().toISOString().split('T')[0], exerciseDone: false });
    setShowAddForm(false);
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    const supabase = getSupabase();
    const prev = entries;
    setEntries(p => p.filter(e => e.id !== id));
    const { error } = await supabase.from('metrics').delete().eq('id', id);
    if (error) {
      setEntries(prev);
      pushToast('Failed to delete. Restored.', 'error');
    }
  };

  const getLatestValue = (key: string) => {
    const entry = entries.find(e => e[key as keyof MetricEntry] !== undefined);
    return entry ? entry[key as keyof MetricEntry] : null;
  };

  const getTrend = (key: string, lowerBetter: boolean) => {
    const values = entries
      .filter(e => e[key as keyof MetricEntry] !== undefined)
      .slice(0, 5)
      .map(e => e[key as keyof MetricEntry] as number);

    if (values.length < 2) return 'neutral';

    const half = Math.floor(values.length / 2);
    const avg1 = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const avg2 = values.slice(half).reduce((a, b) => a + b, 0) / (values.length - half);

    if (lowerBetter) {
      if (avg1 < avg2 - 0.5) return 'improving';
      if (avg1 > avg2 + 0.5) return 'declining';
    } else {
      if (avg1 > avg2 + 0.5) return 'improving';
      if (avg1 < avg2 - 0.5) return 'declining';
    }
    return 'neutral';
  };

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'improving') return <TrendingUp className="text-green-500" size={18} />;
    if (trend === 'declining') return <TrendingDown className="text-red-500" size={18} />;
    return <Minus className="text-slate-500" size={18} />;
  };

  // Exercise streak
  const streak = entries.filter(e => e.exerciseDone).length;
  const totalMinutes = entries.reduce((sum, e) => sum + (e.exerciseMinutes ?? 0), 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Daily Check-in</h2>
          <p className="text-slate-400">Track how you feel, what you did, and your progress</p>
        </div>

        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-400 transition-colors flex items-center gap-2 shadow-lg shadow-teal-500/20"
        >
          <Plus size={18} />
          <span>Daily Check-in</span>
        </button>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickMetrics.map((metric) => {
          const value = getLatestValue(metric.key);
          const trend = getTrend(metric.key, metric.lowerBetter);
          const Icon = metric.icon;

          return (
            <div key={metric.key} className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon size={16} className={`text-${metric.color}-400`} />
                  <span className="text-slate-300 text-sm">{metric.label}</span>
                </div>
                <TrendIcon trend={trend} />
              </div>
              <div className="text-3xl font-bold text-white">
                {value !== null ? `${value}` : '—'}
                <span className="text-lg text-slate-500">{metric.unit}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Exercise streak */}
      <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
        <div className="flex items-center gap-3">
          <Dumbbell size={20} className="text-teal-400" />
          <div>
            <span className="text-white font-semibold">{streak} sessions</span>
            <span className="text-slate-400 text-sm ml-2">• {totalMinutes} minutes total</span>
          </div>
        </div>
      </div>

      {/* Add entry form */}
      {showAddForm && (
        <div className="bg-slate-900/70 rounded-2xl p-6 border border-slate-800/70 shadow-lg shadow-black/20">
          <h3 className="text-lg font-semibold text-white mb-4">Daily Check-in</h3>

          {/* Date */}
          <div className="mb-4">
            <label className="block text-sm text-slate-300 mb-1">Date</label>
            <input
              type="date"
              value={newEntry.date}
              onChange={(e) => setNewEntry(prev => ({ ...prev, date: e.target.value }))}
              className="w-full max-w-xs px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Quick scores row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {quickMetrics.map((metric) => (
              <div key={metric.key}>
                <label className="block text-sm text-slate-300 mb-1">{metric.label} (1-10)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  placeholder="—"
                  value={newEntry[metric.key as keyof MetricEntry] as number || ''}
                  onChange={(e) => setNewEntry(prev => ({
                    ...prev,
                    [metric.key]: e.target.value ? parseInt(e.target.value) : undefined,
                  }))}
                  className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            ))}
          </div>

          {/* Exercise section */}
          <div className="mb-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="flex items-center gap-3 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newEntry.exerciseDone || false}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, exerciseDone: e.target.checked }))}
                  className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-500/20"
                />
                <span className="text-white font-medium">Did exercises today</span>
              </label>
            </div>

            {newEntry.exerciseDone && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    placeholder="30"
                    value={newEntry.exerciseMinutes || ''}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, exerciseMinutes: e.target.value ? parseInt(e.target.value) : undefined }))}
                    className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Which exercises</label>
                  <input
                    type="text"
                    placeholder="Planks, bird dogs, cat-cow..."
                    value={newEntry.exerciseNames || ''}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, exerciseNames: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ROM & Rib Hump */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Forward Bend ROM (°)</label>
              <input
                type="number"
                placeholder="—"
                value={newEntry.romForwardBend || ''}
                onChange={(e) => setNewEntry(prev => ({ ...prev, romForwardBend: e.target.value ? parseInt(e.target.value) : undefined }))}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Lateral Flexion ROM (°)</label>
              <input
                type="number"
                placeholder="—"
                value={newEntry.romLateral || ''}
                onChange={(e) => setNewEntry(prev => ({ ...prev, romLateral: e.target.value ? parseInt(e.target.value) : undefined }))}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Rib Hump</label>
              <select
                value={newEntry.ribHump || ''}
                onChange={(e) => setNewEntry(prev => ({ ...prev, ribHump: e.target.value || undefined }))}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="">Select...</option>
                <option value="none">None</option>
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            </div>
          </div>

          {/* Functional milestone */}
          <div className="mb-4">
            <label className="block text-sm text-slate-300 mb-1">Functional Milestone 🎯</label>
            <input
              type="text"
              placeholder="e.g. Held plank for 60s, sat at desk 2hr pain-free..."
              value={newEntry.functionalMilestone || ''}
              onChange={(e) => setNewEntry(prev => ({ ...prev, functionalMilestone: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Notes */}
          <div className="mb-4">
            <label className="block text-sm text-slate-300 mb-1">Notes</label>
            <textarea
              value={newEntry.notes || ''}
              onChange={(e) => setNewEntry(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="How you feel, anything unusual..."
              className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none h-20"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={addEntry}
              className="px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-400 transition-colors"
            >
              Save Check-in
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

      {/* Entries list */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">History</h3>

        {isLoading ? (
          <LoadingState label="Loading check-ins..." />
        ) : entries.length === 0 ? (
          <div className="bg-slate-900/70 rounded-2xl p-8 border border-slate-800/70 border-dashed text-center">
            <p className="text-slate-300">No check-ins yet. Start your first daily check-in!</p>
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-white font-medium">
                    {format(new Date(entry.date), 'MMMM d, yyyy')}
                  </span>
                  {entry.exerciseDone && (
                    <span className="px-2 py-0.5 bg-teal-500/20 text-teal-400 text-xs rounded-full flex items-center gap-1">
                      <Dumbbell size={12} /> {entry.exerciseMinutes ? `${entry.exerciseMinutes}min` : '✓'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => deleteEntry(entry.id)}
                  className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/70 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                {entry.painLevel !== undefined && (
                  <div><span className="text-slate-400">Pain:</span> <span className="text-white font-medium">{entry.painLevel}/10</span></div>
                )}
                {entry.postureScore !== undefined && (
                  <div><span className="text-slate-400">Posture:</span> <span className="text-white font-medium">{entry.postureScore}/10</span></div>
                )}
                {entry.symmetryScore !== undefined && (
                  <div><span className="text-slate-400">Symmetry:</span> <span className="text-white font-medium">{entry.symmetryScore}/10</span></div>
                )}
                {entry.energyLevel !== undefined && (
                  <div><span className="text-slate-400">Energy:</span> <span className="text-white font-medium">{entry.energyLevel}/10</span></div>
                )}
                {entry.ribHump && (
                  <div><span className="text-slate-400">Rib hump:</span> <span className="text-white font-medium">{entry.ribHump}</span></div>
                )}
              </div>

              {entry.exerciseNames && (
                <p className="text-slate-400 text-sm mt-2">🏋️ {entry.exerciseNames}</p>
              )}
              {entry.functionalMilestone && (
                <p className="text-teal-400 text-sm mt-1">🎯 {entry.functionalMilestone}</p>
              )}
              {entry.notes && (
                <p className="text-slate-400 text-sm mt-2 italic">&ldquo;{entry.notes}&rdquo;</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
