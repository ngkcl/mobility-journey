'use client';

import { useState } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format } from 'date-fns';

interface MetricEntry {
  id: string;
  date: string;
  cobbAngle?: number;
  painLevel?: number;
  shoulderDiff?: number;
  hipDiff?: number;
  flexibility?: number;
  notes?: string;
}

const metricDefinitions = [
  { key: 'cobbAngle', label: 'Cobb Angle', unit: '°', description: 'Spinal curve measurement' },
  { key: 'painLevel', label: 'Pain Level', unit: '/10', description: 'Daily pain rating' },
  { key: 'shoulderDiff', label: 'Shoulder Height Diff', unit: 'cm', description: 'Shoulder level difference' },
  { key: 'hipDiff', label: 'Hip Height Diff', unit: 'cm', description: 'Hip level difference' },
  { key: 'flexibility', label: 'Flexibility Score', unit: '/10', description: 'Overall flexibility assessment' },
];

export default function MetricsTracker() {
  const [entries, setEntries] = useState<MetricEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEntry, setNewEntry] = useState<Partial<MetricEntry>>({
    date: new Date().toISOString().split('T')[0],
  });

  const addEntry = () => {
    if (!newEntry.date) return;
    
    const entry: MetricEntry = {
      id: Date.now().toString(),
      date: newEntry.date,
      cobbAngle: newEntry.cobbAngle,
      painLevel: newEntry.painLevel,
      shoulderDiff: newEntry.shoulderDiff,
      hipDiff: newEntry.hipDiff,
      flexibility: newEntry.flexibility,
      notes: newEntry.notes,
    };
    
    setEntries(prev => [entry, ...prev].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    ));
    setNewEntry({ date: new Date().toISOString().split('T')[0] });
    setShowAddForm(false);
  };

  const deleteEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const getLatestValue = (key: keyof MetricEntry) => {
    const entry = entries.find(e => e[key] !== undefined);
    return entry ? entry[key] : null;
  };

  const getTrend = (key: keyof MetricEntry) => {
    const values = entries
      .filter(e => e[key] !== undefined)
      .slice(0, 5)
      .map(e => e[key] as number);
    
    if (values.length < 2) return 'neutral';
    
    const avg1 = values.slice(0, Math.floor(values.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(values.length / 2);
    const avg2 = values.slice(Math.floor(values.length / 2)).reduce((a, b) => a + b, 0) / (values.length - Math.floor(values.length / 2));
    
    // For pain and angles, lower is better
    if (key === 'painLevel' || key === 'cobbAngle' || key === 'shoulderDiff' || key === 'hipDiff') {
      if (avg1 < avg2 - 0.5) return 'improving';
      if (avg1 > avg2 + 0.5) return 'declining';
    } else {
      // For flexibility, higher is better
      if (avg1 > avg2 + 0.5) return 'improving';
      if (avg1 < avg2 - 0.5) return 'declining';
    }
    return 'neutral';
  };

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'improving') return <TrendingUp className="text-green-500" size={18} />;
    if (trend === 'declining') return <TrendingDown className="text-red-500" size={18} />;
    return <Minus className="text-gray-500" size={18} />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Metrics Tracker</h2>
          <p className="text-gray-400">Monitor your measurements over time</p>
        </div>
        
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus size={18} />
          <span>Add Entry</span>
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {metricDefinitions.map((metric) => {
          const value = getLatestValue(metric.key as keyof MetricEntry);
          const trend = getTrend(metric.key as keyof MetricEntry);
          
          return (
            <div key={metric.key} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">{metric.label}</span>
                <TrendIcon trend={trend} />
              </div>
              <div className="text-2xl font-bold text-white">
                {value !== null ? `${value}${metric.unit}` : '—'}
              </div>
              <p className="text-xs text-gray-500 mt-1">{metric.description}</p>
            </div>
          );
        })}
      </div>

      {/* Add entry form */}
      {showAddForm && (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">Add New Entry</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Date</label>
              <input
                type="date"
                value={newEntry.date}
                onChange={(e) => setNewEntry(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            
            {metricDefinitions.map((metric) => (
              <div key={metric.key}>
                <label className="block text-sm text-gray-400 mb-1">
                  {metric.label} ({metric.unit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="—"
                  value={newEntry[metric.key as keyof MetricEntry] || ''}
                  onChange={(e) => setNewEntry(prev => ({ 
                    ...prev, 
                    [metric.key]: e.target.value ? parseFloat(e.target.value) : undefined 
                  }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            ))}
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Notes</label>
            <textarea
              value={newEntry.notes || ''}
              onChange={(e) => setNewEntry(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any observations, how you feel, etc."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none resize-none h-20"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={addEntry}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save Entry
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Entries list */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">History</h3>
        
        {entries.length === 0 ? (
          <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 border-dashed text-center">
            <p className="text-gray-400">No entries yet. Add your first measurement to start tracking.</p>
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white font-medium">
                  {format(new Date(entry.date), 'MMMM d, yyyy')}
                </span>
                <button
                  onClick={() => deleteEntry(entry.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              
              <div className="flex flex-wrap gap-4 text-sm">
                {metricDefinitions.map((metric) => {
                  const value = entry[metric.key as keyof MetricEntry];
                  if (value === undefined) return null;
                  return (
                    <div key={metric.key}>
                      <span className="text-gray-400">{metric.label}:</span>{' '}
                      <span className="text-white font-medium">{value}{metric.unit}</span>
                    </div>
                  );
                })}
              </div>
              
              {entry.notes && (
                <p className="text-gray-400 text-sm mt-2 italic">&ldquo;{entry.notes}&rdquo;</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
