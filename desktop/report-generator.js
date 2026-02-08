const fs = require('fs');
const path = require('path');
const os = require('os');

class ReportGenerator {
  constructor(statsManager) {
    this.statsManager = statsManager;
    this.reportsDir = path.join(os.homedir(), '.posture-data', 'reports');
    this.weeklyReportsDir = path.join(this.reportsDir, 'weekly');
    this.ensureReportDirs();
  }

  ensureReportDirs() {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
    if (!fs.existsSync(this.weeklyReportsDir)) {
      fs.mkdirSync(this.weeklyReportsDir, { recursive: true });
    }
  }

  getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  getProblemAreas(detailedStats) {
    const problems = [];

    if (detailedStats.avgHeadForward > 12) {
      problems.push({
        area: 'Forward Head Posture',
        severity: detailedStats.avgHeadForward > 20 ? 'high' : 'moderate',
        value: detailedStats.avgHeadForward
      });
    }

    if (detailedStats.avgShoulderSymmetry > 5) {
      problems.push({
        area: 'Shoulder Imbalance',
        severity: detailedStats.avgShoulderSymmetry > 8 ? 'high' : 'moderate',
        value: detailedStats.avgShoulderSymmetry
      });
    }

    if (detailedStats.avgBackRounding > 15) {
      problems.push({
        area: 'Upper Back Rounding',
        severity: detailedStats.avgBackRounding > 20 ? 'high' : 'moderate',
        value: detailedStats.avgBackRounding
      });
    }

    return problems;
  }

  getTips(problems) {
    const tips = [];

    const hasForwardHead = problems.some(p => p.area === 'Forward Head Posture');
    const hasShoulderImbalance = problems.some(p => p.area === 'Shoulder Imbalance');
    const hasBackRounding = problems.some(p => p.area === 'Upper Back Rounding');

    if (hasForwardHead) {
      tips.push('Keep your monitor at eye level to reduce forward head posture');
      tips.push('Practice chin tucks: gently pull your chin back to align your head over your shoulders');
    }

    if (hasShoulderImbalance) {
      tips.push('Check your desk setup - ensure your keyboard and mouse are at equal heights');
      tips.push('Perform shoulder rolls and stretches throughout the day');
    }

    if (hasBackRounding) {
      tips.push('Sit back in your chair with your back fully supported');
      tips.push('Take regular breaks to stand and stretch your chest and shoulders');
    }

    if (tips.length === 0) {
      tips.push('Great work! Keep maintaining your current posture habits');
      tips.push('Continue taking regular breaks and staying aware of your posture');
    }

    return tips;
  }

  generateDailyReport(dateKey = null) {
    const targetDate = dateKey || this.statsManager.getTodayKey();
    const detailedStats = this.statsManager.getDetailedDailyStats(targetDate);

    if (!detailedStats || detailedStats.totalSamples === 0) {
      console.log(`No data available for ${targetDate}`);
      return null;
    }

    const score = detailedStats.goodPosturePercent;
    const grade = this.getGrade(score);
    const problems = this.getProblemAreas(detailedStats);
    const tips = this.getTips(problems);

    // Get yesterday's stats for comparison
    const yesterday = new Date(targetDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split('T')[0];
    const yesterdayStats = this.statsManager.getDetailedDailyStats(yesterdayKey);

    let comparison = 'No previous day data available';
    if (yesterdayStats && yesterdayStats.totalSamples > 0) {
      const diff = score - yesterdayStats.goodPosturePercent;
      if (diff > 0) {
        comparison = `Improved by ${diff}% compared to yesterday`;
      } else if (diff < 0) {
        comparison = `Decreased by ${Math.abs(diff)}% compared to yesterday`;
      } else {
        comparison = `Same as yesterday`;
      }
    }

    // Generate markdown report
    const report = `# Daily Posture Report
**Date:** ${targetDate}

## Summary
Your posture score for today is **${score}%** (Grade: **${grade}**)

You had **${detailedStats.slouchCount}** slouching episodes detected throughout the day.

## Detailed Metrics
- **Total Samples:** ${detailedStats.totalSamples}
- **Average Head Forward:** ${detailedStats.avgHeadForward}°
- **Average Shoulder Imbalance:** ${detailedStats.avgShoulderSymmetry}°
- **Average Back Rounding:** ${detailedStats.avgBackRounding}°

## Problem Areas
${problems.length > 0 ? problems.map(p => `- **${p.area}** (${p.severity} severity): ${p.value.toFixed(1)}°`).join('\n') : 'No significant problems detected - excellent posture!'}

## Improvement Tips
${tips.map((tip, i) => `${i + 1}. ${tip}`).join('\n')}

## Comparison
${comparison}

---
*Report generated on ${new Date().toISOString()}*
`;

    // Save report
    const reportPath = path.join(this.reportsDir, `${targetDate}.md`);
    fs.writeFileSync(reportPath, report, 'utf8');
    console.log(`Daily report saved to ${reportPath}`);

    return reportPath;
  }

  generateWeeklyReport() {
    const today = new Date();
    const weekNumber = this.getWeekNumber(today);
    const year = today.getFullYear();

    // Get last 7 days of stats
    const weeklyStats = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const stats = this.statsManager.getDetailedDailyStats(dateKey);
      weeklyStats.push({
        date: dateKey,
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        stats: stats
      });
    }

    // Calculate weekly averages
    const validDays = weeklyStats.filter(d => d.stats && d.stats.totalSamples > 0);
    if (validDays.length === 0) {
      console.log('No data available for weekly report');
      return null;
    }

    const avgScore = Math.round(
      validDays.reduce((sum, d) => sum + d.stats.goodPosturePercent, 0) / validDays.length
    );
    const totalSlouchCount = validDays.reduce((sum, d) => sum + d.stats.slouchCount, 0);
    const grade = this.getGrade(avgScore);

    // Get improvement stats
    const improvement = this.statsManager.getPostureImprovement();
    const improvementText = improvement
      ? improvement.improvementPercent > 0
        ? `improved by ${improvement.improvementPercent}%`
        : improvement.improvementPercent < 0
        ? `decreased by ${Math.abs(improvement.improvementPercent)}%`
        : `remained stable`
      : 'insufficient data for comparison';

    // Generate ASCII chart
    const maxHeight = 15;
    const chartLines = [];
    for (let row = maxHeight; row >= 0; row--) {
      let line = `${(row * 100 / maxHeight).toFixed(0).padStart(3)}% |`;
      for (const day of weeklyStats) {
        const score = day.stats && day.stats.totalSamples > 0 ? day.stats.goodPosturePercent : 0;
        const height = Math.round((score / 100) * maxHeight);
        line += height >= row ? ' ███' : '    ';
      }
      chartLines.push(line);
    }
    const chartFooter = '     ' + '-'.repeat(5 * weeklyStats.length);
    const chartLabels = '      ' + weeklyStats.map(d => d.dayName.padEnd(4)).join(' ');

    // Generate HTML report
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Posture Report - Week ${weekNumber}, ${year}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
    }
    h2 {
      color: #34495e;
      margin-top: 30px;
    }
    .summary-box {
      background-color: #ecf0f1;
      padding: 20px;
      border-radius: 5px;
      margin: 20px 0;
    }
    .grade {
      font-size: 48px;
      font-weight: bold;
      color: ${grade === 'A' ? '#27ae60' : grade === 'B' ? '#2ecc71' : grade === 'C' ? '#f39c12' : grade === 'D' ? '#e67e22' : '#e74c3c'};
    }
    .chart {
      background-color: #2c3e50;
      color: #ecf0f1;
      padding: 20px;
      border-radius: 5px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      overflow-x: auto;
      white-space: pre;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .stat-card {
      background-color: #3498db;
      color: white;
      padding: 20px;
      border-radius: 5px;
      text-align: center;
    }
    .stat-value {
      font-size: 32px;
      font-weight: bold;
    }
    .stat-label {
      font-size: 14px;
      opacity: 0.9;
    }
    .daily-breakdown {
      margin: 20px 0;
    }
    .day-row {
      display: flex;
      justify-content: space-between;
      padding: 10px;
      border-bottom: 1px solid #ecf0f1;
    }
    .day-row:nth-child(even) {
      background-color: #f9f9f9;
    }
    footer {
      margin-top: 40px;
      text-align: center;
      color: #7f8c8d;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Weekly Posture Report</h1>
    <p><strong>Week ${weekNumber}, ${year}</strong> | ${weeklyStats[0].date} to ${weeklyStats[weeklyStats.length - 1].date}</p>

    <div class="summary-box">
      <h2>Overall Performance</h2>
      <div class="grade">Grade: ${grade}</div>
      <p style="font-size: 18px;">Average Score: <strong>${avgScore}%</strong></p>
      <p>Your posture ${improvementText} this week.</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${validDays.length}</div>
        <div class="stat-label">Active Days</div>
      </div>
      <div class="stat-card" style="background-color: #e74c3c;">
        <div class="stat-value">${totalSlouchCount}</div>
        <div class="stat-label">Total Slouches</div>
      </div>
      <div class="stat-card" style="background-color: #27ae60;">
        <div class="stat-value">${Math.round(totalSlouchCount / validDays.length)}</div>
        <div class="stat-label">Avg Slouches/Day</div>
      </div>
    </div>

    <h2>Weekly Trend</h2>
    <div class="chart">${chartLines.join('\n')}
${chartFooter}
${chartLabels}</div>

    <h2>Daily Breakdown</h2>
    <div class="daily-breakdown">
      ${weeklyStats.map(day => {
        if (!day.stats || day.stats.totalSamples === 0) {
          return `<div class="day-row">
            <span><strong>${day.dayName} (${day.date})</strong></span>
            <span style="color: #95a5a6;">No data</span>
          </div>`;
        }
        return `<div class="day-row">
          <span><strong>${day.dayName} (${day.date})</strong></span>
          <span>Score: ${day.stats.goodPosturePercent}% | Slouches: ${day.stats.slouchCount}</span>
        </div>`;
      }).join('')}
    </div>

    <h2>Key Insights</h2>
    <ul>
      <li>You maintained good posture for an average of <strong>${avgScore}%</strong> of your monitored time</li>
      <li>Total of <strong>${totalSlouchCount}</strong> slouching episodes detected this week</li>
      ${improvement ? `<li>Your posture ${improvementText} compared to the first half of the week</li>` : ''}
      <li>Keep up the good work and remember to take regular breaks!</li>
    </ul>

    <footer>
      <p>Report generated on ${new Date().toLocaleString()}</p>
      <p>Posture Monitor - Keep your back healthy!</p>
    </footer>
  </div>
</body>
</html>
`;

    // Save report
    const reportPath = path.join(this.weeklyReportsDir, `${year}-W${weekNumber.toString().padStart(2, '0')}.html`);
    fs.writeFileSync(reportPath, html, 'utf8');
    console.log(`Weekly report saved to ${reportPath}`);

    return reportPath;
  }

  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  scheduleDailyReport() {
    // Schedule for 11:59 PM
    const scheduleNext = () => {
      const now = new Date();
      const target = new Date(now);
      target.setHours(23, 59, 0, 0);

      // If it's already past 11:59 PM, schedule for tomorrow
      if (now >= target) {
        target.setDate(target.getDate() + 1);
      }

      const msUntilTarget = target.getTime() - now.getTime();

      setTimeout(() => {
        this.generateDailyReport();
        scheduleNext(); // Schedule next day
      }, msUntilTarget);

      console.log(`Daily report scheduled for ${target.toLocaleString()}`);
    };

    scheduleNext();
  }

  scheduleWeeklyReport() {
    // Schedule for Sunday at 11:59 PM
    const scheduleNext = () => {
      const now = new Date();
      const target = new Date(now);

      // Calculate days until next Sunday
      const daysUntilSunday = (7 - now.getDay()) % 7;
      target.setDate(target.getDate() + daysUntilSunday);
      target.setHours(23, 59, 0, 0);

      // If it's Sunday and already past 11:59 PM, schedule for next Sunday
      if (daysUntilSunday === 0 && now >= target) {
        target.setDate(target.getDate() + 7);
      }

      const msUntilTarget = target.getTime() - now.getTime();

      setTimeout(() => {
        this.generateWeeklyReport();
        scheduleNext(); // Schedule next week
      }, msUntilTarget);

      console.log(`Weekly report scheduled for ${target.toLocaleString()}`);
    };

    scheduleNext();
  }
}

module.exports = ReportGenerator;
