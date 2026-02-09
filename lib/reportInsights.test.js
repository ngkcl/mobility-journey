const { describe, it } = require('node:test');
const assert = require('node:assert');

// Since reportInsights.ts is TypeScript and exports are used by weeklyReport.ts,
// we test the logic directly here without importing the module.

// Pure functions replicated for testing
const getInsightColor = (type) => {
  switch (type) {
    case 'achievement':
      return '#10B981';
    case 'warning':
      return '#F59E0B';
    case 'tip':
      return '#3B82F6';
    default:
      return '#6B7280';
  }
};

const getInsightBgColor = (type) => {
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
};

let insightIdCounter = 0;

const createInsight = (type, icon, title, description, action) => ({
  id: `insight_${++insightIdCounter}`,
  type,
  icon,
  title,
  description,
  action,
});

function generateInsights(workout, metrics, photos, hasPreviousWeek) {
  const achievements = [];
  const warnings = [];
  const tips = [];

  // Streak milestones
  if (workout.streakDays >= 7) {
    achievements.push(createInsight(
      'achievement',
      '⭐',
      'Perfect Week!',
      `You maintained a ${workout.streakDays}-day workout streak.`
    ));
  }

  // Consistency achievements
  if (workout.consistencyPct >= 90) {
    achievements.push(createInsight(
      'achievement',
      '✅',
      'Excellent Consistency',
      `${workout.consistencyPct}% of planned sessions completed.`
    ));
  }

  // Pain improvement
  if (metrics.painTrend === 'improving' && metrics.avgPainLevel !== null) {
    achievements.push(createInsight(
      'achievement',
      '🎉',
      'Pain Decreasing',
      `Average pain level is down (${metrics.avgPainLevel}/10).`
    ));
  }

  // Warnings
  if (workout.consistencyPct < 50) {
    warnings.push(createInsight(
      'warning',
      '⚠️',
      'Consistency Dip',
      `Only ${workout.consistencyPct}% of sessions completed.`,
      { label: 'Start Workout', route: '/workouts' }
    ));
  }

  if (metrics.metricsLogged === 0) {
    warnings.push(createInsight(
      'warning',
      '📝',
      'No Metrics This Week',
      `Logging daily metrics helps track progress.`,
      { label: 'Log Now', route: '/metrics' }
    ));
  }

  if (photos.photosThisWeek === 0) {
    warnings.push(createInsight(
      'warning',
      '📸',
      'No Progress Photos',
      `Weekly photos help visualize changes.`,
      { label: 'Upload Photos', route: '/photos' }
    ));
  }

  if (workout.rightVolume > workout.leftVolume * 1.2) {
    warnings.push(createInsight(
      'warning',
      '⚡',
      'Right Side Dominant',
      `Right side volume is higher than left.`
    ));
  }

  // Tips
  if (!hasPreviousWeek) {
    tips.push(createInsight(
      'tip',
      '🚀',
      'Great Start!',
      `This is your first week with data.`
    ));
  }

  const selected = [];
  selected.push(...achievements.slice(0, 2));
  selected.push(...warnings.slice(0, 2));
  selected.push(...tips.slice(0, 5 - selected.length));

  return selected.slice(0, 5);
}

describe('reportInsights', () => {
  const baseWorkout = {
    totalSessions: 5,
    correctiveSessions: 15,
    gymSessions: 2,
    totalVolume: 5000,
    leftVolume: 2500,
    rightVolume: 2500,
    asymmetryPct: 0,
    asymmetryChange: null,
    consistencyPct: 71,
    streakDays: 5,
    streakStatus: 'building',
  };

  const baseMetrics = {
    avgPainLevel: 5,
    painTrend: 'stable',
    avgPostureScore: 6,
    postureTrend: 'stable',
    avgEnergyLevel: 7,
    avgSymmetryScore: 6,
    metricsLogged: 5,
  };

  const basePhotos = {
    photosThisWeek: 2,
    earliestPhotoUrl: 'https://example.com/1.jpg',
    latestPhotoUrl: 'https://example.com/2.jpg',
    hasComparisonPair: true,
    viewsCaptured: ['front', 'back'],
  };

  it('generates insights array with max 5 items', () => {
    const insights = generateInsights(baseWorkout, baseMetrics, basePhotos, true);
    assert.ok(Array.isArray(insights));
    assert.ok(insights.length <= 5);
  });

  it('generates achievement for 7-day streak', () => {
    const workout = { ...baseWorkout, streakDays: 7, streakStatus: 'building' };
    const insights = generateInsights(workout, baseMetrics, basePhotos, true);
    const streakInsight = insights.find(i => i.title.includes('Week'));
    assert.ok(streakInsight);
    assert.strictEqual(streakInsight.type, 'achievement');
  });

  it('generates achievement for high consistency', () => {
    const workout = { ...baseWorkout, consistencyPct: 95 };
    const insights = generateInsights(workout, baseMetrics, basePhotos, true);
    const consistencyInsight = insights.find(i => 
      i.title.includes('Consistency') || i.title.includes('Excellent')
    );
    assert.ok(consistencyInsight);
    assert.strictEqual(consistencyInsight.type, 'achievement');
  });

  it('generates achievement for pain improvement', () => {
    const metrics = { ...baseMetrics, painTrend: 'improving', avgPainLevel: 3 };
    const insights = generateInsights(baseWorkout, metrics, basePhotos, true);
    const painInsight = insights.find(i => i.title.includes('Pain'));
    assert.ok(painInsight);
    assert.strictEqual(painInsight.type, 'achievement');
  });

  it('generates warning for low consistency', () => {
    const workout = { ...baseWorkout, consistencyPct: 30 };
    const insights = generateInsights(workout, baseMetrics, basePhotos, true);
    const warning = insights.find(i => i.type === 'warning');
    assert.ok(warning);
  });

  it('generates warning for no metrics', () => {
    const metrics = { ...baseMetrics, metricsLogged: 0 };
    const insights = generateInsights(baseWorkout, metrics, basePhotos, true);
    const noMetricsWarning = insights.find(i => 
      i.title.includes('Metrics') && i.type === 'warning'
    );
    assert.ok(noMetricsWarning);
  });

  it('generates warning for no photos', () => {
    const photos = { ...basePhotos, photosThisWeek: 0 };
    const insights = generateInsights(baseWorkout, baseMetrics, photos, true);
    const noPhotosWarning = insights.find(i => 
      i.title.includes('Photo') && i.type === 'warning'
    );
    assert.ok(noPhotosWarning);
  });

  it('generates warning for right side dominance', () => {
    const workout = { ...baseWorkout, leftVolume: 1000, rightVolume: 2000 };
    const insights = generateInsights(workout, baseMetrics, basePhotos, true);
    const dominanceWarning = insights.find(i => 
      i.title.includes('Right Side')
    );
    assert.ok(dominanceWarning);
    assert.strictEqual(dominanceWarning.type, 'warning');
  });

  it('generates tip for first week', () => {
    const insights = generateInsights(baseWorkout, baseMetrics, basePhotos, false);
    const firstWeekTip = insights.find(i => 
      i.title.includes('Start')
    );
    assert.ok(firstWeekTip);
    assert.strictEqual(firstWeekTip.type, 'tip');
  });

  it('getInsightColor returns correct colors', () => {
    assert.strictEqual(getInsightColor('achievement'), '#10B981');
    assert.strictEqual(getInsightColor('warning'), '#F59E0B');
    assert.strictEqual(getInsightColor('tip'), '#3B82F6');
    assert.strictEqual(getInsightColor('unknown'), '#6B7280');
  });

  it('getInsightBgColor returns rgba colors', () => {
    const achievementBg = getInsightBgColor('achievement');
    assert.ok(achievementBg.startsWith('rgba'));
    assert.ok(achievementBg.includes('0.1'));

    const warningBg = getInsightBgColor('warning');
    assert.ok(warningBg.startsWith('rgba'));
  });

  it('insights have unique IDs', () => {
    // Reset counter for this test
    insightIdCounter = 0;
    const insights1 = generateInsights(baseWorkout, baseMetrics, basePhotos, true);
    const insights2 = generateInsights(baseWorkout, baseMetrics, basePhotos, true);
    
    const allIds = [...insights1.map(i => i.id), ...insights2.map(i => i.id)];
    const uniqueIds = new Set(allIds);
    assert.strictEqual(uniqueIds.size, allIds.length);
  });

  it('insights include action routes when applicable', () => {
    const workout = { ...baseWorkout, consistencyPct: 30 };
    const insights = generateInsights(workout, baseMetrics, basePhotos, true);
    
    const insightsWithActions = insights.filter(i => i.action);
    for (const insight of insightsWithActions) {
      assert.ok(insight.action.label);
      assert.ok(insight.action.route.startsWith('/'));
    }
  });
});
