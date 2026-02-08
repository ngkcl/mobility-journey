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

// ─── Exercises ────────────────────────────────────────
export type ExerciseCategory =
  | 'corrective'
  | 'stretching'
  | 'strengthening'
  | 'warmup'
  | 'cooldown'
  | 'gym_compound'
  | 'gym_isolation'
  | 'cardio'
  | 'mobility';

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  target_muscles: string[] | null;
  description: string | null;
  instructions: string | null;
  sets_default: number | null;
  reps_default: number | null;
  duration_seconds_default: number | null;
  side_specific: boolean;
  video_url: string | null;
  image_url: string | null;
}

// ─── Workouts ────────────────────────────────────────
export type WorkoutType = 'corrective' | 'gym' | 'cardio' | 'other';
export type WorkoutSetSide = 'left' | 'right' | 'bilateral';

export interface WorkoutSet {
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  side: WorkoutSetSide | null;
  rpe: number | null;
  notes: string | null;
}

export interface Workout {
  id: string;
  date: string;
  type: WorkoutType;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  energy_level_before: number | null;
  energy_level_after: number | null;
  pain_level_before: number | null;
  pain_level_after: number | null;
}

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string | null;
  order_index: number;
  sets: WorkoutSet[];
}

export interface WorkoutTemplateExercise {
  exercise_id: string;
  sets: number | null;
  reps: number | null;
  duration: number | null;
  side: WorkoutSetSide | null;
  order: number;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  type: WorkoutType;
  exercises: WorkoutTemplateExercise[];
  estimated_duration_minutes: number | null;
  created_at: string;
}

// ─── Daily Plans ─────────────────────────────────────
export type DailyPlanStatus = 'generated' | 'accepted' | 'modified';

export interface DailyPlanExercise {
  name: string;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  side: WorkoutSetSide | null;
  notes: string | null;
  reason: string | null;
}

export interface DailyPlanSection {
  title: string;
  focus: string | null;
  exercises: DailyPlanExercise[];
}

export interface DailyPlanPayload {
  morning: DailyPlanSection;
  afternoon: DailyPlanSection;
  evening: DailyPlanSection;
  gym: DailyPlanSection | null;
}

export interface DailyPlan {
  id: string;
  plan_date: string;
  plan: DailyPlanPayload;
  reasoning: string[] | null;
  status: DailyPlanStatus;
  model: string | null;
  created_at: string;
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

// ─── Monthly Programs ─────────────────────────────────
export interface MonthlyProgram {
  id: string;
  month: string;
  name: string;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface ProgramExercise {
  id: string;
  program_id: string;
  exercise_id: string;
  session_slot: 'morning' | 'midday' | 'evening' | 'gym';
  sets: number;
  reps: number | null;
  hold_seconds: number | null;
  side: string;
  order_index: number;
  mandatory: boolean;
  notes: string | null;
  created_at: string;
  exercises?: Exercise;
}

export type CoachAssignmentPriority = 'high' | 'normal';
export type CoachAssignmentSource = 'coach' | 'physio' | 'self';

export interface CoachAssignment {
  id: string;
  assigned_date: string | null;
  expires_date: string | null;
  exercise_id: string;
  session_slot: string | null;
  sets: number | null;
  reps: number | null;
  hold_seconds: number | null;
  side: string | null;
  priority: CoachAssignmentPriority;
  coach_notes: string | null;
  source: CoachAssignmentSource;
  completed: boolean;
  created_at: string;
  exercises?: Exercise;
}

// ─── Toast ────────────────────────────────────────────
export type ToastTone = 'error' | 'success' | 'info';
