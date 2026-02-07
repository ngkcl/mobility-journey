const { test } = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { buildTemplateSet, getTemplateSetCount } = require('./templates');

test('getTemplateSetCount falls back to 1 when sets missing', () => {
  assert.equal(getTemplateSetCount({ sets: null }), 1);
  assert.equal(getTemplateSetCount({ sets: 0 }), 1);
});

test('getTemplateSetCount uses provided sets', () => {
  assert.equal(getTemplateSetCount({ sets: 3 }), 3);
});

test('buildTemplateSet uses template values with fallback side', () => {
  const set = buildTemplateSet(
    { reps: 10, duration: null, side: null },
    'left',
  );
  assert.equal(set.reps, 10);
  assert.equal(set.duration_seconds, null);
  assert.equal(set.side, 'left');
  assert.equal(set.weight_kg, null);
});
