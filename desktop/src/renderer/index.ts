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
    };
  }
}

class PostureApp {
  private monitor: PostureMonitor | null = null;
  private videoElement: HTMLVideoElement | null = null;

  async initialize(): Promise<void> {
    this.setupUI();
    this.setupMonitor();
    this.setupIPCHandlers();
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
}

document.addEventListener('DOMContentLoaded', async () => {
  const app = new PostureApp();
  await app.initialize();
});
