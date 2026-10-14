// Temporary data from the Figma sample (W03). The overview tiles show it
// until the overview API is connected.

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
