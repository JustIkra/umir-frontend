import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  countValid,
  isoDateToRu,
  maskTime,
  nearestSlot,
  normalizeTime,
  ruDateToIso,
  sanitizeCount,
  sanitizeQuantity,
  timeOptions,
} from '../../src/presentation/ui/masks.ts';

test('a quantity keeps digits and one comma with three decimals', () => {
  assert.equal(sanitizeQuantity('1 200,5 кг'), '1200,5');
  assert.equal(sanitizeQuantity('12.3456'), '12,345');
  assert.equal(sanitizeQuantity('abc'), '');
  assert.equal(sanitizeQuantity('007'), '7');
  assert.equal(sanitizeQuantity(',5'), '0,5');
  assert.equal(sanitizeQuantity('0,5'), '0,5');
  assert.equal(sanitizeQuantity('1,2,3'), '1,23');
  assert.equal(
    sanitizeQuantity('99999999999999999,999'),
    '99999999999999999,999',
  );
});

test('a count keeps digits without leading zeros', () => {
  assert.equal(sanitizeCount('07 дней'), '7');
  assert.equal(sanitizeCount('-3'), '3');
  assert.equal(sanitizeCount('0'), '0');
  assert.equal(countValid('7'), true);
  assert.equal(countValid('0'), false);
  assert.equal(countValid(''), false);
  assert.equal(countValid('1234567890123456789'), false);
});

test('a time takes digits and puts the colon itself', () => {
  assert.equal(maskTime('1427'), '14:27');
  assert.equal(maskTime('14:2'), '14:2');
  assert.equal(maskTime('9'), '09');
  assert.equal(maskTime('930'), '09:30');
  assert.equal(maskTime('25'), '02:5');
  assert.equal(maskTime('14ч30м'), '14:30');
  assert.equal(maskTime('143059'), '14:30');
});

test('a time is completed on blur or refused', () => {
  assert.equal(normalizeTime(''), '');
  assert.equal(normalizeTime('9'), '09:00');
  assert.equal(normalizeTime('930'), '09:30');
  assert.equal(normalizeTime('14:2'), '14:02');
  assert.equal(normalizeTime('23:59'), '23:59');
  assert.equal(normalizeTime('14:75'), undefined);
});

test('the time list has 48 half hours and finds the nearest', () => {
  assert.equal(timeOptions.length, 48);
  assert.equal(timeOptions[0], '00:00');
  assert.equal(timeOptions[29], '14:30');
  assert.equal(timeOptions.at(-1), '23:30');
  assert.equal(nearestSlot('14:27'), '14:00');
  assert.equal(nearestSlot('14:30'), '14:30');
  assert.equal(nearestSlot(''), '');
});

test('dates convert between the ISO and the Russian form', () => {
  assert.equal(isoDateToRu('2026-10-15'), '15.10.2026');
  assert.equal(ruDateToIso('15.10.2026'), '2026-10-15');
  assert.equal(isoDateToRu(''), '');
  assert.equal(ruDateToIso('15.10'), '');
});
