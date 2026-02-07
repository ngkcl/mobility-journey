import { METRIC_CONFIGS } from './trends.js';

/**
 * @typedef {Object} MetricChange
 * @property {string} metric_key
 * @property {string} label
 * @property {number | null} start
 * @property {number | null} end
 * @property {number | null} change
 * @property {string} direction
 * @property {boolean} lower_is_better
 */

/**
 * @typedef {Object} WeeklySummaryInput
 * @property {string} weekStart
 * @property {string} weekEnd
 * @property {MetricChange[]} [metricsChanges]
 * @property {number} [photosTaken]
 * @property {number} [exercisesCompleted]
 * @property {string[]} [aiHighlights]
 */

const METRIC_LABELS = {
  pain_level: 'Pain level',
  posture_score: 'Posture score',
  symmetry_score: 'Symmetry score',
  energy_level: 'Energy level',
  exercise_minutes: 'Exercise minutes',
  rom_forward_bend: 'Forward bend ROM',
  rom_lateral: 'Lateral ROM',
};

const round = (value, digits = 2) => {
  if (value === null || value === undefined) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {Array<{ key: string, lowerIsBetter: boolean, minChange: number }>} configs
 * @returns {MetricChange[]}
 */
export function computeWeeklyMetricChanges(rows = [], configs = METRIC_CONFIGS) {
  return configs
    .map((config) => {
      const points = rows
        .map((row) => ({
          date: String(row.entry_date),
          value: row[config.key],
        }))
        .filter((point) => typeof point.value === 'number');

      if (points.length === 0) return null;

      const first = points[0];
      const last = points[points.length - 1];
      const changeValue = round(last.value - first.value);

      let direction = 'stable';
      if (changeValue !== 0) {
        if (config.lowerIsBetter) {
          direction = changeValue < 0 ? 'improving' : 'worsening';
        } else {
          direction = changeValue > 0 ? 'improving' : 'worsening';
        }
      }

      return /** @type {MetricChange} */ ({
        metric_key: config.key,
        label: METRIC_LABELS[config.key] ?? config.key,
        start: round(first.value),
        end: round(last.value),
        change: changeValue,
        direction,
        lower_is_better: config.lowerIsBetter,
      });
    })
    .filter(Boolean);
}

/**
 * @param {WeeklySummaryInput} input
 */
export function buildWeeklySummaryFallback({
  weekStart,
  weekEnd,
  metricsChanges = [],
  photosTaken = 0,
  exercisesCompleted = 0,
  aiHighlights = [],
}) {
  const lines = [`Weekly Summary (${weekStart} to ${weekEnd})`];

  lines.push(`- Photos taken: ${photosTaken}`);
  lines.push(`- Exercises completed: ${exercisesCompleted}`);

  if (metricsChanges.length > 0) {
    lines.push('- Metrics changes:');
    metricsChanges.forEach((metric) => {
      lines.push(`  - ${metric.label}: ${metric.start} -> ${metric.end} (${metric.change >= 0 ? '+' : ''}${metric.change})`);
    });
  } else {
    lines.push('- Metrics changes: No metric entries logged this week.');
  }

  if (aiHighlights.length > 0) {
    lines.push('- AI analysis highlights:');
    aiHighlights.forEach((highlight) => {
      lines.push(`  - ${highlight}`);
    });
  } else {
    lines.push('- AI analysis highlights: None recorded.');
  }

  return lines.join('\n');
}

/**
 * @param {WeeklySummaryInput} input
 */
export function buildWeeklySummaryPrompt({
  weekStart,
  weekEnd,
  metricsChanges = [],
  photosTaken = 0,
  exercisesCompleted = 0,
  aiHighlights = [],
}) {
  return `You are a physiotherapy coach writing a weekly progress summary.\n\n` +
    `Week range: ${weekStart} to ${weekEnd}.\n` +
    `Photos taken: ${photosTaken}.\n` +
    `Exercises completed: ${exercisesCompleted}.\n` +
    `Metrics changes: ${JSON.stringify(metricsChanges, null, 2)}\n` +
    `AI analysis highlights: ${JSON.stringify(aiHighlights, null, 2)}\n\n` +
    `Write 4-6 short bullet points. Be factual, mention key changes, and avoid medical advice.`;
}
