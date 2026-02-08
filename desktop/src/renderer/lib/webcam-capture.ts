export interface WebcamCaptureOptions {
  width?: number;
  height?: number;
  deviceId?: string;
}

const DEFAULT_OPTIONS: Required<Omit<WebcamCaptureOptions, 'deviceId'>> = {
  width: 640,
  height: 480,
};

export class WebcamCapture {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;

  async requestPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Failed to request webcam permission:', error);
      return false;
    }
  }

  async start(
    videoElement: HTMLVideoElement,
    options: WebcamCaptureOptions = {}
  ): Promise<void> {
    const config = { ...DEFAULT_OPTIONS, ...options };
    this.videoElement = videoElement;

    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: config.width },
        height: { ideal: config.height },
        ...(options.deviceId && { deviceId: { exact: options.deviceId } }),
      },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = this.stream;

      await new Promise<void>((resolve, reject) => {
        videoElement.onloadedmetadata = () => {
          videoElement.play().then(resolve).catch(reject);
        };
      });
    } catch (error) {
      console.error('Failed to start webcam:', error);
      throw new Error(`Webcam access failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  async getAvailableDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
  }

  isActive(): boolean {
    return this.stream !== null && this.stream.active;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }
}
