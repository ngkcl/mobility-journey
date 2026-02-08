const { contextBridge, ipcRenderer } = require('electron');

// Expose dashboard API to renderer process
contextBridge.exposeInMainWorld('dashboardAPI', {
  // Get all stats from main process
  getStats: async () => {
    try {
      const stats = await ipcRenderer.invoke('dashboard:get-stats');
      return stats;
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        today: { goodPosturePercent: 0, slouchCount: 0, totalSamples: 0 },
        weekly: { scores: [], average: 0, dates: [] },
        currentStreak: 0,
        bestStreak: 0,
        slouchEvents: []
      };
    }
  },

  // Listen for real-time stats updates
  onStatsUpdate: (callback) => {
    ipcRenderer.on('dashboard:stats-update', (event, stats) => {
      callback(stats);
    });
  },

  // Remove stats update listener
  removeStatsUpdateListener: () => {
    ipcRenderer.removeAllListeners('dashboard:stats-update');
  }
});

console.log('Dashboard preload script loaded');
