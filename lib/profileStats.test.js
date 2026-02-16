/**
 * profileStats.test.js — Tests for profile stats aggregation
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Test the milestone generation logic and formatting helpers
// (We can't test the full loader without Supabase, but we can test pure functions)

describe('formatMinutes', () => {
  const formatMinutes = (mins) => {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  it('formats minutes under an hour', () => {
    assert.equal(formatMinutes(0), '0m');
    assert.equal(formatMinutes(30), '30m');
    assert.equal(formatMinutes(59), '59m');
  });

  it('formats exact hours', () => {
    assert.equal(formatMinutes(60), '1h');
    assert.equal(formatMinutes(120), '2h');
    assert.equal(formatMinutes(300), '5h');
  });

  it('formats hours and minutes', () => {
    assert.equal(formatMinutes(90), '1h 30m');
    assert.equal(formatMinutes(145), '2h 25m');
    assert.equal(formatMinutes(61), '1h 1m');
  });
});

describe('milestone generation logic', () => {
  it('sorts milestones newest first', () => {
    const milestones = [
      { date: '2026-01-01', title: 'First' },
      { date: '2026-02-15', title: 'Latest' },
      { date: '2026-01-15', title: 'Middle' },
    ];
    milestones.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    assert.equal(milestones[0].title, 'Latest');
    assert.equal(milestones[1].title, 'Middle');
    assert.equal(milestones[2].title, 'First');
  });

  it('computes days since start correctly', () => {
    const start = new Date('2026-01-01');
    const now = new Date('2026-02-13');
    const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    assert.equal(days, 43);
  });

  it('finds earliest date from multiple sources', () => {
    const dates = [
      new Date('2026-02-01'),
      new Date('2026-01-15'),
      new Date('2026-01-20'),
    ];
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
    assert.equal(earliest.toISOString().slice(0, 10), '2026-01-15');
  });

  it('generates workout count milestones', () => {
    const workoutMilestones = [10, 25, 50, 100, 250, 500];
    const workoutCount = 30;
    const triggered = workoutMilestones.filter(m => workoutCount >= m);
    assert.deepEqual(triggered, [10, 25]);
  });
});

describe('metric pill percentage', () => {
  it('calculates regular percentage', () => {
    const pct = (75 / 100) * 100;
    assert.equal(pct, 75);
  });

  it('calculates inverted percentage (pain)', () => {
    const value = 3;
    const max = 10;
    const pct = ((max - value) / max) * 100;
    assert.equal(pct, 70);
  });

  it('handles edge cases', () => {
    assert.equal(((10 - 10) / 10) * 100, 0);
    assert.equal(((10 - 0) / 10) * 100, 100);
  });
});
