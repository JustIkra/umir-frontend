import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'bun:test';
import { Children, createElement as h, isValidElement } from 'react';
import {
  LogoutView,
  signOutOnPress,
} from '../../src/presentation/auth/logout-page.tsx';
import { Button, ButtonLink } from '../../src/presentation/ui/actions.tsx';
import {
  h1,
  hrefs,
  redirectOf,
  renderElement,
  renderRoute,
  text,
} from './support/render-route.mjs';

const none = () => {};

// Without a DOM renderer: LogoutView has no hooks, so calling it gives the
// tree of elements, where a button's onClick can be called as a click.
const elements = (node) =>
  Children.toArray(node).flatMap((child) =>
    isValidElement(child) ? [child, ...elements(child.props.children)] : [],
  );
const labelOf = (element) => Children.toArray(element.props.children).join('');
const controls = (props, type) =>
  elements(LogoutView(props)).filter((element) => element.type === type);
const buttonNamed = (props, name) =>
  controls(props, Button).filter((element) => labelOf(element) === name);

test('/logout with an active session sends nothing and asks first', async () => {
  const sessionCalls = { signOut: 0, check: 0 };
  const html = await renderRoute('/logout', { sessionCalls });
  assert.equal(h1(html), 'Выйти из аккаунта?');
  assert.equal(sessionCalls.signOut, 0);
  assert.equal(await redirectOf('/logout'), undefined);
});

test('the question has the «Выйти» button and the «Остаться» link to the app', () => {
  const props = { state: 'confirm', onSignOut: none, onCheck: none };
  assert.equal(buttonNamed(props, 'Выйти').length, 1);
  const stay = controls(props, ButtonLink).filter(
    (element) => labelOf(element) === 'Остаться',
  );
  assert.equal(stay.length, 1);
  assert.equal(stay[0].props.to, '/app');
  const html = renderElement(h(LogoutView, props));
  assert.equal(h1(html), 'Выйти из аккаунта?');
  assert.ok(hrefs(html).includes('/app'));
  assert.doesNotMatch(text(html), /Выходим/);
});

test('the «Выйти» button is wired to the sign-out and nothing else is', () => {
  let signOuts = 0;
  const props = {
    state: 'confirm',
    onSignOut: () => {
      signOuts += 1;
    },
    onCheck: none,
  };
  assert.equal(signOuts, 0);
  const [button] = buttonNamed(props, 'Выйти');
  button.props.onClick();
  assert.equal(signOuts, 1);
  assert.equal(
    controls(props, Button).filter((element) => element.props.onClick).length,
    1,
  );
});

test('the page has no effect that could sign out on its own', () => {
  const source = readFileSync(
    new URL('../../src/presentation/auth/logout-page.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /useEffect|useLayoutEffect|useInsertionEffect/);
});

test('a guest goes to sign-in without any call', async () => {
  const sessionCalls = { signOut: 0, check: 0 };
  const session = { status: 'anonymous', expired: false };
  assert.equal(
    await redirectOf('/logout', { session, sessionCalls }),
    '/login',
  );
  assert.equal(sessionCalls.signOut, 0);
  assert.equal(sessionCalls.check, 0);
});

test('a press signs out exactly once and a done answer leaves for sign-in', async () => {
  const calls = [];
  const session = {
    signOut: () => {
      calls.push('signOut');
      return Promise.resolve('done');
    },
  };
  const steps = [];
  const done = signOutOnPress(session, {
    show: (state) => steps.push(state),
    leave: () => steps.push('login'),
  });
  assert.deepEqual(steps, ['pending']);
  await done;
  assert.deepEqual(calls, ['signOut']);
  assert.deepEqual(steps, ['pending', 'login']);
});

test('a lost answer ends on «Не знаем, получилось ли выйти»', async () => {
  const steps = [];
  await signOutOnPress(
    { signOut: () => Promise.resolve('failed') },
    { show: (state) => steps.push(state), leave: none },
  );
  assert.deepEqual(steps, ['pending', 'failed']);
  const html = renderElement(
    h(LogoutView, { state: 'failed', onSignOut: none, onCheck: none }),
  );
  assert.equal(h1(html), 'Не знаем, получилось ли выйти');
  assert.match(text(html), /Выйти ещё раз/);
  assert.match(text(html), /Проверить результат/);
});

test('the states after a press keep their texts', () => {
  const view = (state) =>
    renderElement(h(LogoutView, { state, onSignOut: none, onCheck: none }));
  assert.match(text(view('pending')), /Выходим/);
  assert.equal(h1(view('active')), 'Вы ещё не вышли');
  assert.match(text(view('active')), /Выйти/);
});
