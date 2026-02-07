/**
 * Client-side video frame extraction using HTML5 Video + Canvas.
 * No server-side ffmpeg required — works on Vercel.
 *
 * Frame density scales with video duration to ensure proper movement continuity:
 * - < 10s: 1 frame/2s
 * - 10-60s: 1 frame/5s
 * - 1-5 min: 1 frame/8s
 * - 5+ min: 1 frame/10s
 * Capped at 40 frames max.
 */

export interface ExtractedFrame {
  base64: string;       // raw base64 (no data URI prefix)
  timestamp: number;    // seconds into the video
  label: string;        // human-readable timestamp "0:05"
}

export interface FrameExtractionResult {
  frames: ExtractedFrame[];
  duration: number;     // seconds
  frameInterval: number; // seconds between frames
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Determine optimal frame interval based on video duration.
 */
function getFrameInterval(duration: number): number {
  if (duration <= 10) return 2;
  if (duration <= 60) return 5;
  if (duration <= 300) return 8;
  return 10;
}

/**
 * Load a video file into an HTML5 video element and resolve when metadata is ready.
 */
function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(file);
    video.src = url;

    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };
  });
}

/**
 * Seek to a specific time and capture a frame as base64 PNG.
 * Downscale to max 1280px wide to reduce payload size.
 */
function captureFrame(video: HTMLVideoElement, time: number): Promise<string> {
  return new Promise((resolve, reject) => {
    video.currentTime = time;

    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      try {
        const canvas = document.createElement('canvas');
        // Downscale for reasonable payload size
        const maxWidth = 1280;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Use JPEG for smaller size (vs PNG)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
        resolve(base64);
      } catch (err) {
        reject(err);
      }
    };

    video.addEventListener('seeked', onSeeked);
  });
}

/**
 * Extract frames from a video file with proper density based on duration.
 * Ensures movement continuity by using evenly-spaced intervals.
 *
 * Examples:
 * - 30s video @ 5s interval → 7 frames
 * - 2 min video @ 8s interval → 16 frames
 * - 5 min video @ 10s interval → 31 frames
 */
export async function extractVideoFrames(file: File): Promise<FrameExtractionResult> {
  const video = await loadVideo(file);
  const duration = video.duration;

  if (!duration || !isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(video.src);
    throw new Error('Could not determine video duration');
  }

  const interval = getFrameInterval(duration);
  const maxFrames = 40;

  // Build evenly-spaced timestamps
  const timestamps: number[] = [];
  const safeEnd = Math.max(0, duration - 0.1);

  // Start slightly after 0 to avoid blank frames
  let t = Math.min(0.5, safeEnd);
  while (t < safeEnd && timestamps.length < maxFrames - 1) {
    timestamps.push(Math.round(t * 10) / 10);
    t += interval;
  }

  // Always include the final frame
  if (timestamps[timestamps.length - 1] < safeEnd - 1) {
    timestamps.push(Math.round(safeEnd * 10) / 10);
  }

  // Cap at max frames (keep evenly distributed)
  let finalTimestamps = timestamps;
  if (timestamps.length > maxFrames) {
    const step = (timestamps.length - 1) / (maxFrames - 1);
    finalTimestamps = [];
    for (let i = 0; i < maxFrames; i++) {
      finalTimestamps.push(timestamps[Math.round(i * step)]);
    }
  }

  const frames: ExtractedFrame[] = [];
  for (const ts of finalTimestamps) {
    try {
      const base64 = await captureFrame(video, ts);
      frames.push({
        base64,
        timestamp: ts,
        label: formatTimestamp(ts),
      });
    } catch {
      // Skip frames that fail to capture
    }
  }

  URL.revokeObjectURL(video.src);

  return { frames, duration, frameInterval: interval };
}

/**
 * Extract a single thumbnail frame at 1 second (or near start for short videos).
 * Returns a base64 data URI suitable for display.
 */
export async function extractThumbnail(file: File): Promise<{ dataUrl: string; duration: number }> {
  const video = await loadVideo(file);
  const duration = video.duration;

  if (!duration || !isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(video.src);
    throw new Error('Could not determine video duration');
  }

  const seekTo = Math.min(1, duration * 0.1);

  return new Promise((resolve, reject) => {
    video.currentTime = seekTo;
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        URL.revokeObjectURL(video.src);
        resolve({ dataUrl, duration });
      } catch (err) {
        URL.revokeObjectURL(video.src);
        reject(err);
      }
    };
  });
}
