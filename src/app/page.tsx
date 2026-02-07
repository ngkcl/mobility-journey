'use client';

import { useState } from 'react';
import { Camera, Activity, FileText, CheckSquare, TrendingUp, Menu, X } from 'lucide-react';
import PhotoTimeline from '@/components/PhotoTimeline';
import MetricsTracker from '@/components/MetricsTracker';
import AnalysisLog from '@/components/AnalysisLog';
import TodoTracker from '@/components/TodoTracker';
import ProgressCharts from '@/components/ProgressCharts';

type Tab = 'photos' | 'metrics' | 'analysis' | 'todos' | 'charts';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('photos');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const tabs = [
    { id: 'photos' as Tab, label: 'Photos', icon: Camera },
    { id: 'metrics' as Tab, label: 'Metrics', icon: Activity },
    { id: 'analysis' as Tab, label: 'Analysis', icon: FileText },
    { id: 'todos' as Tab, label: 'Protocol', icon: CheckSquare },
    { id: 'charts' as Tab, label: 'Progress', icon: TrendingUp },
  ];

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
            
            {/* Mobile menu button */}
            <button 
              className="md:hidden rounded-lg border border-slate-800/60 bg-slate-900/70 p-2 text-slate-300 hover:text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-2 rounded-full border border-slate-800/60 bg-slate-900/60 p-1">
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
          {activeTab === 'metrics' && <MetricsTracker />}
          {activeTab === 'analysis' && <AnalysisLog />}
          {activeTab === 'todos' && <TodoTracker />}
          {activeTab === 'charts' && <ProgressCharts />}
        </div>
      </main>
      </div>
    </div>
  );
}
