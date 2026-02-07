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
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">Mobility Journey</h1>
              <p className="text-sm text-gray-400">Posture & Scoliosis Tracking</p>
            </div>
            
            {/* Mobile menu button */}
            <button 
              className="md:hidden p-2 text-gray-400 hover:text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Desktop nav */}
            <nav className="hidden md:flex space-x-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
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
            <nav className="md:hidden mt-4 flex flex-col space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
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
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'photos' && <PhotoTimeline />}
        {activeTab === 'metrics' && <MetricsTracker />}
        {activeTab === 'analysis' && <AnalysisLog />}
        {activeTab === 'todos' && <TodoTracker />}
        {activeTab === 'charts' && <ProgressCharts />}
      </main>
    </div>
  );
}
