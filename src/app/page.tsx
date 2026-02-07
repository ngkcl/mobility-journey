'use client';

import { useState } from 'react';
import { Camera, Video, Activity, FileText, CheckSquare, TrendingUp, Menu, X, BookOpen } from 'lucide-react';
import PhotoTimeline from '@/components/PhotoTimeline';
import VideoGallery from '@/components/VideoGallery';
import MetricsTracker from '@/components/MetricsTracker';
import AnalysisLog from '@/components/AnalysisLog';
import TodoTracker from '@/components/TodoTracker';
import ProgressCharts from '@/components/ProgressCharts';
import ExerciseLibrary from '@/components/ExerciseLibrary';
import { getSupabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ToastProvider';

type Tab = 'photos' | 'videos' | 'metrics' | 'analysis' | 'todos' | 'charts' | 'library';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('photos');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { pushToast } = useToast();

  const tabs = [
    { id: 'photos' as Tab, label: 'Photos', icon: Camera },
    { id: 'videos' as Tab, label: 'Videos', icon: Video },
    { id: 'metrics' as Tab, label: 'Metrics', icon: Activity },
    { id: 'analysis' as Tab, label: 'Analysis', icon: FileText },
    { id: 'todos' as Tab, label: 'Protocol', icon: CheckSquare },
    { id: 'library' as Tab, label: 'Library', icon: BookOpen },
    { id: 'charts' as Tab, label: 'Progress', icon: TrendingUp },
  ];

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);

    const sb = getSupabase();
    const [
      photosResult,
      videosResult,
      metricsResult,
      analysisResult,
      todosResult,
      exercisesResult,
      appointmentsResult,
    ] = await Promise.all([
      sb.from('photos').select('*').order('taken_at', { ascending: false }),
      sb.from('videos').select('*').order('recorded_at', { ascending: false }),
      sb.from('metrics').select('*').order('entry_date', { ascending: false }),
      sb.from('analysis_logs').select('*').order('entry_date', { ascending: false }),
      sb.from('todos').select('*').order('created_at', { ascending: false }),
      sb.from('exercises').select('*').order('created_at', { ascending: false }),
      sb.from('appointments').select('*').order('appointment_date', { ascending: false }),
    ]);

    const errors = [
      photosResult.error,
      videosResult.error,
      metricsResult.error,
      analysisResult.error,
      todosResult.error,
      exercisesResult.error,
      appointmentsResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error('Failed to export data', errors);
      pushToast('Failed to export data. Please try again.', 'error');
      setIsExporting(false);
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      photos: photosResult.data ?? [],
      videos: videosResult.data ?? [],
      metrics: metricsResult.data ?? [],
      analysisLogs: analysisResult.data ?? [],
      todos: todosResult.data ?? [],
      exercises: exercisesResult.data ?? [],
      appointments: appointmentsResult.data ?? [],
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `mobility-journey-export-${dateStamp}.json`;
    link.click();

    URL.revokeObjectURL(url);
    setIsExporting(false);
    pushToast('Export ready! Downloading your data now.', 'success');
  };

  return (
    <div className="relative min-h-screen text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="pointer-events-none absolute inset-0 bg-grid-slate opacity-25" />
      <div className="relative">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800/70 bg-slate-950/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-white">Mobility Journey</h1>
                <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Synced
                </span>
              </div>
              <p className="text-sm text-slate-400">Posture & scoliosis tracking dashboard</p>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-3">
              <nav className="flex items-center gap-2 rounded-full border border-slate-800/60 bg-slate-900/60 p-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all ${
                      activeTab === tab.id
                        ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <tab.icon size={18} />
                    <span>{tab.label}</span>
                  </button>
                ))}
              </nav>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  isExporting
                    ? 'bg-slate-800/70 text-slate-400'
                    : 'bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400'
                }`}
              >
                {isExporting ? 'Exporting...' : 'Export JSON'}
              </button>
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <button
                onClick={handleExport}
                disabled={isExporting}
                className={`rounded-lg border border-slate-800/60 px-3 py-2 text-xs font-medium transition-all ${
                  isExporting
                    ? 'bg-slate-900/70 text-slate-400'
                    : 'bg-emerald-500/90 text-white hover:bg-emerald-400'
                }`}
              >
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
              <button 
                className="rounded-lg border border-slate-800/60 bg-slate-900/70 p-2 text-slate-300 hover:text-white"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle navigation"
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          {mobileMenuOpen && (
            <nav className="md:hidden mt-4 grid gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/70 p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 rounded-xl px-4 py-3 text-left transition-all ${
                    activeTab === tab.id
                      ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <tab.icon size={18} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-fade-up">
          {activeTab === 'photos' && <PhotoTimeline />}
          {activeTab === 'videos' && <VideoGallery />}
          {activeTab === 'metrics' && <MetricsTracker />}
          {activeTab === 'analysis' && <AnalysisLog />}
          {activeTab === 'todos' && <TodoTracker />}
          {activeTab === 'library' && <ExerciseLibrary />}
          {activeTab === 'charts' && <ProgressCharts />}
        </div>
      </main>
      </div>
    </div>
  );
}
