import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  activeSectionIndex,
  sectionActivationPoints,
} from '../../src/presentation/documents/active-section.ts';

test('sections become current when their top reaches the activation line', () => {
  assert.deepEqual(
    sectionActivationPoints([100, 600, 1200], 200, 2000, 100),
    [0, 400, 1000],
  );
});

test('sections below the scrollable range share the end of the page', () => {
  // The last two tops never reach the line: they are spread back from the
  // bottom, one minimum gap apart.
  const points = sectionActivationPoints([0, 900, 1300, 1450], 270, 1000, 120);
  assert.deepEqual(points, [0, 630, 880, 1000]);
  assert.deepEqual(
    [0, 640, 900, 1000].map((scrollY) => activeSectionIndex(points, scrollY)),
    [0, 1, 2, 3],
  );
});

test('short sections near the end keep at least the minimum gap', () => {
  // Natural points 1130, 1330 and 1410: the third section would be current
  // for only 80px of scrolling, so it starts earlier.
  assert.deepEqual(
    sectionActivationPoints([0, 1400, 1600, 1680], 270, 1450, 135),
    [0, 1130, 1275, 1410],
  );
});

test('the current section is the last activation point reached', () => {
  const points = [0, 400, 1000];
  assert.deepEqual(
    [0, 398, 399, 999, 1000].map((scrollY) =>
      activeSectionIndex(points, scrollY),
    ),
    [0, 0, 1, 2, 2],
  );
});
