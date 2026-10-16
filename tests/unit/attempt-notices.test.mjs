import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Children, createElement as h, isValidElement } from 'react';
import batches from '../fixtures/ua1-product-batches.json' with { type: 'json' };
import { outcomeMessage } from '../../src/presentation/catalog/catalog-forms.ts';
import {
  attemptPlaces,
  attemptRefusalText,
} from '../../src/presentation/ui/attempt-messages.ts';
import { DamagedAttemptView } from '../../src/presentation/ui/attempt-notices.tsx';
import { Button, ButtonLink } from '../../src/presentation/ui/actions.tsx';
import {
  R,
  attemptState,
  hrefs,
  loaded,
  orderSnapshot,
  renderElement,
  renderRoute,
  text,
} from './support/render-route.mjs';

const NOT_SAVED_WAREHOUSE =
  'Браузер не даёт запомнить эту отправку. Если страница перезагрузится, проверьте результат в истории склада.';
const NOT_SAVED_ORDER =
  'Браузер не даёт запомнить этот заказ. Если страница перезагрузится, проверьте результат в разделе «Заказы».';
const DAMAGED_WAREHOUSE =
  'Прошлую отправку прочитать не получается. Проверьте историю склада: возможно, она уже дошла.';
const UNRESOLVED =
  'Прошлая отправка ещё не завершена. Подождите или перезагрузите страницу.';

const pending = {
  items: [{ batch: batches.result.items[0].batch, status: 'pending_writeoff' }],
};
const none = () => {};

// Without a DOM renderer: the view has no hooks, so calling it gives the tree
// of elements, where a button's onClick can be called as a click.
const elements = (node) =>
  Children.toArray(node).flatMap((child) =>
    isValidElement(child)
      ? [
          child,
          ...elements(child.props.children),
          ...elements(child.props.action),
        ]
      : [],
  );
const labelOf = (element) => Children.toArray(element.props.children).join('');
const buttons = (props) =>
  elements(DamagedAttemptView(props)).filter(
    (element) => element.type === Button,
  );
const viewProps = (overrides = {}) => ({
  place: attemptPlaces.warehouse,
  to: `/app/r/${R}/warehouse/history`,
  step: 'closed',
  onAsk: none,
  onConfirm: none,
  onBack: none,
  ...overrides,
});

test('the texts of the refusals say it in plain words', () => {
  assert.equal(
    attemptRefusalText('AttemptDamaged', 'warehouse'),
    DAMAGED_WAREHOUSE,
  );
  assert.equal(
    attemptRefusalText('AttemptUnresolved', 'warehouse'),
    UNRESOLVED,
  );
  assert.equal(attemptRefusalText('SettingsChanged', 'warehouse'), undefined);
  assert.match(attemptRefusalText('AttemptDamaged', 'products'), /продуктов/);
  assert.match(attemptRefusalText('AttemptDamaged', 'dishes'), /блюд/);
  assert.deepEqual(outcomeMessage('product', 'refused', 'AttemptUnresolved'), {
    title: 'Продукт не создан',
    text: UNRESOLVED,
  });
  assert.equal(
    outcomeMessage('dish', 'refused', 'AttemptDamaged').title,
    'Блюдо не создано',
  );
  assert.match(
    outcomeMessage('dish', 'refused', 'AttemptDamaged').text,
    /Прошлую отправку прочитать не получается/,
  );
  assert.equal(
    outcomeMessage('dish', 'refused', 'Other').text,
    outcomeMessage('dish', 'refused').text,
  );
});

test('the damaged view asks first: nothing discards before the confirmation', () => {
  let discards = 0;
  const props = viewProps({
    onConfirm: () => {
      discards += 1;
    },
  });
  const closed = buttons(props);
  assert.deepEqual(closed.map(labelOf), ['Отменить прошлую отправку']);
  for (const button of closed) button.props.onClick();
  assert.equal(discards, 0);
  let asked = 0;
  const view = viewProps({
    onAsk: () => {
      asked += 1;
    },
  });
  buttons(view)[0].props.onClick();
  assert.equal(asked, 1);
});

test('only the «Я проверил историю склада» button of the second step discards', () => {
  let discards = 0;
  const props = viewProps({
    step: 'confirm',
    onConfirm: () => {
      discards += 1;
    },
  });
  const names = buttons(props).map(labelOf);
  assert.deepEqual(names, ['Я проверил историю склада', 'Назад']);
  const [confirm, back] = buttons(props);
  back.props.onClick();
  assert.equal(discards, 0);
  confirm.props.onClick();
  assert.equal(discards, 1);
});

test('the damaged view explains, links to the history and keeps technical words out', () => {
  const html = renderElement(h(DamagedAttemptView, viewProps()));
  assert.ok(text(html).includes(DAMAGED_WAREHOUSE));
  assert.ok(hrefs(html).includes(`/app/r/${R}/warehouse/history`));
  assert.ok(text(html).includes('Открыть историю склада'));
  assert.doesNotMatch(
    text(html),
    /commandID|sessionStorage|запис|хранилищ|corrupt/i,
  );
  const link = elements(DamagedAttemptView(viewProps())).filter(
    (element) => element.type === ButtonLink,
  );
  assert.equal(link.length, 1);
});

test('the answers of a refused or unavailable discard are neutral', () => {
  const refused = renderElement(
    h(DamagedAttemptView, viewProps({ step: 'refused' })),
  );
  assert.match(text(refused), /Эту отправку отменить нельзя/);
  const unavailable = renderElement(
    h(DamagedAttemptView, viewProps({ step: 'unavailable' })),
  );
  assert.match(text(unavailable), /Браузер не даёт отменить прошлую отправку/);
});

test('a delivery that the browser cannot remember shows the warning and stays open', async () => {
  const html = await renderRoute(`/app/r/${R}/warehouse/delivery`, {
    attempt: attemptState({ notSaved: true }),
    data: {
      products: loaded({
        items: [{ productID: 'rice', name: 'Рис', baseUnit: 'g' }],
      }),
    },
  });
  assert.ok(text(html).includes(NOT_SAVED_WAREHOUSE));
  assert.doesNotMatch(html, /<fieldset[^>]*disabled/);
  const quiet = await renderRoute(`/app/r/${R}/warehouse/delivery`);
  assert.ok(!text(quiet).includes('Браузер не даёт запомнить'));
});

test('a damaged delivery closes the form and offers the history and the discard', async () => {
  const discards = { count: 0 };
  const html = await renderRoute(`/app/r/${R}/warehouse/delivery`, {
    attempt: attemptState({ damaged: true, discards }),
    data: {
      products: loaded({
        items: [{ productID: 'rice', name: 'Рис', baseUnit: 'g' }],
      }),
    },
  });
  assert.ok(text(html).includes(DAMAGED_WAREHOUSE));
  assert.ok(hrefs(html).includes(`/app/r/${R}/warehouse/history`));
  assert.ok(text(html).includes('Отменить прошлую отправку'));
  assert.match(html, /<fieldset[^>]*disabled/);
  assert.equal(discards.count, 0);
});

test('a write-off row shows the warning and keeps its button', async () => {
  const html = await renderRoute(`/app/r/${R}/warehouse/expiry`, {
    data: { pendingWriteoffs: loaded(pending) },
    writeoffAttempts: { 'batch-1': attemptState({ notSaved: true }) },
  });
  assert.ok(text(html).includes(NOT_SAVED_WAREHOUSE));
  assert.ok(text(html).includes('Подтвердить списание'));
});

test('a damaged write-off hides its button, offers the history and the discard', async () => {
  const discards = { count: 0 };
  const html = await renderRoute(`/app/r/${R}/warehouse/expiry`, {
    data: { pendingWriteoffs: loaded(pending) },
    writeoffAttempts: { 'batch-1': attemptState({ damaged: true, discards }) },
  });
  assert.ok(text(html).includes(DAMAGED_WAREHOUSE));
  assert.ok(hrefs(html).includes(`/app/r/${R}/warehouse/history`));
  assert.ok(text(html).includes('Отменить прошлую отправку'));
  assert.ok(!text(html).includes('Подтвердить списание'));
  assert.equal(discards.count, 0);
});

for (const [name, path, place] of [
  ['product', 'products/new', 'продуктов'],
  ['dish', 'dishes/new', 'блюд'],
]) {
  test(`the ${name} form shows the warning and stays open`, async () => {
    const html = await renderRoute(`/app/r/${R}/catalog/${path}`, {
      attempt: attemptState({ notSaved: true }),
    });
    assert.match(text(html), /Браузер не даёт запомнить эту отправку/);
    assert.match(
      text(html),
      /Если страница перезагрузится, проверьте результат/,
    );
    assert.ok(text(html).includes(place));
    assert.doesNotMatch(html, /<fieldset[^>]*disabled/);
  });

  test(`a damaged ${name} attempt closes the form until it is discarded`, async () => {
    const discards = { count: 0 };
    const html = await renderRoute(`/app/r/${R}/catalog/${path}`, {
      attempt: attemptState({ damaged: true, discards }),
    });
    assert.match(text(html), /Прошлую отправку прочитать не получается/);
    assert.ok(text(html).includes('Отменить прошлую отправку'));
    assert.match(html, /<fieldset[^>]*disabled/);
    assert.equal(discards.count, 0);
  });
}

test('the order screen warns that the browser cannot remember the order', async () => {
  const html = await renderRoute(`/app/r/${R}/orders`, {
    order: orderSnapshot({ notSaved: true }),
  });
  assert.ok(text(html).includes(NOT_SAVED_ORDER));
  const quiet = await renderRoute(`/app/r/${R}/orders`);
  assert.ok(!text(quiet).includes('Браузер не даёт запомнить'));
});
