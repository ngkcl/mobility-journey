const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { normalizeTargetMuscles } = require('./exercises');

test('normalizeTargetMuscles handles empty input', () => {
  assert.deepEqual(normalizeTargetMuscles(), []);
  assert.deepEqual(normalizeTargetMuscles(null), []);
  assert.deepEqual(normalizeTargetMuscles(''), []);
});

test('normalizeTargetMuscles trims and dedupes values', () => {
  const result = normalizeTargetMuscles(' core, glutes , core ,');
  assert.deepEqual(result, ['core', 'glutes']);
});

test('normalizeTargetMuscles accepts arrays', () => {
  const result = normalizeTargetMuscles(['left glute med', 'left glute med', 'core']);
  assert.deepEqual(result, ['left glute med', 'core']);
});
