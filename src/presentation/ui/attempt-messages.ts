// The words of the saved-attempt warnings. Where the result of an unsure
// send can be checked differs by screen: the warehouse history, the list of
// products or of dishes, the order history.
export interface AttemptPlace {
  // The warning while the browser cannot remember the attempt.
  readonly notSaved: string;
  // Why the form is closed while the previous attempt cannot be read.
  readonly damaged: string;
  // The link to the place where the result is checked, and its path inside
  // the restaurant.
  readonly link: string;
  readonly suffix: string;
  // The confirmation before the previous attempt is cancelled.
  readonly checked: string;
  readonly confirm: string;
}

export const attemptPlaces = {
  warehouse: {
    notSaved:
      'Браузер не даёт запомнить эту отправку. Если страница перезагрузится, проверьте результат в истории склада.',
    damaged:
      'Прошлую отправку прочитать не получается. Проверьте историю склада: возможно, она уже дошла.',
    link: 'Открыть историю склада',
    suffix: '/warehouse/history',
    checked: 'Я проверил историю склада',
    confirm:
      'Если прошлая отправка уже дошла, новая может её повторить. Сначала посмотрите историю склада.',
  },
  products: {
    notSaved:
      'Браузер не даёт запомнить эту отправку. Если страница перезагрузится, проверьте результат в списке продуктов.',
    damaged:
      'Прошлую отправку прочитать не получается. Проверьте список продуктов: возможно, продукт уже добавлен.',
    link: 'Открыть список продуктов',
    suffix: '/catalog',
    checked: 'Я проверил список продуктов',
    confirm:
      'Если прошлая отправка уже дошла, новая может её повторить. Сначала посмотрите список продуктов.',
  },
  dishes: {
    notSaved:
      'Браузер не даёт запомнить эту отправку. Если страница перезагрузится, проверьте результат в списке блюд.',
    damaged:
      'Прошлую отправку прочитать не получается. Проверьте список блюд: возможно, блюдо уже добавлено.',
    link: 'Открыть список блюд',
    suffix: '/catalog/dishes',
    checked: 'Я проверил список блюд',
    confirm:
      'Если прошлая отправка уже дошла, новая может её повторить. Сначала посмотрите список блюд.',
  },
} as const satisfies Record<string, AttemptPlace>;

export type AttemptPlaceKey = keyof typeof attemptPlaces;

export const orderNotSaved =
  'Браузер не даёт запомнить этот заказ. Если страница перезагрузится, проверьте результат в разделе «Заказы».';

export const unresolvedAttempt =
  'Прошлая отправка ещё не завершена. Подождите или перезагрузите страницу.';

// What a refusal of the commands says when the saved attempt is the reason,
// or nothing for any other refusal.
export function attemptRefusalText(
  code: string,
  place: AttemptPlaceKey,
): string | undefined {
  if (code === 'AttemptDamaged') return attemptPlaces[place].damaged;
  if (code === 'AttemptUnresolved') return unresolvedAttempt;
  return undefined;
}
