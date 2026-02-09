import { getSupabase } from './supabase';

export type GoalType =
  | 'pain_reduction'
  | 'symmetry_improvement'
  | 'posture_score'
  | 'workout_consistency'
  | 'workout_streak'
  | 'custom';

export type GoalStatus = 'active' | 'completed' | 'failed' | 'paused';
export type GoalTrend = 'improving' | 'stable' | 'worsening';

export interface Goal {
  id: string;
  type: GoalType;
  title: string;
  description: string | null;
  target_value: number;
  starting_value: number;
  current_value: number;
  deadline: string;
  created_at: string;
  completed_at: string | null;
  status: GoalStatus;
}

export interface GoalProgress {
  goal_id: string;
  recorded_at: string;
  value: number;
  notes: string | null;
}

export type GoalProgressSummary = {
  percentComplete: number;
  onTrack: boolean;
  projectedCompletion: string | null;
  trend: GoalTrend;
};

export type CreateGoalInput = Omit<Goal, 'id' | 'created_at' | 'completed_at'> & {
  completed_at?: string | null;
};

export type UpdateGoalInput = Partial<Omit<Goal, 'id' | 'created_at'>>;

const IMPROVEMENT_GOAL_TYPES: GoalType[] = [
  'symmetry_improvement',
  'posture_score',
  'workout_consistency',
  'workout_streak',
];

const toNumber = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return value;
};

const clampPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
};

const parseDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isLowerBetter = (goal: Pick<Goal, 'type' | 'starting_value' | 'target_value'>) => {
  if (goal.type === 'pain_reduction') return true;
  if (IMPROVEMENT_GOAL_TYPES.includes(goal.type)) return false;
  return goal.target_value < goal.starting_value;
};

export const isGoalComplete = (goal: Pick<Goal, 'type' | 'target_value' | 'current_value' | 'starting_value'>) => {
  const lowerBetter = isLowerBetter(goal);
  return lowerBetter ? goal.current_value <= goal.target_value : goal.current_value >= goal.target_value;
};

const computeTrend = (progressDelta: number): GoalTrend => {
  if (progressDelta > 0) return 'improving';
  if (progressDelta < 0) return 'worsening';
  return 'stable';
};

export const computeGoalProgress = (goal: Goal): GoalProgressSummary => {
  const lowerBetter = isLowerBetter(goal);
  const starting = toNumber(goal.starting_value);
  const current = toNumber(goal.current_value);
  const target = toNumber(goal.target_value);

  const totalDelta = lowerBetter ? starting - target : target - starting;
  const progressDelta = lowerBetter ? starting - current : current - starting;

  const complete = isGoalComplete(goal) || goal.status === 'completed';
  const rawPercent = totalDelta === 0 ? (complete ? 100 : 0) : (progressDelta / totalDelta) * 100;
  const percentComplete = complete ? 100 : clampPercent(rawPercent);
  const trend = computeTrend(progressDelta);

  const createdAt = parseDate(goal.created_at);
  const deadline = parseDate(goal.deadline);
  const now = new Date();

  let onTrack = true;
  if (deadline) {
    if (complete) {
      onTrack = true;
    } else if (now > deadline) {
      onTrack = false;
    } else if (createdAt && deadline > createdAt) {
      const elapsedMs = now.getTime() - createdAt.getTime();
      const totalMs = deadline.getTime() - createdAt.getTime();
      const expectedPct = clampPercent((elapsedMs / totalMs) * 100);
      onTrack = percentComplete + 10 >= expectedPct;
    }
  }

  let projectedCompletion: string | null = null;
  if (complete) {
    projectedCompletion = goal.completed_at ?? now.toISOString();
  } else if (createdAt && deadline) {
    const elapsedMs = now.getTime() - createdAt.getTime();
    if (elapsedMs > 0 && progressDelta > 0) {
      const remainingDelta = Math.max(0, totalDelta - progressDelta);
      const ratePerMs = progressDelta / elapsedMs;
      if (ratePerMs > 0) {
        const projected = new Date(now.getTime() + remainingDelta / ratePerMs);
        projectedCompletion = projected.toISOString();
      }
    }
  }

  return {
    percentComplete,
    onTrack,
    projectedCompletion,
    trend,
  };
};

export async function createGoal(input: CreateGoalInput): Promise<Goal | null> {
  const supabase = getSupabase();
  const payload = {
    ...input,
    completed_at: input.completed_at ?? null,
  };

  const { data, error } = await supabase.from('goals').insert(payload).select('*').single();
  if (error || !data) {
    console.error('Failed to create goal:', error);
    return null;
  }

  return data as Goal;
}

export async function updateGoal(id: string, updates: UpdateGoalInput): Promise<Goal | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('goals')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    console.error('Failed to update goal:', error);
    return null;
  }

  return data as Goal;
}

export async function deleteGoal(id: string): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase.from('goals').delete().eq('id', id);
  return !error;
}

export async function getGoals(status?: GoalStatus): Promise<Goal[]> {
  const supabase = getSupabase();
  let query = supabase.from('goals').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error || !data) {
    console.error('Failed to fetch goals:', error);
    return [];
  }

  return data as Goal[];
}

export async function getGoalProgress(goalId: string): Promise<GoalProgress[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('goal_progress')
    .select('goal_id, recorded_at, value, notes')
    .eq('goal_id', goalId)
    .order('recorded_at', { ascending: true });

  if (error || !data) {
    console.error('Failed to fetch goal progress:', error);
    return [];
  }

  return data as GoalProgress[];
}
