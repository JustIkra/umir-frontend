// Temporary data from the Figma sample (W03, sale 01–08, E03, E05). Order
// screens show it until the serving API is connected.

export const menuStamp = 'Оценка 10.10.2026, 15:04:12 UTC+3';

export interface MenuDish {
  readonly dish: string;
  // 02: «В заказе: поз. 3 и 5».
  readonly inDraft?: string;
}

export const menu: readonly MenuDish[] = [
  { dish: 'Борщ с говядиной и сметаной' },
  { dish: 'Брускетта с томатами и базиликом', inDraft: 'В заказе: поз. 3 и 5' },
  {
    dish: 'Крем-суп из тыквы с обжаренными тыквенными семечками и сливочным сыром',
  },
  { dish: 'Морс клюквенный' },
  { dish: 'Паста с лососем и шпинатом', inDraft: 'В заказе: поз. 2' },
  { dish: 'Ризотто с пармезаном и рукколой' },
  {
    dish: 'Салат с лососем, киноа и печёным перцем',
    inDraft: 'В заказе: поз. 4',
  },
  { dish: 'Сырники со сметаной' },
  { dish: 'Тартар из лосося с авокадо', inDraft: 'В заказе: поз. 1' },
];

export const stopList: readonly {
  readonly dish: string;
  readonly reasons: readonly string[];
}[] = [
  {
    dish: 'Паста карбонара',
    reasons: ['На порцию не хватает: сливки 33% — нужно 50 мл, есть 20 мл'],
  },
  {
    dish: 'Цезарь с курицей',
    reasons: ['На порцию не хватает: куриное филе — нужно 120 г, есть 0 г'],
  },
  {
    dish: 'Тальятелле с белыми грибами в сливочном соусе с трюфельным маслом',
    reasons: [
      'На порцию не хватает: сливки 33% — нужно 50 мл, есть 20 мл',
      'На порцию не хватает: белые грибы — нужно 60 г, есть 0 г',
    ],
  },
];

export interface Reason {
  readonly batch: string;
  readonly perPortion: string;
  readonly expires: string;
}

export interface Recommendation {
  readonly rank: number;
  readonly dish: string;
  readonly nearest: string;
  readonly reasons: readonly Reason[];
}

export const recommendations: readonly Recommendation[] = [
  {
    rank: 1,
    dish: 'Ризотто с пармезаном и рукколой',
    nearest: 'Ближайший срок партий одной порции — 10.10.2026, 20:30. Причины:',
    reasons: [
      {
        batch: 'Сыр пармезан · партия P-0142',
        perPortion: '40 г на порцию',
        expires: 'Срок до 10.10.2026, 20:30',
      },
      {
        batch: 'Руккола · партия P-0150',
        perPortion: '30 г на порцию',
        expires: 'Срок до 10.10.2026, 20:30',
      },
    ],
  },
  {
    rank: 2,
    dish: 'Брускетта с томатами и базиликом',
    nearest: 'Ближайший срок партий одной порции — 10.10.2026, 23:00. Причина:',
    reasons: [
      {
        batch: 'Томаты черри · партия P-0151',
        perPortion: '80 г на порцию',
        expires: 'Срок до 10.10.2026, 23:00',
      },
    ],
  },
  {
    rank: 3,
    dish: 'Паста с лососем и шпинатом',
    nearest: 'Ближайший срок партий одной порции — 11.10.2026, 12:00. Причина:',
    reasons: [
      {
        batch: 'Филе лосося · партия P-0147',
        perPortion: '120 г на порцию',
        expires: 'Срок до 11.10.2026, 12:00',
      },
    ],
  },
  {
    rank: 4,
    dish: 'Салат с лососем, киноа и печёным перцем',
    nearest: 'Ближайший срок партий одной порции — 11.10.2026, 12:00. Причина:',
    reasons: [
      {
        batch: 'Филе лосося · партия P-0147',
        perPortion: '110 г на порцию',
        expires: 'Срок до 11.10.2026, 12:00',
      },
    ],
  },
];

export const recommendationsNote =
  'Показаны 4 из 9. Ранжируются все доступные блюда — по ближайшему сроку используемых партий.';

export interface DraftLine {
  readonly position: number;
  readonly dish: string;
  readonly portions: number;
  readonly note?: string;
}

export const draftOrder: readonly DraftLine[] = [
  { position: 1, dish: 'Тартар из лосося с авокадо', portions: 2 },
  { position: 2, dish: 'Паста с лососем и шпинатом', portions: 3 },
  { position: 3, dish: 'Брускетта с томатами и базиликом', portions: 2 },
  { position: 4, dish: 'Салат с лососем, киноа и печёным перцем', portions: 1 },
  {
    position: 5,
    dish: 'Брускетта с томатами и базиликом',
    portions: 1,
    note: 'Повтор блюда из поз. 3 — отдельная позиция',
  },
];

export const draftSummary = '5 позиций · 9 порций';

export type ProposalStatus = 'same' | 'reduced' | 'excluded';

export const proposal = {
  stamp: 'Оценка 10.10.2026, 15:05:37 UTC+3',
  rows: [
    {
      title: '1 · Тартар из лосося с авокадо',
      change: '2 → 2',
      status: 'same',
      note: 'Без изменений',
    },
    {
      title: '2 · Паста с лососем и шпинатом',
      change: '3 → 1',
      status: 'reduced',
      note: 'Филе лосося: на 3 порции нужно 360 г, доступно для позиции 220 г',
    },
    {
      title: '3 · Брускетта с томатами и базиликом',
      change: '2 → 2',
      status: 'same',
      note: 'Без изменений',
    },
    {
      title: '4 · Салат с лососем, киноа и печёным перцем',
      change: '1 → 0',
      status: 'excluded',
      note: 'Филе лосося: нужно 110 г, доступно для позиции 100 г',
    },
    {
      title: '5 · Брускетта с томатами и базиликом',
      change: '1 → 1',
      status: 'same',
      note: 'Без изменений',
    },
  ],
  summary:
    'Принято 4 из 5 позиций, 6 из 9 порций. Сокращение не принимается автоматически.',
} as const satisfies {
  stamp: string;
  rows: readonly {
    title: string;
    change: string;
    status: ProposalStatus;
    note: string;
  }[];
  summary: string;
};

const finalLines = [
  { title: '1 · Тартар из лосося с авокадо', portions: '2 порц.' },
  { title: '2 · Паста с лососем и шпинатом', portions: '1 порц.' },
  { title: '3 · Брускетта с томатами и базиликом', portions: '2 порц.' },
  { title: '5 · Брускетта с томатами и базиликом', portions: '1 порц.' },
] as const;

export const shortage = {
  stamp: 'Оценка 10.10.2026, 15:05:37 UTC+3',
  changed: [
    {
      title: 'Поз. 2 · Паста с лососем и шпинатом',
      text: 'Запрошено 3 порции, доступна 1',
    },
  ],
  excluded: [
    {
      title: 'Поз. 4 · Салат с лососем, киноа и печёным перцем',
      text: 'Запрошена 1 порция, доступно 0 — позиция исключена',
    },
  ],
  missing: [
    {
      position: 'Поз. 2',
      ingredient: 'Филе лосося',
      need: '360 г',
      available: '220 г',
    },
    {
      position: 'Поз. 4',
      ingredient: 'Филе лосося',
      need: '110 г',
      available: '100 г',
    },
  ],
  finalTitle: 'Итоговый состав · 4 позиции, 6 порций',
  finalLines,
  total: 'Итоговый состав: 4 позиции, 6 порций',
} as const;

// Figma 08 shows the order after the second reduction (06). Without 06 in this
// flow, the placed order is the confirmed composition of 04.
export const placedOrder = {
  stamp: 'Записан сервисом 10.10.2026, 15:06:31 UTC+3',
  id: 'ord-20261010-0042',
  title: 'Оформленный состав · 4 позиции, 6 порций',
  lines: finalLines,
} as const;

// W03 tiles.
export const overview = {
  warehouse: {
    stamp: 'оценка 14:32',
    boundary: 'Граница: 11.10.2026, 14:32 (Москва, UTC+3)',
    count: '4 партии',
    countNote: 'с остатком и сроком до выбранной границы',
    batches: [
      {
        product: 'Сыр пармезан',
        batch: 'P-0142 · остаток 1 200 г',
        left: 'Истекает через 6 ч',
      },
      {
        product: 'Руккола',
        batch: 'P-0150 · остаток 450 г',
        left: 'Истекает через 6 ч',
      },
      {
        product: 'Сливки 33%',
        batch: 'P-0139 · остаток 20 мл',
        left: 'Истекает через 14 ч',
      },
    ],
    more: 'Ещё 1 партия в окне',
  },
  menu: {
    stamp: 'оценка 14:32',
    unavailable: '2 блюда недоступны',
    stopped: [
      {
        dish: 'Паста карбонара',
        reason: 'Не хватает на порцию: сливки 33% — нужно 50 мл, есть 20 мл',
      },
      {
        dish: 'Цезарь с курицей',
        reason: 'Не хватает на порцию: куриное филе — нужно 120 г, есть 0 г',
      },
    ],
    recommended: '1. Ризотто с пармезаном и рукколой',
    recommendedNote:
      'Ближайший срок партий одной порции — 10.10.2026, 20:30. Обе причины:',
    reasons: [
      {
        batch: 'Сыр пармезан · партия P-0142',
        perPortion: '40 г на порцию',
        left: 'Истекает через 6 ч',
      },
      {
        batch: 'Руккола · партия P-0150',
        perPortion: '30 г на порцию',
        left: 'Истекает через 6 ч',
      },
    ],
  },
  catalog: { stamp: 'оценка 14:30', products: '24', dishes: '12' },
  writeoff: { stamp: 'оценка 14:30', batches: '2', products: '2' },
  analytics: {
    stamp: 'оценка 14:30',
    stocked: '24',
    nearest: '4',
    writeoff: '2',
  },
} as const;
