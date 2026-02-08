const { app, ipcMain, Notification, nativeImage } = require('electron');
const { menubar } = require('menubar');
const path = require('path');

// Posture states
const POSTURE_STATES = {
  GOOD: 'good',
  WARNING: 'warning',
  SLOUCHING: 'slouching'
};

// Current posture state
let currentPostureState = POSTURE_STATES.GOOD;

// Notification throttling
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes

// Create a fallback icon if image files don't exist
function getIcon(state) {
  const iconPath = getTrayIconPath(state);
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('empty');
    return icon.resize({ width: 22, height: 22 });
  } catch (e) {
    // Fallback: create a colored circle programmatically
    const colors = {
      [POSTURE_STATES.GOOD]: '#14b8a6',
      [POSTURE_STATES.WARNING]: '#eab308',
      [POSTURE_STATES.SLOUCHING]: '#ef4444'
    };
    return null; // Will use title fallback
  }
}

// Create menubar app
const mb = menubar({
  index: `file://${path.join(__dirname, 'index.html')}`,
  icon: getTrayIconPath(POSTURE_STATES.GOOD),
  browserWindow: {
    width: 320,
    height: 400,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    transparent: true,
    frame: false,
    resizable: false,
    movable: false
  },
  preloadWindow: true,
  showDockIcon: false
});

// Get tray icon path based on posture state
function getTrayIconPath(state) {
  const iconMap = {
    [POSTURE_STATES.GOOD]: 'icon-green.png',
    [POSTURE_STATES.WARNING]: 'icon-yellow.png',
    [POSTURE_STATES.SLOUCHING]: 'icon-red.png'
  };

  return path.join(__dirname, 'assets', iconMap[state]);
}

// Update tray icon
function updateTrayIcon(state) {
  if (!mb.tray) return;

  // Update emoji title (always visible)
  const emojiMap = {
    [POSTURE_STATES.GOOD]: '🟢',
    [POSTURE_STATES.WARNING]: '🟡',
    [POSTURE_STATES.SLOUCHING]: '🔴'
  };
  mb.tray.setTitle(emojiMap[state] || '🟢');

  // Also try to update the icon image
  try {
    const iconPath = getTrayIconPath(state);
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      const resizedIcon = icon.resize({ width: 22, height: 22 });
      mb.tray.setImage(resizedIcon);
    }
  } catch (e) {
    // Emoji title is the fallback
  }
}

// Show notification
function showSlouchNotification() {
  const now = Date.now();

  // Throttle notifications
  if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) {
    return;
  }

  lastNotificationTime = now;

  const notification = new Notification({
    title: 'Posture Alert',
    body: 'You\'ve been slouching for 30 seconds. Sit up straight!',
    silent: false,
    urgency: 'normal'
  });

  notification.show();
}

// App ready
mb.on('ready', () => {
  console.log('Menubar app is ready');
  mb.tray.setToolTip('Posture Monitor');
  mb.tray.setTitle('🟢');  // Shows text next to icon in menu bar

  // Set auto-start on login
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true
  });
});

// IPC handlers
ipcMain.on('posture-state-changed', (event, state) => {
  console.log('Posture state changed:', state);
  currentPostureState = state;
  updateTrayIcon(state);

  // Show notification if slouching
  if (state === POSTURE_STATES.SLOUCHING) {
    showSlouchNotification();
  }
});

ipcMain.on('request-notification', (event) => {
  showSlouchNotification();
});

ipcMain.on('toggle-auto-start', (event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true
  });
});

ipcMain.handle('get-auto-start-status', () => {
  return app.getLoginItemSettings().openAtLogin;
});

// Camera ready handler
ipcMain.on('camera-ready', (event, data) => {
  console.log('Camera ready:', data);
});

// Camera error handler
ipcMain.on('camera-error', (event, error) => {
  console.error('Camera error:', error);
});

// Stats request handler
ipcMain.on('request-stats', (event) => {
  // These will be implemented by the stats/vision detection modules
  // For now, send placeholder data
  event.sender.send('stats-update', {
    goodPosturePercent: 0,
    slouchCount: 0,
    currentStreak: 0
  });
});

// Posture state request handler
ipcMain.on('request-posture-state', (event) => {
  event.sender.send('posture-update', {
    state: 'UNCALIBRATED',
    score: null
  });
});

// Calibration start handler
ipcMain.on('start-calibration', (event) => {
  console.log('Calibration started');
  // This will be implemented by the vision detection module
  // For now, send success response after delay
  setTimeout(() => {
    event.sender.send('calibration-status', {
      success: true,
      message: 'Calibration complete'
    });
  }, 3000);
});

// Pause toggle handler
ipcMain.on('toggle-pause', (event, isPaused) => {
  console.log('Monitoring paused:', isPaused);
  // Echo back to renderer
  event.sender.send('pause-state', isPaused);
});

// Handle app quit
mb.on('after-create-window', () => {
  if (process.env.NODE_ENV === 'development') {
    mb.window.webContents.openDevTools({ mode: 'detach' });
  }
});

// Prevent app from quitting when all windows are closed (menu bar app behavior)
app.on('window-all-closed', (e) => {
  e.preventDefault();
});
