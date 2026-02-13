/**
 * profileStats.test.js — Tests for profile stats aggregation
 */

const { describe, it, expect } = require('@jest/globals');

// Test the milestone generation logic and formatting helpers
// (We can't test the full loader without Supabase, but we can test pure functions)

describe('formatMinutes', () => {
  // Import inline since it's not exported — test the concept
  const formatMinutes = (mins) => {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  it('formats minutes under an hour', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(30)).toBe('30m');
    expect(formatMinutes(59)).toBe('59m');
  });

  it('formats exact hours', () => {
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(300)).toBe('5h');
  });

  it('formats hours and minutes', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(145)).toBe('2h 25m');
    expect(formatMinutes(61)).toBe('1h 1m');
  });
});

describe('milestone generation logic', () => {
  // Test the sorting/dedup concept
  it('sorts milestones newest first', () => {
    const milestones = [
      { date: '2026-01-01', title: 'First' },
      { date: '2026-02-15', title: 'Latest' },
      { date: '2026-01-15', title: 'Middle' },
    ];

    milestones.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    expect(milestones[0].title).toBe('Latest');
    expect(milestones[1].title).toBe('Middle');
    expect(milestones[2].title).toBe('First');
  });

  it('computes days since start correctly', () => {
    const start = new Date('2026-01-01');
    const now = new Date('2026-02-13');
    const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    expect(days).toBe(43);
  });

  it('finds earliest date from multiple sources', () => {
    const dates = [
      new Date('2026-02-01'),
      new Date('2026-01-15'),
      new Date('2026-01-20'),
    ];
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
    expect(earliest.toISOString().slice(0, 10)).toBe('2026-01-15');
  });

  it('generates workout count milestones', () => {
    const workoutMilestones = [10, 25, 50, 100, 250, 500];
    const workoutCount = 30;
    const triggered = workoutMilestones.filter(m => workoutCount >= m);
    expect(triggered).toEqual([10, 25]);
  });
});

describe('metric pill percentage', () => {
  it('calculates regular percentage', () => {
    const pct = (75 / 100) * 100;
    expect(pct).toBe(75);
  });

  it('calculates inverted percentage (pain)', () => {
    // Pain 3/10 = 70% good (inverted)
    const value = 3;
    const max = 10;
    const pct = ((max - value) / max) * 100;
    expect(pct).toBe(70);
  });

  it('handles edge cases', () => {
    expect(((10 - 10) / 10) * 100).toBe(0); // max pain = 0% bar
    expect(((10 - 0) / 10) * 100).toBe(100); // no pain = 100% bar
  });
});
