const { app, ipcMain, Notification, nativeImage, Menu, globalShortcut, shell, BrowserWindow } = require('electron');
const { menubar } = require('menubar');
const path = require('path');
const fs = require('fs');
const StatsManager = require('./stats-manager');
const BreakManager = require('./break-manager');
const ReportGenerator = require('./report-generator');

// Posture states
const POSTURE_STATES = {
  GOOD: 'good',
  WARNING: 'warning',
  SLOUCHING: 'slouching'
};

// Current posture state
let currentPostureState = POSTURE_STATES.GOOD;
let isPaused = false;

// Notification throttling
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes

// Stats manager
let statsManager = null;

// Break manager
let breakManager = null;
let currentBreakNotification = null;

// Report generator
let reportGenerator = null;

// Dashboard window
let dashboardWindow = null;

// Daily notification timer
let dailyNotificationTimer = null;

// App settings
let appSettings = {
  notificationFrequency: 300000,
  slouchSensitivity: 'medium',
  soundAlerts: false,
  autoStart: false,
  cameraPreview: false,
  breakInterval: 2700000, // 45 minutes default
  breaksEnabled: true
};

// Settings file path
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Load settings from disk
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      appSettings = { ...appSettings, ...JSON.parse(data) };
      console.log('Settings loaded:', appSettings);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Save settings to disk
function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(appSettings, null, 2));
    console.log('Settings saved:', appSettings);
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

// Load the template icon for the menu bar (proper macOS style)
function loadTemplateIcon() {
  // Load the template icon from assets
  // Template images are black on transparent, macOS handles light/dark mode
  const iconPath = path.join(__dirname, 'assets', 'iconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);
  return icon;
}

// Create menubar app
const mb = menubar({
  index: `file://${path.join(__dirname, 'index.html')}`,
  icon: loadTemplateIcon(),
  browserWindow: {
    width: 340,
    height: 520,
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

// Update tray icon with state indicator
function updateTrayIcon(state) {
  if (!mb.tray) return;

  // Use colored PNG icons if available, otherwise template icon stays
  try {
    const iconPath = getTrayIconPath(state);
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      const resizedIcon = icon.resize({ width: 18, height: 18 });
      mb.tray.setImage(resizedIcon);
    }
  } catch (e) {
    // Template icon stays as fallback
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
    body: 'You\'ve been slouching for 15 seconds. Sit up straight!',
    silent: false,
    urgency: 'normal'
  });

  notification.show();
}

// Show daily summary notification
function showDailySummary() {
  if (!statsManager) return;

  const stats = statsManager.getAllStats();
  const todayStats = stats.today;

  const notification = new Notification({
    title: 'Daily Posture Summary',
    body: `Today's Score: ${todayStats.goodPosturePercent}%\nSlouch Count: ${todayStats.slouchCount}\nCurrent Streak: ${stats.currentStreak} days`,
    silent: false
  });

  notification.show();
}

// Show break notification with exercise
function showBreakNotification(exercise) {
  if (currentBreakNotification) {
    currentBreakNotification.close();
  }

  const notification = new Notification({
    title: 'Time for a break!',
    body: `${exercise.name}\n${exercise.description}`,
    silent: false,
    urgency: 'normal',
    actions: [
      { type: 'button', text: 'Take Break (5 min)' },
      { type: 'button', text: 'Skip' },
      { type: 'button', text: 'Snooze 5 min' }
    ]
  });

  notification.on('action', (event, index) => {
    if (index === 0) {
      // Take Break
      handleTakeBreak(exercise);
    } else if (index === 1) {
      // Skip
      handleSkipBreak();
    } else if (index === 2) {
      // Snooze
      handleSnoozeBreak();
    }
  });

  notification.on('click', () => {
    // Default action: show break details
    if (mb.window) {
      mb.window.webContents.send('show-break-details', exercise);
    }
  });

  notification.show();
  currentBreakNotification = notification;
}

// Handle take break action
function handleTakeBreak(exercise) {
  if (!breakManager) return;

  breakManager.startBreak(exercise);

  // Show break timer notification
  const timerNotification = new Notification({
    title: 'Break in Progress',
    body: `${exercise.name} - ${exercise.duration} seconds\n\n${exercise.illustration}`,
    silent: true
  });
  timerNotification.show();

  // Notify renderer
  if (mb.window) {
    mb.window.webContents.send('break-started', exercise);
  }
}

// Handle skip break action
function handleSkipBreak() {
  if (!breakManager) return;

  breakManager.skipBreak();

  // Notify renderer
  if (mb.window) {
    mb.window.webContents.send('break-skipped');
  }
}

// Handle snooze break action
function handleSnoozeBreak() {
  if (!breakManager) return;

  breakManager.snoozeBreak();

  const notification = new Notification({
    title: 'Break Snoozed',
    body: 'Reminder in 5 minutes',
    silent: true
  });
  notification.show();

  // Notify renderer
  if (mb.window) {
    mb.window.webContents.send('break-snoozed');
  }
}

// Create or show dashboard window
function createDashboardWindow() {
  // If window already exists, show it and return
  if (dashboardWindow) {
    if (dashboardWindow.isMinimized()) {
      dashboardWindow.restore();
    }
    dashboardWindow.show();
    dashboardWindow.focus();
    return;
  }

  // Create new dashboard window
  dashboardWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 500,
    backgroundColor: '#0b1020',
    title: 'Posture Analytics Dashboard',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'dashboard', 'dashboard-preload.js')
    },
    show: false, // Don't show until ready
    skipTaskbar: false // Show in dock when open
  });

  // Load dashboard HTML
  dashboardWindow.loadFile(path.join(__dirname, 'dashboard', 'dashboard.html'));

  // Show window when ready
  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow.show();
  });

  // Handle window close - hide instead of destroy
  dashboardWindow.on('close', (event) => {
    event.preventDefault();
    dashboardWindow.hide();
  });

  // Clean up reference when destroyed
  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });

  // Open dev tools in development
  if (process.env.NODE_ENV === 'development') {
    dashboardWindow.webContents.openDevTools({ mode: 'detach' });
  }

  console.log('Dashboard window created');
}

// Schedule daily summary notification at 6 PM
function scheduleDailySummary() {
  // Clear existing timer
  if (dailyNotificationTimer) {
    clearTimeout(dailyNotificationTimer);
  }

  const now = new Date();
  const target = new Date();
  target.setHours(18, 0, 0, 0); // 6 PM

  // If it's already past 6 PM today, schedule for tomorrow
  if (now > target) {
    target.setDate(target.getDate() + 1);
  }

  const msUntilTarget = target.getTime() - now.getTime();

  dailyNotificationTimer = setTimeout(() => {
    showDailySummary();
    // Reschedule for next day
    scheduleDailySummary();
  }, msUntilTarget);

  console.log(`Daily summary scheduled for ${target.toLocaleString()}`);
}

// Setup tray context menu
function setupTrayMenu() {
  if (!mb.tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'View Dashboard',
      accelerator: 'CommandOrControl+Shift+D',
      click: () => {
        createDashboardWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Calibrate',
      click: () => {
        if (mb.window) {
          mb.window.webContents.send('start-calibration-request');
        }
      }
    },
    {
      label: isPaused ? 'Resume' : 'Pause',
      click: () => {
        isPaused = !isPaused;
        if (mb.window) {
          mb.window.webContents.send('toggle-pause-request', isPaused);
        }
        setupTrayMenu(); // Refresh menu to update label
      }
    },
    {
      label: 'Stats',
      click: () => {
        if (mb.window) {
          mb.window.webContents.send('show-stats-request');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Generate Report',
      click: () => {
        if (reportGenerator) {
          const reportPath = reportGenerator.generateDailyReport();
          if (reportPath) {
            const notification = new Notification({
              title: 'Report Generated',
              body: 'Daily posture report has been created',
              silent: true
            });
            notification.on('click', () => {
              shell.openPath(reportPath);
            });
            notification.show();
          }
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  mb.tray.setContextMenu(contextMenu);
}

// App ready
mb.on('ready', () => {
  console.log('Menubar app is ready');
  mb.tray.setToolTip('Posture Monitor');
  // No emoji title — clean template icon only

  // Load settings
  loadSettings();

  // Set auto-start on login from settings
  app.setLoginItemSettings({
    openAtLogin: appSettings.autoStart,
    openAsHidden: true
  });

  // Initialize stats manager
  statsManager = new StatsManager();

  // Initialize report generator
  reportGenerator = new ReportGenerator(statsManager);

  // Schedule daily and weekly reports
  reportGenerator.scheduleDailyReport();
  reportGenerator.scheduleWeeklyReport();

  // Initialize break manager
  breakManager = new BreakManager({
    breakInterval: appSettings.breakInterval,
    enabled: appSettings.breaksEnabled
  });

  // Set up break callbacks
  breakManager.onBreakDue = (exercise) => {
    showBreakNotification(exercise);
  };

  breakManager.onBreakComplete = () => {
    const notification = new Notification({
      title: 'Break Complete!',
      body: 'Great job! Back to work with better posture.',
      silent: true
    });
    notification.show();

    if (mb.window) {
      mb.window.webContents.send('break-completed');
    }
  };

  // Schedule daily summary notification
  scheduleDailySummary();

  // Register global keyboard shortcut: Cmd+Shift+P to recalibrate
  const shortcutRegistered = globalShortcut.register('CommandOrControl+Shift+P', () => {
    console.log('Global shortcut triggered: Recalibration');
    if (mb.window) {
      mb.window.webContents.send('start-calibration-request');
    }
  });

  if (shortcutRegistered) {
    console.log('Global shortcut Cmd+Shift+P registered successfully');
  } else {
    console.error('Failed to register global shortcut');
  }

  // Register global keyboard shortcut: Cmd+Shift+D to open dashboard
  const dashboardShortcutRegistered = globalShortcut.register('CommandOrControl+Shift+D', () => {
    console.log('Global shortcut triggered: Dashboard');
    createDashboardWindow();
  });

  if (dashboardShortcutRegistered) {
    console.log('Global shortcut Cmd+Shift+D registered successfully');
  } else {
    console.error('Failed to register dashboard shortcut');
  }

  // Create context menu for tray icon
  setupTrayMenu();
});

// IPC handlers
ipcMain.on('posture-state-changed', (event, state) => {
  console.log('Posture state changed:', state);
  currentPostureState = state;
  updateTrayIcon(state);

  // Record posture state
  if (statsManager) {
    statsManager.recordPostureState(state);
  }

  // Track sitting time for break manager
  if (breakManager && state !== 'uncalibrated') {
    breakManager.onUserSitting();
  }

  // Show notification if slouching
  if (state === POSTURE_STATES.SLOUCHING) {
    showSlouchNotification();

    // Record slouch event
    if (statsManager) {
      statsManager.recordSlouchEvent({
        severity: 'slouching',
        state: state
      });
    }
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
ipcMain.handle('get-stats', async () => {
  if (!statsManager) {
    return {
      today: { goodPosturePercent: 0, slouchCount: 0, totalSamples: 0 },
      weekly: { scores: [], average: 0, dates: [] },
      currentStreak: 0,
      bestStreak: 0
    };
  }
  return statsManager.getAllStats();
});

// Reset stats handler
ipcMain.handle('reset-stats', async () => {
  if (statsManager) {
    statsManager.resetStats();
    return { success: true };
  }
  return { success: false };
});

// Posture state request handler
ipcMain.on('request-posture-state', (event) => {
  event.sender.send('posture-update', {
    state: 'UNCALIBRATED',
    score: null
  });
});

// Calibration complete handler
ipcMain.on('calibration:complete', (event, calibrationData) => {
  console.log('Calibration complete:', calibrationData);

  // Save calibration to history
  if (statsManager && calibrationData) {
    statsManager.recordCalibration(calibrationData);
  }
});

// Posture update handler (for stats tracking)
ipcMain.on('posture:update', (event, update) => {
  if (!statsManager || !update) return;

  // Record posture state with metrics
  statsManager.recordPostureState(update.state, update.metrics);
});

// Posture event handler (for slouch tracking)
ipcMain.on('posture:event', (event, postureEvent) => {
  if (!statsManager || !postureEvent) return;

  // Record slouch event
  if (postureEvent.severity === 'slouching') {
    statsManager.recordSlouchEvent(postureEvent);
  }
});

// Pause toggle handler
ipcMain.on('toggle-pause', (event, isPaused) => {
  console.log('Monitoring paused:', isPaused);
  // Echo back to renderer
  event.sender.send('pause-state', isPaused);
});

// Settings handlers
ipcMain.handle('get-settings', async () => {
  return appSettings;
});

ipcMain.on('update-settings', (event, settings) => {
  console.log('Updating settings:', settings);
  appSettings = { ...appSettings, ...settings };

  // Update auto-start if changed
  if (settings.autoStart !== undefined) {
    app.setLoginItemSettings({
      openAtLogin: settings.autoStart,
      openAsHidden: true
    });
  }

  // Update notification cooldown if frequency changed
  if (settings.notificationFrequency !== undefined) {
    // This would be applied on next notification check
    console.log('Notification frequency updated to:', settings.notificationFrequency);
  }

  // Update break manager settings if changed
  if (breakManager && (settings.breakInterval !== undefined || settings.breaksEnabled !== undefined)) {
    breakManager.updateSettings({
      breakInterval: settings.breakInterval,
      enabled: settings.breaksEnabled
    });
  }

  saveSettings();
});

// Sound alert handler
ipcMain.on('play-sound-alert', () => {
  if (appSettings.soundAlerts) {
    shell.beep();
  }
});

// Break action handlers
ipcMain.on('break:take', (event, exercise) => {
  handleTakeBreak(exercise);
});

ipcMain.on('break:skip', () => {
  handleSkipBreak();
});

ipcMain.on('break:snooze', () => {
  handleSnoozeBreak();
});

ipcMain.handle('get-break-stats', async () => {
  if (!breakManager) {
    return {
      totalBreaksDue: 0,
      breaksTaken: 0,
      breaksSkipped: 0,
      breaksSnoozed: 0,
      complianceRate: 0,
      recentBreaks: []
    };
  }
  return breakManager.getBreakStats();
});

ipcMain.handle('get-sitting-duration', async () => {
  if (!breakManager) return 0;
  return breakManager.getSittingDuration();
});

// Report generation handlers
ipcMain.handle('generate-daily-report', async (event, dateKey) => {
  if (!reportGenerator) return { success: false, error: 'Report generator not initialized' };

  try {
    const reportPath = reportGenerator.generateDailyReport(dateKey);
    if (reportPath) {
      return { success: true, path: reportPath };
    }
    return { success: false, error: 'No data available for report' };
  } catch (error) {
    console.error('Error generating daily report:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-weekly-report', async () => {
  if (!reportGenerator) return { success: false, error: 'Report generator not initialized' };

  try {
    const reportPath = reportGenerator.generateWeeklyReport();
    if (reportPath) {
      return { success: true, path: reportPath };
    }
    return { success: false, error: 'No data available for report' };
  } catch (error) {
    console.error('Error generating weekly report:', error);
    return { success: false, error: error.message };
  }
});

// Get adaptive thresholds
ipcMain.handle('get-adaptive-thresholds', async () => {
  if (!statsManager) return null;
  return statsManager.getAdaptiveThresholds();
});

// Get posture improvement stats
ipcMain.handle('get-posture-improvement', async () => {
  if (!statsManager) return null;
  return statsManager.getPostureImprovement();
});

// Dashboard IPC handlers
ipcMain.handle('dashboard:get-stats', async () => {
  if (!statsManager) {
    return {
      today: { goodPosturePercent: 0, slouchCount: 0, totalSamples: 0 },
      weekly: { scores: [], average: 0, dates: [] },
      currentStreak: 0,
      bestStreak: 0,
      slouchEvents: []
    };
  }

  const stats = statsManager.getAllStats();

  // Add slouch events to the stats
  const slouchEvents = statsManager.stats.slouchEvents || [];

  return {
    ...stats,
    slouchEvents: slouchEvents
  };
});

// Send stats updates to dashboard when it's open
function sendDashboardUpdate() {
  if (dashboardWindow && !dashboardWindow.isDestroyed() && dashboardWindow.isVisible()) {
    const stats = statsManager ? statsManager.getAllStats() : null;
    if (stats) {
      const slouchEvents = statsManager.stats.slouchEvents || [];
      dashboardWindow.webContents.send('dashboard:stats-update', {
        ...stats,
        slouchEvents: slouchEvents
      });
    }
  }
}

// Update dashboard in real-time when posture events occur
const originalPostureHandler = ipcMain.listeners('posture-state-changed')[0];
if (originalPostureHandler) {
  ipcMain.removeListener('posture-state-changed', originalPostureHandler);
  ipcMain.on('posture-state-changed', (event, state) => {
    // Call original handler
    originalPostureHandler(event, state);
    // Update dashboard
    sendDashboardUpdate();
  });
}

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

// Cleanup global shortcuts when app is quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll();

  // Generate daily report on quit if there's data
  if (reportGenerator && statsManager) {
    const todayStats = statsManager.getDetailedDailyStats();
    if (todayStats && todayStats.totalSamples > 0) {
      try {
        reportGenerator.generateDailyReport();
        console.log('End-of-day report generated on app quit');
      } catch (error) {
        console.error('Failed to generate report on quit:', error);
      }
    }
  }
});
