// ─── Photo ────────────────────────────────────────────
export type PhotoView = 'front' | 'back' | 'left' | 'right';

export interface Photo {
  id: string;
  taken_at: string;
  view: PhotoView;
  public_url: string;
  storage_path: string;
  notes: string | null;
}

// ─── Video ────────────────────────────────────────────
export type VideoCategory = 'exercise' | 'posture' | 'mobility' | 'daily' | 'other';
export type AnalysisStatus = 'pending' | 'analyzing' | 'complete' | 'failed';

export interface VideoAnalysisResult {
  structuredData: {
    movement_quality_score?: number;
    posture_score?: number;
    symmetry_score?: number;
    movement_type?: string;
    compensation_patterns?: string[];
    asymmetries?: string[];
    form_issues?: string[];
    strengths?: string[];
    risk_level?: string;
    confidence?: string;
  } | null;
  rawAnalysis: string;
}

export interface Video {
  id: string;
  recorded_at: string;
  duration_seconds: number | null;
  storage_path: string;
  public_url: string;
  thumbnail_url: string | null;
  label: string | null;
  category: VideoCategory;
  notes: string | null;
  analysis_status: AnalysisStatus;
  analysis_result: VideoAnalysisResult | null;
  tags: string[] | null;
}

// ─── Metrics ──────────────────────────────────────────
export interface MetricEntry {
  id: string;
  entry_date: string;
  pain_level: number | null;
  posture_score: number | null;
  symmetry_score: number | null;
  energy_level: number | null;
  exercise_done: boolean | null;
  exercise_minutes: number | null;
  exercise_names: string | null;
  functional_milestone: string | null;
  rom_forward_bend: number | null;
  rom_lateral: number | null;
  rib_hump: string | null;
  notes: string | null;
}

// ─── Analysis ─────────────────────────────────────────
export type AnalysisType = 'ai' | 'personal' | 'specialist';

export interface AnalysisEntry {
  id: string;
  entry_date: string;
  category: AnalysisType;
  title: string;
  content: string;
}

// ─── Todo ─────────────────────────────────────────────
export type TodoCategory = 'exercise' | 'appointment' | 'supplement' | 'other';
export type TodoFrequency = 'daily' | 'weekly' | 'once';

export interface Todo {
  id: string;
  title: string;
  details: string | null;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  category: TodoCategory;
  frequency: TodoFrequency | null;
}

// ─── Posture Sessions ─────────────────────────────────
export interface PostureSession {
  id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  good_posture_pct: number | null;
  slouch_count: number | null;
  avg_pitch: number | null;
  baseline_pitch: number | null;
}

// ─── Charts ───────────────────────────────────────────
export interface ChartPoint {
  date: string;
  painLevel?: number;
  postureScore?: number;
  symmetryScore?: number;
  energyLevel?: number;
}

// ─── Toast ────────────────────────────────────────────
export type ToastTone = 'error' | 'success' | 'info';
