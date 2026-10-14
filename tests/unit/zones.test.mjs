import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { listText, plural } from '../../src/presentation/ui/plural.ts';
import { matchesQuery } from '../../src/presentation/ui/search.ts';
import {
  formatSectionDate,
  formatStamp,
  zoneLabel,
} from '../../src/presentation/ui/zones.ts';
import { NOW } from './support/render-route.mjs';

test('the section date names the weekday, the date and the zone', () => {
  assert.equal(
    formatSectionDate(NOW, 'Europe/Moscow'),
    'Среда, 14 октября 2026 · Москва, UTC+3',
  );
  assert.equal(
    formatSectionDate(NOW, 'Europe/Berlin'),
    'Среда, 14 октября 2026 · Берлин, UTC+2',
  );
});

test('a zone without a Russian name keeps its IANA id', () => {
  assert.equal(zoneLabel('Asia/Tokyo', NOW), 'Asia/Tokyo, UTC+9');
  assert.equal(zoneLabel('Asia/Yekaterinburg', NOW), 'Екатеринбург, UTC+5');
});

test('a stamp shows the date and time with seconds in the zone', () => {
  assert.equal(formatStamp(NOW, 'Europe/Moscow'), '14.10.2026, 10:00:00 UTC+3');
});

test('a search matches any value, ignoring case and spaces at the ends', () => {
  assert.equal(matchesQuery('', 'Филе лосося'), true);
  assert.equal(matchesQuery(' ЛОСОС ', 'Филе лосося', '130'), true);
  assert.equal(matchesQuery('13', 'Филе лосося', '130'), true);
  assert.equal(matchesQuery('сыр', 'Филе лосося', '130'), false);
});

test('plural picks the Russian form', () => {
  const forms = ['позиция', 'позиции', 'позиций'];
  const cases = [
    [1, 'позиция'],
    [2, 'позиции'],
    [4, 'позиции'],
    [5, 'позиций'],
    [11, 'позиций'],
    [12, 'позиций'],
    [21, 'позиция'],
    [22, 'позиции'],
    [111, 'позиций'],
  ];
  for (const [count, form] of cases)
    assert.equal(plural(count, ...forms), form, String(count));
  assert.equal(plural('9', ...forms), 'позиций');
  assert.equal(plural(3n, ...forms), 'позиции');
});

test('a list of numbers ends with «и»', () => {
  assert.equal(listText([]), '');
  assert.equal(listText([3]), '3');
  assert.equal(listText([5, 6]), '5 и 6');
  assert.equal(listText([1, 2, 4]), '1, 2 и 4');
});
