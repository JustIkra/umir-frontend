import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { formatInstant, formatOffset } from '../../src/presentation/ui/time.ts';

const moment = Date.UTC(2026, 9, 10, 12, 22, 10);

test('instants are shown in the organization time zone', () => {
  assert.equal(
    formatInstant(moment, 'Europe/Moscow', 'dateTime'),
    '10.10.2026, 15:22',
  );
  assert.equal(
    formatInstant(moment, 'Asia/Yekaterinburg', 'dateTime'),
    '10.10.2026, 17:22',
  );
  assert.equal(formatInstant(moment, 'Europe/Moscow', 'date'), '10.10.2026');
  assert.equal(formatInstant(moment, 'Europe/Moscow', 'time'), '15:22');
  assert.equal(
    formatInstant(moment, 'Europe/Moscow', 'timeSeconds'),
    '15:22:10',
  );
});

test('the offset is named the way the screens write it', () => {
  assert.equal(formatOffset(moment, 'Europe/Moscow'), 'UTC+3');
  assert.equal(formatOffset(moment, 'Asia/Yekaterinburg'), 'UTC+5');
  assert.equal(formatOffset(moment, 'Asia/Kolkata'), 'UTC+5:30');
  assert.equal(formatOffset(moment, 'UTC'), 'UTC');
});
