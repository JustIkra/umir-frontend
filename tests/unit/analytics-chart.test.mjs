import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createElement as h } from 'react';
import {
  BarChart,
  ChartLegend,
} from '../../src/presentation/analytics/bar-chart.tsx';
import { days, displayDecimal } from '../../src/presentation/ui/decimals.ts';
import { renderElement, text } from './support/render-route.mjs';

test('decimals keep the warehouse look', () => {
  assert.equal(displayDecimal('1428.6'), '1 428,6');
  assert.equal(displayDecimal('2000.000000'), '2 000');
  assert.equal(days('1'), '1 день');
  assert.equal(days('3'), '3 дня');
  assert.equal(days('2.1'), '2,1 дня');
  assert.equal(days('5'), '5 дней');
});

const rows = [
  {
    id: 'cheese',
    name: 'Сыр',
    figure: 'Риск 40 %',
    segments: [
      { key: 'safe', color: 'bg.action', share: 60 },
      { key: 'expiring', color: 'bg.expiry', share: 20 },
      { key: 'pending', color: 'border.error', share: 20 },
    ],
    details: [
      { value: '3 кг', label: 'не испортится за 2 дня' },
      { value: '1 кг', label: 'испортится за 2 дня' },
    ],
  },
  {
    id: 'milk',
    name: 'Молоко',
    figure: 'Риск 100 %',
    segments: [
      { key: 'safe', color: 'bg.action', share: 0 },
      { key: 'pending', color: 'border.error', share: 100 },
    ],
    details: [{ value: '500 мл', label: 'ждёт списания' }],
  },
];

test('a bar chart is one list stop with a full label per row and no empty parts', () => {
  const html = renderElement(
    h(BarChart, { label: 'Что может испортиться', rows }),
  );
  assert.ok(html.includes('role="list"'));
  assert.ok(html.includes('aria-label="Что может испортиться"'));
  assert.ok(
    html.includes(
      'aria-label="Сыр: 3 кг — не испортится за 2 дня, 1 кг — испортится за 2 дня"',
    ),
  );
  assert.equal(html.match(/tabindex="0"/g)?.length, 1);
  assert.equal(html.match(/tabindex="-1"/g)?.length, 1);
  assert.equal(html.match(/data-segment=/g)?.length, 4);
  assert.ok(!html.includes('data-threshold'));
  assert.ok(text(html).includes('Риск 40 %'));
});

test('a scale chart draws the threshold line', () => {
  const html = renderElement(
    h(BarChart, {
      label: 'Скоро закончится',
      rows: [
        {
          id: 'flour',
          name: 'Мука',
          figure: 'Хватит на 2 дня',
          segments: [{ key: 'cover', color: 'bg.expiry', share: 28.571 }],
          details: [],
        },
      ],
      scale: true,
      threshold: 42.857,
    }),
  );
  assert.ok(html.includes('data-threshold'));
  assert.equal(html.match(/data-segment=/g)?.length, 1);
});

test('the legend names every colour and the line', () => {
  const html = renderElement(
    h(ChartLegend, {
      items: [
        { key: 'low', label: 'Запаса меньше чем на 3 дня', color: 'bg.expiry' },
        { key: 'line', label: 'Линия — запас на 3 дня', color: 'line' },
      ],
    }),
  );
  const plain = text(html);
  assert.ok(plain.includes('Запаса меньше чем на 3 дня'));
  assert.ok(plain.includes('Линия — запас на 3 дня'));
});
