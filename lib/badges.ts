/**
 * badges.ts — Badge system for goal achievements (GL-006)
 *
 * Awards badges when users complete goals or hit milestones.
 * Badges are stored in Supabase and displayed on the goals dashboard.
 */

import { getSupabase } from './supabase';
import { type Goal, getGoals } from './goals';

// ── Badge Types ──────────────────────────────────────────────────────────────

export type BadgeType =
  | 'first_goal'
  | 'pain_crusher'
  | 'consistency_king'
  | 'streak_master'
  | 'posture_pro'
  | 'five_goals'
  | 'perfect_week';

export interface Badge {
  id: string;
  type: BadgeType;
  title: string;
  description: string;
  icon: string;
  earned_at: string;
}

// ── Badge Definitions ────────────────────────────────────────────────────────

export const BADGE_DEFINITIONS: Record<BadgeType, { title: string; description: string; icon: string }> = {
  first_goal: {
    title: 'First Steps',
    description: 'Completed your first goal',
    icon: '🎯',
  },
  pain_crusher: {
    title: 'Pain Crusher',
    description: 'Completed a pain reduction goal',
    icon: '💪',
  },
  consistency_king: {
    title: 'Consistency King',
    description: 'Completed a workout consistency goal',
    icon: '👑',
  },
  streak_master: {
    title: 'Streak Master',
    description: 'Completed a workout streak goal',
    icon: '🔥',
  },
  posture_pro: {
    title: 'Posture Pro',
    description: 'Completed a posture score goal',
    icon: '🧘',
  },
  five_goals: {
    title: 'High Achiever',
    description: 'Completed 5 goals',
    icon: '⭐',
  },
  perfect_week: {
    title: 'Perfect Week',
    description: 'Hit 100% workout consistency in a week',
    icon: '🏅',
  },
};

// ── CRUD Functions ───────────────────────────────────────────────────────────

export async function getBadges(): Promise<Badge[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .order('earned_at', { ascending: false });

  if (error || !data) {
    console.error('Failed to fetch badges:', error);
    return [];
  }

  return data as Badge[];
}

export async function awardBadge(type: BadgeType): Promise<Badge | null> {
  const supabase = getSupabase();
  const def = BADGE_DEFINITIONS[type];

  const { data, error } = await supabase
    .from('badges')
    .insert({
      type,
      title: def.title,
      description: def.description,
      icon: def.icon,
      earned_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('Failed to award badge:', error);
    return null;
  }

  return data as Badge;
}

export async function hasBadge(type: BadgeType): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('badges')
    .select('id')
    .eq('type', type)
    .limit(1);

  if (error || !data) return false;
  return data.length > 0;
}

// ── Badge Checking Logic ─────────────────────────────────────────────────────

/**
 * Check all badge conditions against current goals and award any new badges earned.
 * Returns the list of newly awarded badges.
 */
export async function checkAndAwardBadges(completedGoals: Goal[]): Promise<Badge[]> {
  const awarded: Badge[] = [];

  // First Goal badge
  if (completedGoals.length >= 1) {
    if (!(await hasBadge('first_goal'))) {
      const badge = await awardBadge('first_goal');
      if (badge) awarded.push(badge);
    }
  }

  // Five Goals badge
  if (completedGoals.length >= 5) {
    if (!(await hasBadge('five_goals'))) {
      const badge = await awardBadge('five_goals');
      if (badge) awarded.push(badge);
    }
  }

  // Type-specific badges
  const typeMap: Array<{ goalType: string; badgeType: BadgeType }> = [
    { goalType: 'pain_reduction', badgeType: 'pain_crusher' },
    { goalType: 'workout_consistency', badgeType: 'consistency_king' },
    { goalType: 'workout_streak', badgeType: 'streak_master' },
    { goalType: 'posture_score', badgeType: 'posture_pro' },
  ];

  for (const { goalType, badgeType } of typeMap) {
    const hasGoalOfType = completedGoals.some((g) => g.type === goalType);
    if (hasGoalOfType && !(await hasBadge(badgeType))) {
      const badge = await awardBadge(badgeType);
      if (badge) awarded.push(badge);
    }
  }

  // Perfect Week: check if any consistency goal hit 100%
  const perfectWeek = completedGoals.some(
    (g) => g.type === 'workout_consistency' && g.current_value >= 100,
  );
  if (perfectWeek && !(await hasBadge('perfect_week'))) {
    const badge = await awardBadge('perfect_week');
    if (badge) awarded.push(badge);
  }

  return awarded;
}
