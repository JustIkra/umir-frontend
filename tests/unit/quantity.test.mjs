import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  formatQuantity,
  formatThousandths,
  parseQuantity,
  unitShort,
  unitTitles,
} from '../../src/domain/quantity.ts';

const nbsp = ' ';

test('formatQuantity shows thousandths in the base unit', () => {
  assert.equal(formatQuantity('40000', 'g'), '40 г');
  assert.equal(formatQuantity('500', 'g'), '0,5 г');
  assert.equal(formatQuantity('50000', 'ml'), '50 мл');
  assert.equal(formatQuantity('2000', 'pcs'), '2 шт');
  assert.equal(formatQuantity('1', 'g'), '0,001 г');
  assert.equal(formatQuantity('0', 'g'), '0 г');
});

test('formatThousandths groups thousands with a no-break space and trims zeros', () => {
  assert.equal(formatThousandths('1250000'), `1${nbsp}250`);
  assert.equal(formatThousandths('1250500'), `1${nbsp}250,5`);
  assert.equal(formatThousandths('120'), '0,12');
});

test('formatQuantity keeps int64 precision', () => {
  assert.equal(
    formatThousandths('9223372036854775807'),
    `9${nbsp}223${nbsp}372${nbsp}036${nbsp}854${nbsp}775,807`,
  );
});

test('parseQuantity reads comma or dot and up to three decimals', () => {
  assert.deepEqual(parseQuantity('40'), { ok: true, thousandths: '40000' });
  assert.deepEqual(parseQuantity('0,5'), { ok: true, thousandths: '500' });
  assert.deepEqual(parseQuantity(' 0.125 '), { ok: true, thousandths: '125' });
  assert.deepEqual(parseQuantity('1 250'), {
    ok: true,
    thousandths: '1250000',
  });
  assert.deepEqual(parseQuantity('0,001'), { ok: true, thousandths: '1' });
});

test('parseQuantity rejects a fourth decimal', () => {
  assert.deepEqual(parseQuantity('0,0005'), { ok: false, error: 'precision' });
});

test('parseQuantity refuses empty, non-numeric and zero', () => {
  assert.deepEqual(parseQuantity(''), { ok: false, error: 'required' });
  assert.deepEqual(parseQuantity('  '), { ok: false, error: 'required' });
  assert.deepEqual(parseQuantity('-1'), { ok: false, error: 'format' });
  assert.deepEqual(parseQuantity('1e3'), { ok: false, error: 'format' });
  assert.deepEqual(parseQuantity('1,2,3'), { ok: false, error: 'format' });
  assert.deepEqual(parseQuantity('0'), { ok: false, error: 'zero' });
  assert.deepEqual(parseQuantity('0,000'), { ok: false, error: 'zero' });
});

test('unit names follow the Figma radio and table texts', () => {
  assert.deepEqual(unitTitles, {
    g: 'граммы, г',
    ml: 'миллилитры, мл',
    pcs: 'штуки, шт',
  });
  assert.equal(unitShort('pcs'), 'шт');
});
