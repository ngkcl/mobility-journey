/**
 * Client-side video frame extraction using HTML5 Video + Canvas.
 * No server-side ffmpeg required — works on Vercel.
 */

export interface FrameExtractionResult {
  frames: string[]; // base64 PNG data URIs
  duration: number; // seconds
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
 */
function captureFrame(video: HTMLVideoElement, time: number): Promise<string> {
  return new Promise((resolve, reject) => {
    video.currentTime = time;

    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Return raw base64 without data URI prefix for API consumption
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        resolve(base64);
      } catch (err) {
        reject(err);
      }
    };

    video.addEventListener('seeked', onSeeked);
  });
}

/**
 * Extract frames from a video file at key timestamps.
 * Timestamps: 0s, 25%, 50%, 75%, and last few seconds.
 * Max 8 frames total.
 */
export async function extractVideoFrames(file: File): Promise<FrameExtractionResult> {
  const video = await loadVideo(file);
  const duration = video.duration;

  if (!duration || !isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(video.src);
    throw new Error('Could not determine video duration');
  }

  // Build timestamp list
  const timestamps: number[] = [];
  const safeEnd = Math.max(0, duration - 0.1);

  // Core timestamps: 0, 25%, 50%, 75%
  timestamps.push(Math.min(0.1, safeEnd)); // near start (avoid blank frame at 0)
  if (duration > 2) timestamps.push(duration * 0.25);
  if (duration > 4) timestamps.push(duration * 0.5);
  if (duration > 6) timestamps.push(duration * 0.75);

  // Last few seconds — grab 2-3 frames near the end
  if (duration > 8) {
    timestamps.push(Math.max(0, duration - 3));
    timestamps.push(Math.max(0, duration - 1.5));
  }
  timestamps.push(safeEnd);

  // Deduplicate and sort, cap at 8
  const unique = [...new Set(timestamps.map((t) => Math.round(t * 10) / 10))]
    .sort((a, b) => a - b)
    .slice(0, 8);

  const frames: string[] = [];
  for (const t of unique) {
    try {
      const frame = await captureFrame(video, t);
      frames.push(frame);
    } catch {
      // Skip frames that fail to capture
    }
  }

  URL.revokeObjectURL(video.src);

  return { frames, duration };
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
        // Thumbnail at reduced resolution
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
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
