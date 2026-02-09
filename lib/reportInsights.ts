/**
 * Smart insight generation for weekly reports.
 * Surfaces meaningful observations and recommendations.
 */

import type { Insight, InsightType, WorkoutSummary, MetricsSummary, PhotoSummary } from './weeklyReport';

let insightIdCounter = 0;

const createInsight = (
  type: InsightType,
  icon: string,
  title: string,
  description: string,
  action?: { label: string; route: string }
): Insight => ({
  id: `insight_${++insightIdCounter}`,
  type,
  icon,
  title,
  description,
  action,
});

/**
 * Generate up to 5 insights based on weekly data.
 * Prioritizes achievements, then warnings, then tips.
 */
export function generateInsights(
  workout: WorkoutSummary,
  metrics: MetricsSummary,
  photos: PhotoSummary,
  hasPreviousWeek: boolean
): Insight[] {
  const achievements: Insight[] = [];
  const warnings: Insight[] = [];
  const tips: Insight[] = [];

  // ─── Achievement Insights ────────────────────────────────────────────

  // Streak milestones
  if (workout.streakDays >= 30) {
    achievements.push(createInsight(
      'achievement',
      '🏆',
      '30-Day Streak!',
      `Incredible consistency! You've worked out ${workout.streakDays} days in a row. This dedication is making a real difference.`
    ));
  } else if (workout.streakDays >= 14) {
    achievements.push(createInsight(
      'achievement',
      '🔥',
      '2-Week Streak!',
      `14+ days of consistent training. Your body is adapting and getting stronger.`
    ));
  } else if (workout.streakDays >= 7) {
    achievements.push(createInsight(
      'achievement',
      '⭐',
      'Perfect Week!',
      `You maintained a ${workout.streakDays}-day workout streak. Keep this momentum going!`
    ));
  }

  // Consistency achievements
  if (workout.consistencyPct >= 90) {
    achievements.push(createInsight(
      'achievement',
      '✅',
      'Excellent Consistency',
      `${workout.consistencyPct}% of planned sessions completed. This level of dedication accelerates progress.`
    ));
  } else if (workout.consistencyPct >= 75 && hasPreviousWeek) {
    achievements.push(createInsight(
      'achievement',
      '📈',
      'Strong Compliance',
      `${workout.consistencyPct}% consistency this week. You're building sustainable habits.`
    ));
  }

  // Asymmetry improvement
  if (workout.asymmetryChange !== null && workout.asymmetryChange < -5) {
    achievements.push(createInsight(
      'achievement',
      '⚖️',
      'Balance Improving!',
      `Left/right asymmetry reduced by ${Math.abs(workout.asymmetryChange)}%. Your corrective work is paying off.`,
      { label: 'View Charts', route: '/charts' }
    ));
  }

  // Pain reduction
  if (metrics.painTrend === 'improving' && metrics.avgPainLevel !== null) {
    achievements.push(createInsight(
      'achievement',
      '🎉',
      'Pain Decreasing',
      `Average pain level is down this week (${metrics.avgPainLevel}/10). Your body is responding well to the protocol.`,
      { label: 'Log Metrics', route: '/metrics' }
    ));
  }

  // Posture improvement
  if (metrics.postureTrend === 'improving' && metrics.avgPostureScore !== null) {
    achievements.push(createInsight(
      'achievement',
      '🎯',
      'Posture Improving',
      `Posture score trending up (${metrics.avgPostureScore}/10). Keep focusing on alignment cues.`
    ));
  }

  // Volume milestone
  if (workout.totalVolume >= 10000) {
    achievements.push(createInsight(
      'achievement',
      '💪',
      'High Volume Week',
      `${(workout.totalVolume / 1000).toFixed(1)}k kg total volume. You're putting in the work!`
    ));
  }

  // ─── Warning Insights ────────────────────────────────────────────

  // Low consistency
  if (workout.consistencyPct < 50) {
    warnings.push(createInsight(
      'warning',
      '⚠️',
      'Consistency Dip',
      `Only ${workout.consistencyPct}% of sessions completed. Try to fit in even 10-minute corrective sessions.`,
      { label: 'Start Workout', route: '/workouts' }
    ));
  }

  // Streak broken
  if (workout.streakStatus === 'broken' && hasPreviousWeek) {
    warnings.push(createInsight(
      'warning',
      '💔',
      'Streak Reset',
      `Your workout streak was broken. Don't worry — start fresh today and rebuild the habit.`,
      { label: 'Start Workout', route: '/workouts' }
    ));
  }

  // Asymmetry worsening
  if (workout.asymmetryChange !== null && workout.asymmetryChange > 5) {
    warnings.push(createInsight(
      'warning',
      '📊',
      'Asymmetry Increasing',
      `Left/right imbalance grew by ${workout.asymmetryChange}%. Focus on unilateral exercises with extra reps on the weak side.`,
      { label: 'View Exercises', route: '/exercises' }
    ));
  }

  // Pain increasing
  if (metrics.painTrend === 'declining' && metrics.avgPainLevel !== null) {
    warnings.push(createInsight(
      'warning',
      '🩹',
      'Pain Trending Up',
      `Average pain level increased to ${metrics.avgPainLevel}/10. Consider reducing intensity or adding more recovery work.`,
      { label: 'Log Metrics', route: '/metrics' }
    ));
  }

  // No metrics logged
  if (metrics.metricsLogged === 0) {
    warnings.push(createInsight(
      'warning',
      '📝',
      'No Metrics This Week',
      `Logging daily metrics helps track what's working. Try to log at least every other day.`,
      { label: 'Log Now', route: '/metrics' }
    ));
  }

  // No photos this week
  if (photos.photosThisWeek === 0) {
    warnings.push(createInsight(
      'warning',
      '📸',
      'No Progress Photos',
      `Weekly photos help visualize changes over time. Take a quick set from each angle.`,
      { label: 'Upload Photos', route: '/photos' }
    ));
  }

  // Right side still dominant (specific to Nick's case)
  if (workout.rightVolume > workout.leftVolume * 1.2) {
    const dominance = Math.round(((workout.rightVolume / workout.leftVolume) - 1) * 100);
    warnings.push(createInsight(
      'warning',
      '⚡',
      'Right Side Dominant',
      `Right side volume is ${dominance}% higher than left. Add extra left-side sets to balance.`,
      { label: 'View Exercises', route: '/exercises' }
    ));
  }

  // ─── Tip Insights ────────────────────────────────────────────

  // Suggest corrective focus
  if (workout.correctiveSessions < workout.gymSessions) {
    tips.push(createInsight(
      'tip',
      '💡',
      'Prioritize Corrective Work',
      `Gym sessions (${workout.gymSessions}) exceeded corrective (${workout.correctiveSessions}). For posture goals, flip this ratio.`
    ));
  }

  // Photo comparison tip
  if (photos.hasComparisonPair) {
    tips.push(createInsight(
      'tip',
      '📷',
      'Compare Your Progress',
      `You have photos from multiple days. Open the comparison view to see visible changes.`,
      { label: 'Compare Photos', route: '/photos' }
    ));
  }

  // Energy insight
  if (metrics.avgEnergyLevel !== null && metrics.avgEnergyLevel < 5) {
    tips.push(createInsight(
      'tip',
      '🔋',
      'Watch Your Energy',
      `Average energy was ${metrics.avgEnergyLevel}/10. Prioritize sleep and recovery days if fatigue persists.`
    ));
  }

  // Symmetry score check
  if (metrics.avgSymmetryScore !== null && metrics.avgSymmetryScore < 6) {
    tips.push(createInsight(
      'tip',
      '🔄',
      'Symmetry Score Low',
      `Symmetry averaging ${metrics.avgSymmetryScore}/10. Focus on single-leg and single-arm exercises.`,
      { label: 'Daily Plan', route: '/plan' }
    ));
  }

  // General encouragement if no other tips
  if (tips.length === 0 && achievements.length > 0) {
    tips.push(createInsight(
      'tip',
      '🌟',
      'Keep It Up!',
      `You're making great progress. Stay consistent and trust the process.`
    ));
  }

  // First week tip
  if (!hasPreviousWeek) {
    tips.push(createInsight(
      'tip',
      '🚀',
      'Great Start!',
      `This is your first week with data. Next week we'll show trends and comparisons.`
    ));
  }

  // ─── Prioritize and Limit ────────────────────────────────────────────

  // Take up to 2 achievements, 2 warnings, 1 tip (max 5 total)
  const selected: Insight[] = [];
  
  selected.push(...achievements.slice(0, 2));
  selected.push(...warnings.slice(0, 2));
  selected.push(...tips.slice(0, 5 - selected.length));

  return selected.slice(0, 5);
}

/**
 * Get a color for the insight based on type.
 */
export function getInsightColor(type: InsightType): string {
  switch (type) {
    case 'achievement':
      return '#10B981'; // green
    case 'warning':
      return '#F59E0B'; // amber
    case 'tip':
      return '#3B82F6'; // blue
    default:
      return '#6B7280'; // gray
  }
}

/**
 * Get the background color for insight cards.
 */
export function getInsightBgColor(type: InsightType): string {
  switch (type) {
    case 'achievement':
      return 'rgba(16, 185, 129, 0.1)';
    case 'warning':
      return 'rgba(245, 158, 11, 0.1)';
    case 'tip':
      return 'rgba(59, 130, 246, 0.1)';
    default:
      return 'rgba(107, 114, 128, 0.1)';
  }
}
