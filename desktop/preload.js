const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Send posture state changes to main process
  updatePostureState: (state) => {
    ipcRenderer.send('posture-state-changed', state);
  },

  // Request notification
  requestNotification: () => {
    ipcRenderer.send('request-notification');
  },

  // Toggle auto-start
  toggleAutoStart: (enabled) => {
    ipcRenderer.send('toggle-auto-start', enabled);
  },

  // Get auto-start status
  getAutoStartStatus: () => {
    return ipcRenderer.invoke('get-auto-start-status');
  },

  // Settings management
  getSettings: () => {
    return ipcRenderer.invoke('get-settings');
  },

  updateSettings: (settings) => {
    ipcRenderer.send('update-settings', settings);
  },

  // Sound alert
  playSoundAlert: () => {
    ipcRenderer.send('play-sound-alert');
  },

  // Posture updates (for TypeScript interface compatibility)
  sendPostureUpdate: (update) => {
    ipcRenderer.send('posture:update', update);
  },

  sendPostureEvent: (event) => {
    ipcRenderer.send('posture:event', event);
  },

  sendCalibrationComplete: (data) => {
    ipcRenderer.send('calibration:complete', data);
  },

  sendCameraError: (error) => {
    ipcRenderer.send('camera-error', error);
  },

  onCalibrationRequest: (callback) => {
    ipcRenderer.on('start-calibration-request', () => callback());
  },

  onCameraStart: (callback) => {
    ipcRenderer.on('camera:start', () => callback());
  },

  onCameraStop: (callback) => {
    ipcRenderer.on('camera:stop', () => callback());
  },

  // Report generation
  generateDailyReport: (dateKey) => {
    return ipcRenderer.invoke('generate-daily-report', dateKey);
  },

  generateWeeklyReport: () => {
    return ipcRenderer.invoke('generate-weekly-report');
  },

  getAdaptiveThresholds: () => {
    return ipcRenderer.invoke('get-adaptive-thresholds');
  },

  getPostureImprovement: () => {
    return ipcRenderer.invoke('get-posture-improvement');
  },

  // Stats
  getStats: () => {
    return ipcRenderer.invoke('get-stats');
  },

  resetStats: () => {
    return ipcRenderer.invoke('reset-stats');
  },

  // Platform info
  platform: process.platform
});

// Also expose as 'electron' for compatibility with renderer.js
contextBridge.exposeInMainWorld('electron', {
  // Send message to main process
  send: (channel, ...args) => {
    // Whitelist of allowed channels
    const validChannels = [
      'posture-state-changed',
      'request-notification',
      'toggle-auto-start',
      'camera-ready',
      'camera-error',
      'request-stats',
      'request-posture-state',
      'start-calibration',
      'calibration-complete',
      'calibration:complete',
      'toggle-pause',
      'posture:update',
      'posture:event',
      'update-settings',
      'play-sound-alert',
      'break:take',
      'break:skip',
      'break:snooze'
    ];

    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },

  // Receive message from main process
  on: (channel, callback) => {
    // Whitelist of allowed channels
    const validChannels = [
      'posture-update',
      'stats-update',
      'calibration-status',
      'pause-state',
      'break-started',
      'break-skipped',
      'break-snoozed',
      'break-completed',
      'show-break-details'
    ];

    if (validChannels.includes(channel)) {
      // Strip event object before passing to callback
      ipcRenderer.on(channel, (event, ...args) => callback(event, ...args));
    }
  },

  // Invoke with response
  invoke: (channel, ...args) => {
    const validChannels = [
      'get-auto-start-status',
      'get-stats',
      'reset-stats',
      'get-settings',
      'get-break-stats',
      'get-sitting-duration',
      'generate-daily-report',
      'generate-weekly-report',
      'get-adaptive-thresholds',
      'get-posture-improvement'
    ];

    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
  },

  // Listen for stats requests from main
  onShowStats: (callback) => {
    ipcRenderer.on('show-stats-request', () => callback());
  },

  // Break management
  takeBreak: (exercise) => {
    ipcRenderer.send('break:take', exercise);
  },

  skipBreak: () => {
    ipcRenderer.send('break:skip');
  },

  snoozeBreak: () => {
    ipcRenderer.send('break:snooze');
  },

  getBreakStats: () => {
    return ipcRenderer.invoke('get-break-stats');
  },

  getSittingDuration: () => {
    return ipcRenderer.invoke('get-sitting-duration');
  },

  onBreakStarted: (callback) => {
    ipcRenderer.on('break-started', (event, exercise) => callback(exercise));
  },

  onBreakSkipped: (callback) => {
    ipcRenderer.on('break-skipped', () => callback());
  },

  onBreakSnoozed: (callback) => {
    ipcRenderer.on('break-snoozed', () => callback());
  },

  onBreakCompleted: (callback) => {
    ipcRenderer.on('break-completed', () => callback());
  },

  onShowBreakDetails: (callback) => {
    ipcRenderer.on('show-break-details', (event, exercise) => callback(exercise));
  },

  // Report generation
  generateDailyReport: (dateKey) => {
    return ipcRenderer.invoke('generate-daily-report', dateKey);
  },

  generateWeeklyReport: () => {
    return ipcRenderer.invoke('generate-weekly-report');
  },

  getAdaptiveThresholds: () => {
    return ipcRenderer.invoke('get-adaptive-thresholds');
  },

  getPostureImprovement: () => {
    return ipcRenderer.invoke('get-posture-improvement');
  }
});
