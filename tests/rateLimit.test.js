import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '../src/lib/rateLimit.js';

function withMockedNow(times, fn) {
  const original = Date.now;
  let index = 0;
  Date.now = () => times[Math.min(index, times.length - 1)];
  const advance = () => {
    index += 1;
  };

  try {
    fn(advance);
  } finally {
    Date.now = original;
  }
}

test('rateLimit allows up to max within window', () => {
  withMockedNow([0, 0, 0, 0], (advance) => {
    const first = rateLimit('test:limit', { windowMs: 1000, max: 2 });
    assert.equal(first.allowed, true);
    advance();

    const second = rateLimit('test:limit', { windowMs: 1000, max: 2 });
    assert.equal(second.allowed, true);
    advance();

    const third = rateLimit('test:limit', { windowMs: 1000, max: 2 });
    assert.equal(third.allowed, false);
  });
});

test('rateLimit resets after window', () => {
  withMockedNow([0, 0, 1500], (advance) => {
    const first = rateLimit('test:reset', { windowMs: 1000, max: 1 });
    assert.equal(first.allowed, true);
    advance();

    const second = rateLimit('test:reset', { windowMs: 1000, max: 1 });
    assert.equal(second.allowed, false);
    advance();

    const third = rateLimit('test:reset', { windowMs: 1000, max: 1 });
    assert.equal(third.allowed, true);
  });
});
