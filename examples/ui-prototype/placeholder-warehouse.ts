// Temporary data from the Figma sample (S1, S3, H1). Warehouse screens show it
// until the warehouse API is connected.

export interface Batch {
  readonly id: string;
  readonly quantity: string;
  readonly expires: string;
  readonly received: string;
}

export interface StockRow {
  readonly product: string;
  readonly quantity: string;
  readonly batches: string;
  readonly nearest: string;
  // Only «Сыр пармезан» has its batches drawn in S1.
  readonly items?: readonly Batch[];
}

const row = (
  product: string,
  quantity: string,
  batches: string,
  nearest: string,
): StockRow => ({ product, quantity, batches, nearest });

export const stock: readonly StockRow[] = [
  row('Авокадо', '6 шт', '1 партия', 'ближайший срок 13.10.2026, 12:00'),
  row('Белые грибы', '0 г', 'нет пригодных партий', '—'),
  row(
    'Куриное филе',
    '3 000 г',
    '1 партия',
    'ближайший срок 15.10.2026, 07:30',
  ),
  row(
    'Мука пшеничная',
    '250 000,125 г',
    '1 партия',
    'ближайший срок 01.04.2027, 09:00',
  ),
  row('Руккола', '450 г', '1 партия', 'ближайший срок 10.10.2026, 20:30'),
  row('Сливки 33%', '20 мл', '1 партия', 'ближайший срок 11.10.2026, 04:30'),
  {
    ...row(
      'Сыр пармезан',
      '3 200 г',
      '2 партии',
      'ближайший срок 10.10.2026, 20:30',
    ),
    items: [
      {
        id: 'P-0142',
        quantity: '1 200 г',
        expires: 'Годна до 10.10.2026, 20:30',
        received: 'Поступила 12.09.2026, 10:15 · поставка № 1187, строка 2',
      },
      {
        id: 'P-0158',
        quantity: '2 000 г',
        expires: 'Годна до 05.11.2026, 10:00',
        received: 'Поступила 05.10.2026, 11:40 · поставка № 1189, строка 1',
      },
    ],
  },
  row(
    'Томаты черри',
    '1 540 г',
    '2 партии',
    'ближайший срок 10.10.2026, 23:00',
  ),
  row('Филе лосося', '2 100 г', '2 партии', 'ближайший срок 11.10.2026, 12:00'),
  row('Шпинат', '540 г', '1 партия', 'ближайший срок 12.10.2026, 18:00'),
];

export const stockStamp = 'Оценка 10.10.2026, 15:22:10 UTC+3';

export interface ExpiryRow {
  readonly product: string;
  readonly batch: string;
  readonly left: string;
  readonly until: string;
}

export const expiry: readonly ExpiryRow[] = [
  {
    product: 'Сыр пармезан',
    batch: 'Партия P-0142 · остаток 1 200 г',
    left: 'через 5 ч 08 мин',
    until: 'до 10.10.2026, 20:30',
  },
  {
    product: 'Руккола',
    batch: 'Партия P-0150 · остаток 450 г',
    left: 'через 5 ч 08 мин',
    until: 'до 10.10.2026, 20:30',
  },
  {
    product: 'Томаты черри',
    batch: 'Партия P-0151 · остаток 40 г',
    left: 'через 7 ч 38 мин',
    until: 'до 10.10.2026, 23:00',
  },
  {
    product: 'Сливки 33%',
    batch: 'Партия P-0139 · остаток 20 мл',
    left: 'через 13 ч 08 мин',
    until: 'до 11.10.2026, 04:30',
  },
  {
    product: 'Филе лосося',
    batch: 'Партия P-0147 · остаток 100 г',
    left: 'через 20 ч 38 мин',
    until: 'до 11.10.2026, 12:00',
  },
];

export const expiryBoundary = '11.10.2026, 15:22 (Москва, UTC+3)';
export const expirySummary =
  '5 партий с остатком и сроком до выбранной границы · по сроку и номеру партии';

export type EventKind = 'sale' | 'receipt' | 'writeoff';

export interface HistoryEvent {
  readonly id: string;
  readonly kind: EventKind;
  readonly text: string;
  readonly at: string;
}

export const history: readonly HistoryEvent[] = [
  {
    id: '#1050',
    kind: 'sale',
    text: 'Заказ ord-20261010-0038 · 2 позиции',
    at: '10.10.2026, 12:40:03',
  },
  {
    id: '#1051',
    kind: 'sale',
    text: 'Заказ ord-20261010-0039 · 4 позиции',
    at: '10.10.2026, 13:05:47',
  },
  {
    id: '#1052',
    kind: 'receipt',
    text: 'Поставка № 1190 · 2 строки, 2 партии',
    at: '10.10.2026, 14:02:11',
  },
  {
    id: '#1053',
    kind: 'writeoff',
    text: 'Партия P-0133 · руккола · 150 г',
    at: '10.10.2026, 15:00:02',
  },
  {
    id: '#1054',
    kind: 'sale',
    text: 'Заказ ord-20261010-0041 · 3 позиции',
    at: '10.10.2026, 15:05:58',
  },
  {
    id: '#1055',
    kind: 'sale',
    text: 'Заказ ord-20261010-0042 · 3 позиции',
    at: '10.10.2026, 15:06:31',
  },
  {
    id: '#1056',
    kind: 'receipt',
    text: 'Поставка № 1192 · 4 строки, 4 партии',
    at: '10.10.2026, 15:21:08',
  },
  {
    id: '#1057',
    kind: 'writeoff',
    text: 'Партия P-0164 · сливки 33% · 1 000 мл, при поступлении',
    at: '10.10.2026, 15:21:08',
  },
];

export const historyStamp =
  'Последнее событие #1057 · 10.10.2026, 15:21:08 UTC+3';
export const historyRange = 'События #1050–#1057 в порядке записи';
