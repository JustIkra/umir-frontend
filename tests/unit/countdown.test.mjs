import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  formatCountdown,
  secondsLeft,
} from '../../src/presentation/ui/countdown.ts';

test('a countdown shows minutes and two-digit seconds, rounded up', () => {
  assert.equal(formatCountdown(59_000), '0:59');
  assert.equal(formatCountdown(58_001), '0:59');
  assert.equal(formatCountdown(60_000), '1:00');
  assert.equal(formatCountdown(1), '0:01');
  assert.equal(formatCountdown(0), '0:00');
  assert.equal(formatCountdown(-5_000), '0:00');
});

test('secondsLeft never goes below zero', () => {
  assert.equal(secondsLeft(45_000, 0), 45);
  assert.equal(secondsLeft(45_000, 44_001), 1);
  assert.equal(secondsLeft(45_000, 45_000), 0);
  assert.equal(secondsLeft(45_000, 90_000), 0);
});
