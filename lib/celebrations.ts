/**
 * celebrations.ts — Celebration and milestone logic (GL-006)
 *
 * Detects when a goal crosses a milestone threshold (25/50/75/100%)
 * and determines the appropriate celebration type.
 */

import { type Goal, computeGoalProgress } from './goals';

export type MilestoneLevel = 25 | 50 | 75 | 100;

export interface MilestoneHit {
  level: MilestoneLevel;
  goalTitle: string;
  goalId: string;
}

export type CelebrationType = 'milestone_toast' | 'full_celebration' | null;

export interface CelebrationEvent {
  type: CelebrationType;
  goal: Goal;
  milestone?: MilestoneLevel;
  stats: {
    startingValue: number;
    currentValue: number;
    targetValue: number;
    daysTaken: number;
  };
}

const MILESTONES: MilestoneLevel[] = [25, 50, 75, 100];

/**
 * Given old and new percent-complete values, determine which milestone was just crossed.
 * Returns the highest milestone crossed, or null if none.
 */
export function checkMilestones(
  goal: Goal,
  previousValue: number,
  newValue: number,
): MilestoneHit | null {
  const summary = computeGoalProgress({ ...goal, current_value: newValue });
  const prevSummary = computeGoalProgress({ ...goal, current_value: previousValue });

  const prevPct = prevSummary.percentComplete;
  const newPct = summary.percentComplete;

  // Find the highest milestone that was just crossed
  let hit: MilestoneLevel | null = null;
  for (const level of MILESTONES) {
    if (prevPct < level && newPct >= level) {
      hit = level;
    }
  }

  if (!hit) return null;

  return {
    level: hit,
    goalTitle: goal.title,
    goalId: goal.id,
  };
}

/**
 * Determine celebration type for a goal based on its current state.
 * Returns 'full_celebration' for 100% completion, 'milestone_toast' for 25/50/75%.
 */
export function shouldCelebrate(goal: Goal): CelebrationEvent | null {
  const summary = computeGoalProgress(goal);

  if (goal.status === 'completed' || summary.percentComplete >= 100) {
    const created = new Date(goal.created_at);
    const completed = goal.completed_at ? new Date(goal.completed_at) : new Date();
    const daysTaken = Math.max(1, Math.ceil((completed.getTime() - created.getTime()) / 86400000));

    return {
      type: 'full_celebration',
      goal,
      milestone: 100,
      stats: {
        startingValue: goal.starting_value,
        currentValue: goal.current_value,
        targetValue: goal.target_value,
        daysTaken,
      },
    };
  }

  return null;
}

/**
 * Get an appropriate message for a milestone level.
 */
export function getMilestoneMessage(level: MilestoneLevel): { emoji: string; message: string } {
  switch (level) {
    case 25:
      return { emoji: '🌱', message: 'Great start! 25% done!' };
    case 50:
      return { emoji: '🎯', message: 'Halfway there!' };
    case 75:
      return { emoji: '🔥', message: 'Almost there! 75% complete!' };
    case 100:
      return { emoji: '🏆', message: 'Goal completed!' };
  }
}
