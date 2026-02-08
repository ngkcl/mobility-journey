import { PostureMonitor } from './lib/posture-monitor';
import type { PostureUpdate, CalibrationData } from '../shared/ipc-types';
import { IPC_CHANNELS } from '../shared/ipc-types';

declare global {
  interface Window {
    electronAPI: {
      sendPostureUpdate: (update: PostureUpdate) => void;
      sendPostureEvent: (event: PostureUpdate['event']) => void;
      sendCalibrationComplete: (data: CalibrationData) => void;
      sendCameraError: (error: string) => void;
      onCalibrationRequest: (callback: () => void) => void;
      onCameraStart: (callback: () => void) => void;
      onCameraStop: (callback: () => void) => void;
      updateSettings: (settings: AppSettings) => void;
      getSettings: () => Promise<AppSettings>;
      playSoundAlert: () => void;
    };
  }
}

interface AppSettings {
  notificationFrequency: number;
  slouchSensitivity: 'low' | 'medium' | 'high';
  soundAlerts: boolean;
  autoStart: boolean;
  cameraPreview: boolean;
  breakInterval: number;
  breaksEnabled: boolean;
}

interface StatsData {
  today: {
    goodPosturePercent: number;
    slouchCount: number;
    totalSamples: number;
  };
  weekly: {
    scores: (number | null)[];
    average: number;
    dates: string[];
  };
  currentStreak: number;
  bestStreak: number;
}

class PostureApp {
  private monitor: PostureMonitor | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private settings: AppSettings = {
    notificationFrequency: 300000,
    slouchSensitivity: 'medium',
    soundAlerts: false,
    autoStart: false,
    cameraPreview: false,
    breakInterval: 2700000,
    breaksEnabled: true
  };

  async initialize(): Promise<void> {
    this.setupUI();
    this.setupMonitor();
    this.setupIPCHandlers();
    await this.setupSettings();
    this.setupStatsUI();
  }

  private setupUI(): void {
    this.videoElement = document.getElementById('video') as HTMLVideoElement;

    if (!this.videoElement) {
      this.videoElement = document.createElement('video');
      this.videoElement.id = 'video';
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      this.videoElement.style.display = 'none';
      document.body.appendChild(this.videoElement);
    }

    const calibrateBtn = document.getElementById('calibrate-btn');
    if (calibrateBtn) {
      calibrateBtn.addEventListener('click', () => this.handleCalibrate());
    }

    const viewStatsBtn = document.getElementById('view-stats-btn');
    if (viewStatsBtn) {
      viewStatsBtn.addEventListener('click', () => this.showStatsView());
    }

    const closeStatsBtn = document.getElementById('close-stats-btn');
    if (closeStatsBtn) {
      closeStatsBtn.addEventListener('click', () => this.hideStatsView());
    }

    const resetStatsBtn = document.getElementById('reset-stats-btn');
    if (resetStatsBtn) {
      resetStatsBtn.addEventListener('click', () => this.handleResetStats());
    }
  }

  private async setupSettings(): Promise<void> {
    // Load settings from main process
    if (window.electronAPI && window.electronAPI.getSettings) {
      try {
        this.settings = await window.electronAPI.getSettings();
      } catch (error) {
        console.warn('Failed to load settings, using defaults');
      }
    }

    // Apply settings to UI
    const notificationFreq = document.getElementById('notification-frequency') as HTMLSelectElement;
    const slouchSensitivity = document.getElementById('slouch-sensitivity') as HTMLSelectElement;
    const soundAlerts = document.getElementById('sound-alerts') as HTMLInputElement;
    const autoStart = document.getElementById('auto-start') as HTMLInputElement;
    const cameraPreview = document.getElementById('camera-preview') as HTMLInputElement;
    const breaksEnabled = document.getElementById('breaks-enabled') as HTMLInputElement;
    const breakInterval = document.getElementById('break-interval') as HTMLSelectElement;

    if (notificationFreq) {
      notificationFreq.value = this.settings.notificationFrequency.toString();
      notificationFreq.addEventListener('change', () => this.handleSettingsChange());
    }

    if (slouchSensitivity) {
      slouchSensitivity.value = this.settings.slouchSensitivity;
      slouchSensitivity.addEventListener('change', () => this.handleSettingsChange());
    }

    if (soundAlerts) {
      soundAlerts.checked = this.settings.soundAlerts;
      soundAlerts.addEventListener('change', () => this.handleSettingsChange());
    }

    if (autoStart) {
      autoStart.checked = this.settings.autoStart;
      autoStart.addEventListener('change', () => this.handleSettingsChange());
    }

    if (cameraPreview) {
      cameraPreview.checked = this.settings.cameraPreview;
      cameraPreview.addEventListener('change', () => this.handleCameraPreviewToggle());
    }

    if (breaksEnabled) {
      breaksEnabled.checked = this.settings.breaksEnabled;
      breaksEnabled.addEventListener('change', () => this.handleSettingsChange());
    }

    if (breakInterval) {
      breakInterval.value = this.settings.breakInterval.toString();
      breakInterval.addEventListener('change', () => this.handleSettingsChange());
    }
  }

  private handleSettingsChange(): void {
    const notificationFreq = document.getElementById('notification-frequency') as HTMLSelectElement;
    const slouchSensitivity = document.getElementById('slouch-sensitivity') as HTMLSelectElement;
    const soundAlerts = document.getElementById('sound-alerts') as HTMLInputElement;
    const autoStart = document.getElementById('auto-start') as HTMLInputElement;
    const breaksEnabled = document.getElementById('breaks-enabled') as HTMLInputElement;
    const breakInterval = document.getElementById('break-interval') as HTMLSelectElement;

    this.settings = {
      notificationFrequency: parseInt(notificationFreq.value),
      slouchSensitivity: slouchSensitivity.value as 'low' | 'medium' | 'high',
      soundAlerts: soundAlerts.checked,
      autoStart: autoStart.checked,
      cameraPreview: this.settings.cameraPreview,
      breaksEnabled: breaksEnabled.checked,
      breakInterval: parseInt(breakInterval.value)
    };

    // Send settings to main process
    if (window.electronAPI && window.electronAPI.updateSettings) {
      window.electronAPI.updateSettings(this.settings);
    }

    // Update monitor thresholds based on sensitivity
    if (this.monitor) {
      this.updateMonitorSensitivity();
    }
  }

  private updateMonitorSensitivity(): void {
    // Adjust thresholds based on sensitivity
    const thresholds = {
      low: { headForward: 18, shoulderTilt: 12 },
      medium: { headForward: 12, shoulderTilt: 8 },
      high: { headForward: 8, shoulderTilt: 5 }
    };

    const selected = thresholds[this.settings.slouchSensitivity];

    // Note: This would require exposing updateThresholds method on PostureMonitor
    // For now, log the change
    console.log(`Updated sensitivity to ${this.settings.slouchSensitivity}:`, selected);
  }

  private handleCameraPreviewToggle(): void {
    const cameraPreview = document.getElementById('camera-preview') as HTMLInputElement;
    const videoPreview = document.getElementById('video-preview') as HTMLVideoElement;

    this.settings.cameraPreview = cameraPreview.checked;

    if (videoPreview) {
      if (cameraPreview.checked) {
        videoPreview.classList.add('visible');
        // Connect video stream to preview
        if (this.videoElement && this.videoElement.srcObject) {
          videoPreview.srcObject = this.videoElement.srcObject;
        }
      } else {
        videoPreview.classList.remove('visible');
      }
    }

    // Send settings to main process
    if (window.electronAPI && window.electronAPI.updateSettings) {
      window.electronAPI.updateSettings(this.settings);
    }
  }

  private setupMonitor(): void {
    this.monitor = new PostureMonitor({
      frameCaptureIntervalMs: 1500,
      headForwardThresholdDeg: 12,
      shoulderTiltThresholdDeg: 8,
      warningMs: 5000,
      slouchMs: 30000,
    });

    this.monitor.onUpdate((update: PostureUpdate) => {
      this.handlePostureUpdate(update);
    });

    this.monitor.onError((error: Error) => {
      this.handleError(error);
    });
  }

  private setupIPCHandlers(): void {
    if (!window.electronAPI) {
      console.warn('Electron API not available');
      return;
    }

    window.electronAPI.onCalibrationRequest(() => {
      this.handleCalibrate();
    });

    window.electronAPI.onCameraStart(async () => {
      await this.startMonitoring();
    });

    window.electronAPI.onCameraStop(() => {
      this.stopMonitoring();
    });
  }

  private async startMonitoring(): Promise<void> {
    if (!this.monitor || !this.videoElement) {
      return;
    }

    try {
      await this.monitor.initialize(this.videoElement);
      await this.monitor.start();
      console.log('Posture monitoring started');
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error('Failed to start monitoring'));
    }
  }

  private stopMonitoring(): void {
    if (this.monitor) {
      this.monitor.stop();
      console.log('Posture monitoring stopped');
    }
  }

  private handleCalibrate(): void {
    if (!this.monitor) {
      return;
    }

    const calibrationData = this.monitor.calibrate();

    if (calibrationData) {
      console.log('Calibration successful:', calibrationData);

      if (window.electronAPI) {
        window.electronAPI.sendCalibrationComplete(calibrationData);
      }

      this.updateCalibrationUI(true);
    } else {
      console.warn('Calibration failed - no landmarks detected');
      this.updateCalibrationUI(false);
    }
  }

  private handlePostureUpdate(update: PostureUpdate): void {
    this.updatePostureUI(update);

    if (window.electronAPI) {
      window.electronAPI.sendPostureUpdate(update);

      if (update.event) {
        window.electronAPI.sendPostureEvent(update.event);

        // Play sound alert if enabled and slouching
        if (this.settings.soundAlerts && update.state === 'SLOUCHING') {
          if (window.electronAPI.playSoundAlert) {
            window.electronAPI.playSoundAlert();
          }
        }
      }
    }
  }

  private handleError(error: Error): void {
    console.error('Posture app error:', error);

    if (window.electronAPI) {
      window.electronAPI.sendCameraError(error.message);
    }

    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
      errorDiv.textContent = `Error: ${error.message}`;
      errorDiv.style.display = 'block';
    }
  }

  private updatePostureUI(update: PostureUpdate): void {
    const stateElement = document.getElementById('posture-state');
    if (stateElement) {
      stateElement.textContent = update.state.replace('_', ' ');
      stateElement.className = `posture-state state-${update.state.toLowerCase()}`;
    }

    if (update.metrics) {
      const metricsElement = document.getElementById('posture-metrics');
      if (metricsElement) {
        metricsElement.innerHTML = `
          <div>Head Forward: ${update.metrics.headForwardDeg.toFixed(1)}° (Δ${update.metrics.headForwardDeltaDeg.toFixed(1)}°)</div>
          <div>Shoulder Tilt: ${update.metrics.shoulderTiltDeg.toFixed(1)}° (Δ${update.metrics.shoulderTiltDeltaDeg.toFixed(1)}°)</div>
        `;
      }
    }
  }

  private updateCalibrationUI(success: boolean): void {
    const calibrationStatus = document.getElementById('calibration-status');
    if (calibrationStatus) {
      if (success) {
        calibrationStatus.textContent = 'Calibrated ✓';
        calibrationStatus.className = 'calibration-success';
      } else {
        calibrationStatus.textContent = 'Calibration failed - please ensure you are visible to the camera';
        calibrationStatus.className = 'calibration-error';
      }

      setTimeout(() => {
        calibrationStatus.textContent = '';
        calibrationStatus.className = '';
      }, 3000);
    }
  }

  private setupStatsUI(): void {
    // Listen for stats requests from tray menu
    if ((window as any).electron && (window as any).electron.onShowStats) {
      (window as any).electron.onShowStats(() => {
        this.showStatsView();
      });
    }
  }

  private async showStatsView(): Promise<void> {
    const statsView = document.getElementById('stats-view');
    if (!statsView) return;

    try {
      const stats = await this.fetchStats();
      this.renderStats(stats);
      statsView.classList.add('visible');
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }

  private hideStatsView(): void {
    const statsView = document.getElementById('stats-view');
    if (statsView) {
      statsView.classList.remove('visible');
    }
  }

  private async fetchStats(): Promise<StatsData> {
    if ((window as any).electron && (window as any).electron.invoke) {
      return await (window as any).electron.invoke('get-stats');
    }

    // Fallback default stats
    return {
      today: { goodPosturePercent: 0, slouchCount: 0, totalSamples: 0 },
      weekly: { scores: [], average: 0, dates: [] },
      currentStreak: 0,
      bestStreak: 0
    };
  }

  private renderStats(stats: StatsData): void {
    // Today's score
    const todayScoreEl = document.getElementById('today-score');
    if (todayScoreEl) {
      todayScoreEl.textContent = `${stats.today.goodPosturePercent}%`;
    }

    // Slouch count
    const slouchCountEl = document.getElementById('slouch-count');
    if (slouchCountEl) {
      slouchCountEl.textContent = stats.today.slouchCount.toString();
    }

    // Current streak
    const currentStreakEl = document.getElementById('current-streak');
    if (currentStreakEl) {
      currentStreakEl.textContent = stats.currentStreak.toString();
    }

    // Best streak
    const bestStreakEl = document.getElementById('best-streak');
    if (bestStreakEl) {
      bestStreakEl.textContent = stats.bestStreak.toString();
    }

    // Weekly average
    const weeklyAverageEl = document.getElementById('weekly-average');
    if (weeklyAverageEl) {
      weeklyAverageEl.textContent = `Average: ${stats.weekly.average}%`;
    }

    // Weekly trend bars
    const weeklyTrendEl = document.getElementById('weekly-trend');
    if (weeklyTrendEl) {
      weeklyTrendEl.innerHTML = '';

      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      stats.weekly.scores.forEach((score, index) => {
        const date = new Date(stats.weekly.dates[index]);
        const dayLabel = dayLabels[date.getDay()];

        const barContainer = document.createElement('div');
        barContainer.className = 'trend-bar';

        const barFill = document.createElement('div');
        barFill.className = 'trend-bar-fill';

        if (score !== null) {
          barFill.classList.add('has-data');
          barFill.style.height = `${Math.max(score * 0.6, 10)}px`; // Scale to max 60px

          const barValue = document.createElement('div');
          barValue.className = 'trend-bar-value';
          barValue.textContent = `${score}%`;
          barFill.appendChild(barValue);
        }

        const barLabel = document.createElement('div');
        barLabel.className = 'trend-bar-label';
        barLabel.textContent = dayLabel;

        barContainer.appendChild(barFill);
        barContainer.appendChild(barLabel);
        weeklyTrendEl.appendChild(barContainer);
      });
    }
  }

  private async handleResetStats(): Promise<void> {
    const confirmed = confirm('Are you sure you want to reset all stats? This cannot be undone.');

    if (!confirmed) return;

    try {
      if ((window as any).electron && (window as any).electron.invoke) {
        await (window as any).electron.invoke('reset-stats');
      }

      // Refresh stats view
      const stats = await this.fetchStats();
      this.renderStats(stats);
    } catch (error) {
      console.error('Error resetting stats:', error);
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const app = new PostureApp();
  await app.initialize();
});
