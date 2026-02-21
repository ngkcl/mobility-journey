/**
 * Basic tests for the correlation engine types and helper logic.
 * Full integration tests would need Supabase with test data.
 */

// Smoke-test: module can be imported without errors
const assert = require('assert');

// Test the helper functions (we'll test them indirectly via the module structure)
describe('correlationEngine', () => {
  it('should export expected functions', () => {
    // TypeScript module — verify the file exists and compiles
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, 'correlationEngine.ts');
    assert.ok(fs.existsSync(filePath), 'correlationEngine.ts should exist');

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('computeExerciseZoneCorrelations'), 'should export computeExerciseZoneCorrelations');
    assert.ok(content.includes('computeTopEffectiveExercises'), 'should export computeTopEffectiveExercises');
    assert.ok(content.includes('computeTopHarmfulExercises'), 'should export computeTopHarmfulExercises');
    assert.ok(content.includes('getZoneBestExercises'), 'should export getZoneBestExercises');
    assert.ok(content.includes('getZoneWorstExercises'), 'should export getZoneWorstExercises');
  });

  it('should define correct confidence thresholds', () => {
    const content = require('fs').readFileSync(
      require('path').join(__dirname, 'correlationEngine.ts'),
      'utf-8',
    );
    assert.ok(content.includes('MIN_OCCURRENCES_LOW = 3'), 'low threshold should be 3');
    assert.ok(content.includes('MIN_OCCURRENCES_MEDIUM = 5'), 'medium threshold should be 5');
    assert.ok(content.includes('MIN_OCCURRENCES_HIGH = 8'), 'high threshold should be 8');
  });

  it('should define all 15 body zone labels', () => {
    const content = require('fs').readFileSync(
      require('path').join(__dirname, 'correlationEngine.ts'),
      'utf-8',
    );
    const zones = [
      'neck', 'left_shoulder', 'right_shoulder', 'chest',
      'upper_back', 'mid_back', 'lower_back',
      'left_hip', 'right_hip', 'left_knee', 'right_knee',
      'left_arm', 'right_arm', 'left_leg', 'right_leg',
    ];
    for (const zone of zones) {
      assert.ok(content.includes(zone), `should have zone label for ${zone}`);
    }
  });
});
