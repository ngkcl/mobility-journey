/**
 * API calls for Claude analysis endpoints.
 * These call a configurable API_URL (Supabase Edge Function, Express server, etc.)
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export interface PhotoAnalysisResponse {
  analysis: string;
  structuredData: Record<string, unknown> | null;
  photoId: string;
  model: string;
}

export interface VideoAnalysisResponse {
  analysis: string;
  structuredData: Record<string, unknown> | null;
  videoId: string;
  frameCount: number;
  model: string;
}

export async function analyzePhoto(
  photoUrl: string,
  photoId: string,
): Promise<PhotoAnalysisResponse> {
  const res = await fetch(`${API_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoUrl, photoId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Analysis failed (${res.status})`);
  }

  return res.json();
}

export async function analyzeVideo(params: {
  frames: string[];
  timestamps: { timestamp: number; label: string }[];
  videoId: string;
  duration: number;
  frameInterval: number;
}): Promise<VideoAnalysisResponse> {
  const res = await fetch(`${API_URL}/api/analyze-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Video analysis failed (${res.status})`);
  }

  return res.json();
}
