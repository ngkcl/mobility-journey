'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Bot, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabaseClient';
import LoadingState from '@/components/LoadingState';
import { useToast } from '@/components/ToastProvider';

interface AnalysisEntry {
  id: string;
  date: string;
  type: 'ai' | 'personal' | 'specialist';
  title: string;
  content: string;
  tags?: string[];
}

export default function AnalysisLog() {
  const [entries, setEntries] = useState<AnalysisEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'ai' | 'personal' | 'specialist'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const { pushToast } = useToast();
  const [newEntry, setNewEntry] = useState<Partial<AnalysisEntry>>({
    date: new Date().toISOString().split('T')[0],
    type: 'personal',
  });

  useEffect(() => {
    let isMounted = true;

    const loadEntries = async () => {
      const { data, error } = await supabase
        .from('analysis_logs')
        .select('id, entry_date, category, title, content')
        .order('entry_date', { ascending: false });

      if (error) {
        console.error('Failed to load analysis logs', error);
        if (isMounted) {
          setIsLoading(false);
          pushToast('Failed to load analysis entries. Please try again.', 'error');
        }
        return;
      }

      const normalized = (data ?? []).map((row) => ({
        id: row.id,
        date: row.entry_date,
        type: row.category as AnalysisEntry['type'],
        title: row.title ?? '',
        content: row.content,
      }));

      if (isMounted) {
        setEntries(normalized);
        setIsLoading(false);
      }
    };

    loadEntries();

    return () => {
      isMounted = false;
    };
  }, [pushToast]);

  const addEntry = async () => {
    if (!newEntry.date || !newEntry.title || !newEntry.content) return;

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
      console.error('Failed to save analysis entry', error);
      pushToast('Failed to save analysis entry. Please try again.', 'error');
      return;
    }

    const entry: AnalysisEntry = {
      id: data.id,
      date: data.entry_date,
      type: data.category as AnalysisEntry['type'],
      title: data.title ?? '',
      content: data.content,
      tags: newEntry.tags,
    };

    setEntries(prev => [entry, ...prev].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    ));
    setNewEntry({ 
      date: new Date().toISOString().split('T')[0],
      type: 'personal',
    });
    setShowAddForm(false);
  };

  const deleteEntry = async (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    const { error } = await supabase.from('analysis_logs').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete analysis entry', error);
      pushToast('Failed to delete analysis entry. Please refresh.', 'error');
    }
  };

  const filteredEntries = filter === 'all' 
    ? entries 
    : entries.filter(e => e.type === filter);

  const typeColors = {
    ai: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    personal: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    specialist: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  };

  const typeIcons = {
    ai: Bot,
    personal: User,
    specialist: User,
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Analysis Log</h2>
          <p className="text-slate-400">AI insights, personal notes, and specialist feedback</p>
        </div>
        
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-400 transition-colors flex items-center gap-2 shadow-lg shadow-teal-500/20"
        >
          <Plus size={18} />
          <span>Add Entry</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', 'ai', 'personal', 'specialist'].map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type as typeof filter)}
            className={`px-4 py-2 rounded-full capitalize whitespace-nowrap transition-all ${
              filter === type
                ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20'
                : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800/70'
            }`}
          >
            {type === 'ai' ? 'AI Analysis' : type}
          </button>
        ))}
      </div>

      {/* Add entry form */}
      {showAddForm && (
        <div className="bg-slate-900/70 rounded-2xl p-6 border border-slate-800/70 shadow-lg shadow-black/20">
          <h3 className="text-lg font-semibold text-white mb-4">Add Analysis Entry</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Date</label>
              <input
                type="date"
                value={newEntry.date}
                onChange={(e) => setNewEntry(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            
            <div>
              <label className="block text-sm text-slate-300 mb-1">Type</label>
              <select
                value={newEntry.type}
                onChange={(e) => setNewEntry(prev => ({ ...prev, type: e.target.value as AnalysisEntry['type'] }))}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="personal">Personal Note</option>
                <option value="ai">AI Analysis</option>
                <option value="specialist">Specialist Feedback</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-slate-300 mb-1">Title</label>
            <input
              type="text"
              value={newEntry.title || ''}
              onChange={(e) => setNewEntry(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Weekly Progress Review"
              className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm text-slate-300 mb-1">Content</label>
            <textarea
              value={newEntry.content || ''}
              onChange={(e) => setNewEntry(prev => ({ ...prev, content: e.target.value }))}
              placeholder="Your analysis, observations, or notes..."
              className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none h-40"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={addEntry}
              className="px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-400 transition-colors"
            >
              Save Entry
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
      <div className="space-y-4">
        {isLoading ? (
          <LoadingState label="Loading analysis log..." />
        ) : filteredEntries.length === 0 ? (
          <div className="bg-slate-900/70 rounded-2xl p-8 border border-slate-800/70 border-dashed text-center">
            <p className="text-slate-300">No entries yet. Add your first analysis to start documenting your journey.</p>
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const Icon = typeIcons[entry.type];
            return (
              <div key={entry.id} className="bg-slate-900/70 rounded-2xl p-6 border border-slate-800/70 shadow-lg shadow-black/20">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${typeColors[entry.type]}`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4 className="text-white font-semibold">{entry.title}</h4>
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Calendar size={14} />
                        {format(new Date(entry.date), 'MMMM d, yyyy')}
                        <span className={`px-2 py-0.5 rounded text-xs capitalize ${typeColors[entry.type]}`}>
                          {entry.type === 'ai' ? 'AI Analysis' : entry.type}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/70 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div className="prose prose-invert max-w-none">
                  <p className="text-slate-200 whitespace-pre-wrap">{entry.content}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
