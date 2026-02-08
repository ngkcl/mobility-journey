// Dashboard Analytics Logic
let trendChart = null;
let updateInterval = null;

// Initialize dashboard
async function initDashboard() {
  console.log('Initializing dashboard...');
  await updateDashboard();
  startRealTimeUpdates();
  setupCharts();
}

// Start real-time updates (every 5 seconds when visible)
function startRealTimeUpdates() {
  updateInterval = setInterval(async () => {
    await updateDashboard();
  }, 5000);
}

// Update all dashboard components
async function updateDashboard() {
  try {
    const stats = await window.dashboardAPI.getStats();
    console.log('Received stats:', stats);

    // Update gauge and stats
    updateGauge(stats.today.goodPosturePercent);
    updateStats(stats);
    updateHeatmap(stats);
    updateComparison(stats);
    updateTrendChart(stats.weekly);
    updateTimeline(stats);
  } catch (error) {
    console.error('Error updating dashboard:', error);
  }
}

// Update animated gauge
function updateGauge(score) {
  const gaugeProgress = document.getElementById('gaugeProgress');
  const gaugeValue = document.getElementById('gaugeValue');

  if (!gaugeProgress || !gaugeValue) return;

  // Animate gauge
  const circumference = 2 * Math.PI * 85; // radius = 85
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  gaugeProgress.style.strokeDashoffset = offset;

  // Update color based on score
  if (score >= 80) {
    gaugeProgress.style.stroke = '#14b8a6'; // teal
  } else if (score >= 60) {
    gaugeProgress.style.stroke = '#eab308'; // yellow
  } else if (score >= 40) {
    gaugeProgress.style.stroke = '#f59e0b'; // orange
  } else {
    gaugeProgress.style.stroke = '#ef4444'; // red
  }

  // Animate number
  animateNumber(gaugeValue, parseInt(gaugeValue.textContent) || 0, score, 800);
}

// Update stats cards
function updateStats(stats) {
  const slouchCount = document.getElementById('slouchCount');
  const totalSamples = document.getElementById('totalSamples');

  if (slouchCount) {
    animateNumber(slouchCount, parseInt(slouchCount.textContent) || 0, stats.today.slouchCount, 500);
  }
  if (totalSamples) {
    animateNumber(totalSamples, parseInt(totalSamples.textContent) || 0, stats.today.totalSamples, 500);
  }
}

// Update hourly heatmap
function updateHeatmap(stats) {
  const heatmapGrid = document.getElementById('heatmapGrid');
  if (!heatmapGrid) return;

  // Clear existing cells
  heatmapGrid.innerHTML = '';

  // Get hourly data from slouch events
  const hourlyData = Array(24).fill(null).map(() => ({
    samples: 0,
    goodSamples: 0
  }));

  // If we have slouch events, process them
  if (stats.slouchEvents && stats.slouchEvents.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const todayEvents = stats.slouchEvents.filter(event => event.date === today);

    // Count slouches per hour
    todayEvents.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      hourlyData[hour].samples++;
    });
  }

  // Estimate good samples per hour based on today's total
  const avgSamplesPerHour = stats.today.totalSamples / 24;
  const goodPostureRatio = stats.today.goodPosturePercent / 100;

  for (let hour = 0; hour < 24; hour++) {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';

    // Calculate score for this hour
    let level = 0;
    const currentHour = new Date().getHours();

    if (hour <= currentHour && stats.today.totalSamples > 0) {
      const slouchesThisHour = hourlyData[hour].samples;
      const estimatedSamples = avgSamplesPerHour;

      if (estimatedSamples > 0) {
        const hourScore = Math.max(0, ((estimatedSamples - slouchesThisHour * 5) / estimatedSamples) * 100);

        if (hourScore >= 90) level = 4; // Excellent
        else if (hourScore >= 70) level = 3; // Good
        else if (hourScore >= 50) level = 2; // Fair
        else if (hourScore >= 30) level = 1; // Poor
        else level = 1; // Poor
      }
    }

    cell.setAttribute('data-level', level);
    cell.setAttribute('title', `Hour ${hour}:00 - ${level === 0 ? 'No data' : 'Score: ' + (level * 25) + '%'}`);
    heatmapGrid.appendChild(cell);
  }
}

// Update comparison cards
function updateComparison(stats) {
  const todayScore = document.getElementById('todayScore');
  const todayChange = document.getElementById('todayChange');
  const yesterdayScore = document.getElementById('yesterdayScore');
  const weeklyAverage = document.getElementById('weeklyAverage');

  if (todayScore) {
    todayScore.textContent = stats.today.goodPosturePercent + '%';
  }

  // Get yesterday's score
  const yesterdayValue = stats.weekly.scores[stats.weekly.scores.length - 2];
  if (yesterdayScore) {
    yesterdayScore.textContent = yesterdayValue !== null ? yesterdayValue + '%' : '—';
  }

  // Calculate change from yesterday
  if (todayChange && yesterdayValue !== null) {
    const change = stats.today.goodPosturePercent - yesterdayValue;
    const changeText = change > 0 ? `+${change}%` : `${change}%`;
    const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '—';

    todayChange.textContent = `${arrow} ${Math.abs(change)}% vs yesterday`;
    todayChange.className = 'comparison-change ' + (change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral');
  }

  // Weekly average
  if (weeklyAverage) {
    weeklyAverage.textContent = stats.weekly.average + '%';
  }
}

// Setup and update trend chart
function setupCharts() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Posture Score',
        data: [],
        borderColor: '#14b8a6',
        backgroundColor: 'rgba(20, 184, 166, 0.1)',
        tension: 0.4,
        fill: true,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointBackgroundColor: '#14b8a6',
        pointBorderColor: '#0b1020',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#131b2e',
          borderColor: '#14b8a6',
          borderWidth: 1,
          titleColor: '#e5e7eb',
          bodyColor: '#e5e7eb',
          padding: 12,
          displayColors: false,
          callbacks: {
            label: function(context) {
              return context.parsed.y !== null ? context.parsed.y + '% good posture' : 'No data';
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: '#1f2937',
            drawBorder: false
          },
          ticks: {
            color: '#9ca3af',
            callback: function(value) {
              return value + '%';
            }
          }
        },
        x: {
          grid: {
            color: '#1f2937',
            drawBorder: false
          },
          ticks: {
            color: '#9ca3af'
          }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    }
  });
}

// Update trend chart data
function updateTrendChart(weeklyData) {
  if (!trendChart || !weeklyData) return;

  const labels = weeklyData.dates.map(date => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  });

  // Replace null values with 0 for display, but keep null in dataset
  const scores = weeklyData.scores.map(score => score === null ? 0 : score);

  trendChart.data.labels = labels;
  trendChart.data.datasets[0].data = scores;
  trendChart.update('none'); // Update without animation for real-time feel
}

// Update slouch events timeline
function updateTimeline(stats) {
  const timeline = document.getElementById('timeline');
  if (!timeline) return;

  // Get today's slouch events
  const today = new Date().toISOString().split('T')[0];
  const todayEvents = stats.slouchEvents
    ? stats.slouchEvents
        .filter(event => event.date === today)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20) // Show last 20 events
    : [];

  if (todayEvents.length === 0) {
    timeline.innerHTML = '<div class="empty-state">No slouch events recorded today</div>';
    return;
  }

  timeline.innerHTML = todayEvents.map(event => {
    const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="timeline-time">${time}</div>
          <div class="timeline-event">Slouch detected - ${event.severity || 'moderate'}</div>
        </div>
      </div>
    `;
  }).join('');
}

// Animate number changes
function animateNumber(element, from, to, duration) {
  const start = Date.now();
  const range = to - from;

  function update() {
    const now = Date.now();
    const progress = Math.min((now - start) / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.round(from + range * easeProgress);

    element.textContent = current;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = to;
    }
  }

  requestAnimationFrame(update);
}

// Cleanup on window close
window.addEventListener('beforeunload', () => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  if (trendChart) {
    trendChart.destroy();
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}
