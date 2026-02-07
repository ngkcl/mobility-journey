const DEFAULT_MAX_ENTRIES = 14;

/**
 * @typedef {Object} MetricConfig
 * @property {string} key
 * @property {boolean} lowerIsBetter
 * @property {number} minChange
 */

/** @type {MetricConfig[]} */
export const METRIC_CONFIGS = [
  { key: 'pain_level', lowerIsBetter: true, minChange: 0.5 },
  { key: 'posture_score', lowerIsBetter: false, minChange: 0.5 },
  { key: 'symmetry_score', lowerIsBetter: false, minChange: 0.5 },
  { key: 'energy_level', lowerIsBetter: false, minChange: 0.5 },
  { key: 'exercise_minutes', lowerIsBetter: false, minChange: 5 },
  { key: 'rom_forward_bend', lowerIsBetter: false, minChange: 2 },
  { key: 'rom_lateral', lowerIsBetter: false, minChange: 2 },
];

const round = (value, digits = 2) => {
  if (value === null || value === undefined) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * @param {{date: string, value: number}[]} points
 * @param {MetricConfig} config
 */
export function computeTrend(points, config) {
  if (!points || points.length < 4) return null;

  const windowSize = Math.max(2, Math.min(3, Math.floor(points.length / 2)));
  const values = points.map((point) => point.value);
  const startAvg = average(values.slice(0, windowSize));
  const endAvg = average(values.slice(-windowSize));
  const change = endAvg - startAvg;
  const changePercent = startAvg ? (change / startAvg) * 100 : null;

  let trend = 'stable';
  if (Math.abs(change) >= config.minChange) {
    if (config.lowerIsBetter) {
      trend = change < 0 ? 'improving' : 'worsening';
    } else {
      trend = change > 0 ? 'improving' : 'worsening';
    }
  }

  return {
    metric_key: config.key,
    trend,
    change_value: round(change),
    change_percent: round(changePercent),
    start_avg: round(startAvg),
    end_avg: round(endAvg),
    window_start: points[0].date,
    window_end: points[points.length - 1].date,
    sample_size: points.length,
    lower_is_better: config.lowerIsBetter,
  };
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {MetricConfig[]} configs
 * @param {{ maxEntries?: number }} [options]
 */
export function analyzeMetricTrends(rows, configs = METRIC_CONFIGS, options = {}) {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;

  return configs
    .map((config) => {
      const points = rows
        .map((row) => ({
          date: String(row.entry_date),
          value: row[config.key],
        }))
        .filter((point) => typeof point.value === 'number');

      if (points.length < 4) return null;

      const trimmed = points.slice(-maxEntries);
      return computeTrend(trimmed, config);
    })
    .filter(Boolean);
}
