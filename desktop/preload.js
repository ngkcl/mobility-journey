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
      'toggle-pause'
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
      'pause-state'
    ];

    if (validChannels.includes(channel)) {
      // Strip event object before passing to callback
      ipcRenderer.on(channel, (event, ...args) => callback(event, ...args));
    }
  },

  // Invoke with response
  invoke: (channel, ...args) => {
    const validChannels = ['get-auto-start-status'];

    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
  }
});
