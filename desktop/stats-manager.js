const fs = require('fs');
const path = require('path');
const os = require('os');

class StatsManager {
  constructor() {
    this.dataDir = path.join(os.homedir(), '.posture-data');
    this.statsFilePath = path.join(this.dataDir, 'stats.json');
    this.ensureDataDir();
    this.loadStats();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  loadStats() {
    try {
      if (fs.existsSync(this.statsFilePath)) {
        const data = fs.readFileSync(this.statsFilePath, 'utf8');
        this.stats = JSON.parse(data);
      } else {
        this.stats = this.getDefaultStats();
        this.saveStats();
      }
    } catch (error) {
      console.error('Error loading stats:', error);
      this.stats = this.getDefaultStats();
    }
  }

  getDefaultStats() {
    return {
      dailyScores: {},
      slouchEvents: [],
      calibrationHistory: [],
      metricsHistory: [],
      adaptiveThresholds: null,
      bestStreak: 0,
      currentStreak: 0,
      lastActiveDate: null
    };
  }

  saveStats() {
    try {
      fs.writeFileSync(this.statsFilePath, JSON.stringify(this.stats, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving stats:', error);
    }
  }

  getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  initTodayIfNeeded() {
    const today = this.getTodayKey();
    if (!this.stats.dailyScores[today]) {
      this.stats.dailyScores[today] = {
        goodPostureSamples: 0,
        totalSamples: 0,
        slouchCount: 0,
        startTime: Date.now()
      };
    }
    return today;
  }

  recordPostureState(state, metrics = null) {
    const today = this.initTodayIfNeeded();
    const dailyStats = this.stats.dailyScores[today];

    dailyStats.totalSamples++;
    if (state === 'good' || state === 'GOOD_POSTURE') {
      dailyStats.goodPostureSamples++;
    }

    // Store detailed metrics for adaptive learning
    if (metrics) {
      this.recordMetrics(metrics);
    }

    this.saveStats();
  }

  recordMetrics(metrics) {
    if (!this.stats.metricsHistory) {
      this.stats.metricsHistory = [];
    }

    this.stats.metricsHistory.push({
      timestamp: Date.now(),
      date: this.getTodayKey(),
      ...metrics
    });

    // Keep only last 10000 metrics (roughly 7 days of data at 1.5s intervals)
    if (this.stats.metricsHistory.length > 10000) {
      this.stats.metricsHistory = this.stats.metricsHistory.slice(-10000);
    }
  }

  recordSlouchEvent(eventData) {
    const today = this.initTodayIfNeeded();
    const dailyStats = this.stats.dailyScores[today];

    dailyStats.slouchCount++;

    this.stats.slouchEvents.push({
      timestamp: Date.now(),
      date: today,
      ...eventData
    });

    // Keep only last 1000 events to prevent file bloat
    if (this.stats.slouchEvents.length > 1000) {
      this.stats.slouchEvents = this.stats.slouchEvents.slice(-1000);
    }

    this.saveStats();
  }

  recordCalibration(calibrationData) {
    this.stats.calibrationHistory.push({
      ...calibrationData,
      timestamp: Date.now()
    });

    // Keep only last 50 calibrations
    if (this.stats.calibrationHistory.length > 50) {
      this.stats.calibrationHistory = this.stats.calibrationHistory.slice(-50);
    }

    this.saveStats();
  }

  getTodayStats() {
    const today = this.initTodayIfNeeded();
    const dailyStats = this.stats.dailyScores[today];

    const goodPosturePercent = dailyStats.totalSamples > 0
      ? Math.round((dailyStats.goodPostureSamples / dailyStats.totalSamples) * 100)
      : 0;

    return {
      goodPosturePercent,
      slouchCount: dailyStats.slouchCount,
      totalSamples: dailyStats.totalSamples
    };
  }

  getWeeklyTrend() {
    const dates = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      dates.push(dateKey);
    }

    const weeklyScores = dates.map(dateKey => {
      const dayStats = this.stats.dailyScores[dateKey];
      if (!dayStats || dayStats.totalSamples === 0) {
        return null;
      }
      return Math.round((dayStats.goodPostureSamples / dayStats.totalSamples) * 100);
    });

    // Calculate average of non-null values
    const validScores = weeklyScores.filter(score => score !== null);
    const avgScore = validScores.length > 0
      ? Math.round(validScores.reduce((sum, score) => sum + score, 0) / validScores.length)
      : 0;

    return {
      scores: weeklyScores,
      average: avgScore,
      dates
    };
  }

  updateStreaks() {
    const today = this.getTodayKey();
    const todayStats = this.stats.dailyScores[today];

    if (!todayStats || todayStats.totalSamples === 0) {
      return;
    }

    const todayScore = Math.round((todayStats.goodPostureSamples / todayStats.totalSamples) * 100);

    // Check if today qualifies for streak (>70% good posture)
    if (todayScore >= 70) {
      // Check if yesterday had a streak
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = yesterday.toISOString().split('T')[0];
      const yesterdayStats = this.stats.dailyScores[yesterdayKey];

      if (yesterdayStats && yesterdayStats.totalSamples > 0) {
        const yesterdayScore = Math.round((yesterdayStats.goodPostureSamples / yesterdayStats.totalSamples) * 100);
        if (yesterdayScore >= 70) {
          this.stats.currentStreak++;
        } else {
          this.stats.currentStreak = 1;
        }
      } else if (this.stats.lastActiveDate === yesterdayKey) {
        // Yesterday was active and had good score
        this.stats.currentStreak++;
      } else {
        // Reset streak
        this.stats.currentStreak = 1;
      }

      // Update best streak
      if (this.stats.currentStreak > this.stats.bestStreak) {
        this.stats.bestStreak = this.stats.currentStreak;
      }
    } else {
      this.stats.currentStreak = 0;
    }

    this.stats.lastActiveDate = today;
    this.saveStats();
  }

  getAllStats() {
    this.updateStreaks();
    const todayStats = this.getTodayStats();
    const weeklyTrend = this.getWeeklyTrend();

    return {
      today: todayStats,
      weekly: weeklyTrend,
      currentStreak: this.stats.currentStreak,
      bestStreak: this.stats.bestStreak
    };
  }

  resetStats() {
    this.stats = this.getDefaultStats();
    this.saveStats();
  }

  computeAdaptiveThresholds() {
    if (!this.stats.metricsHistory || this.stats.metricsHistory.length < 100) {
      return null;
    }

    // Get metrics from last 7 days
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentMetrics = this.stats.metricsHistory.filter(m => m.timestamp >= sevenDaysAgo);

    if (recentMetrics.length < 100) {
      return null;
    }

    // Calculate mean and standard deviation for each metric
    const calculateStats = (values) => {
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      return { mean, stdDev };
    };

    const headForwardValues = recentMetrics.map(m => m.headForwardDeltaDeg || 0);
    const shoulderSymmetryValues = recentMetrics.map(m => m.shoulderSymmetryDeltaDeg || 0);
    const backRoundingValues = recentMetrics.map(m => m.backRoundingDeltaDeg || 0);

    const headForwardStats = calculateStats(headForwardValues);
    const shoulderSymmetryStats = calculateStats(shoulderSymmetryValues);
    const backRoundingStats = calculateStats(backRoundingValues);

    // Adaptive thresholds: baseline + (stddev * 1.5)
    const adaptiveThresholds = {
      headForwardThresholdDeg: Math.max(8, Math.min(20, headForwardStats.mean + headForwardStats.stdDev * 1.5)),
      shoulderSymmetryThresholdDeg: Math.max(3, Math.min(10, shoulderSymmetryStats.mean + shoulderSymmetryStats.stdDev * 1.5)),
      backRoundingThresholdDeg: Math.max(10, Math.min(25, backRoundingStats.mean + backRoundingStats.stdDev * 1.5)),
      calculatedAt: Date.now(),
      dataPoints: recentMetrics.length
    };

    this.stats.adaptiveThresholds = adaptiveThresholds;
    this.saveStats();

    return adaptiveThresholds;
  }

  getAdaptiveThresholds() {
    // Recalculate if more than 1 day old or doesn't exist
    if (!this.stats.adaptiveThresholds ||
        (Date.now() - this.stats.adaptiveThresholds.calculatedAt > 24 * 60 * 60 * 1000)) {
      return this.computeAdaptiveThresholds();
    }
    return this.stats.adaptiveThresholds;
  }

  getPostureImprovement() {
    if (!this.stats.metricsHistory || this.stats.metricsHistory.length < 200) {
      return null;
    }

    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentMetrics = this.stats.metricsHistory.filter(m => m.timestamp >= sevenDaysAgo);

    if (recentMetrics.length < 200) {
      return null;
    }

    // Compare first half vs second half of the week
    const midpoint = Math.floor(recentMetrics.length / 2);
    const firstHalf = recentMetrics.slice(0, midpoint);
    const secondHalf = recentMetrics.slice(midpoint);

    const avgScore = (metrics) => {
      const scores = metrics.map(m => m.compositeScore || 0);
      return scores.reduce((sum, s) => sum + s, 0) / scores.length;
    };

    const firstHalfAvg = avgScore(firstHalf);
    const secondHalfAvg = avgScore(secondHalf);

    const improvement = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

    return {
      improvementPercent: Math.round(improvement),
      firstHalfAvg: Math.round(firstHalfAvg),
      secondHalfAvg: Math.round(secondHalfAvg)
    };
  }

  getDetailedDailyStats(dateKey = null) {
    const targetDate = dateKey || this.getTodayKey();
    const dailyStats = this.stats.dailyScores[targetDate];

    if (!dailyStats) {
      return null;
    }

    // Get metrics for this day
    const dayMetrics = (this.stats.metricsHistory || []).filter(m => m.date === targetDate);

    if (dayMetrics.length === 0) {
      return {
        goodPosturePercent: dailyStats.totalSamples > 0
          ? Math.round((dailyStats.goodPostureSamples / dailyStats.totalSamples) * 100)
          : 0,
        slouchCount: dailyStats.slouchCount,
        totalSamples: dailyStats.totalSamples
      };
    }

    // Calculate averages
    const avgCompositeScore = dayMetrics.reduce((sum, m) => sum + (m.compositeScore || 0), 0) / dayMetrics.length;
    const avgHeadForward = dayMetrics.reduce((sum, m) => sum + (m.headForwardDeltaDeg || 0), 0) / dayMetrics.length;
    const avgShoulderSymmetry = dayMetrics.reduce((sum, m) => sum + (m.shoulderSymmetryDeltaDeg || 0), 0) / dayMetrics.length;
    const avgBackRounding = dayMetrics.reduce((sum, m) => sum + (m.backRoundingDeltaDeg || 0), 0) / dayMetrics.length;

    return {
      goodPosturePercent: Math.round(avgCompositeScore),
      slouchCount: dailyStats.slouchCount,
      totalSamples: dailyStats.totalSamples,
      avgHeadForward: Math.round(avgHeadForward * 10) / 10,
      avgShoulderSymmetry: Math.round(avgShoulderSymmetry * 10) / 10,
      avgBackRounding: Math.round(avgBackRounding * 10) / 10
    };
  }
}

module.exports = StatsManager;
