import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createElement as h } from 'react';
import {
  LogoutView,
  signOutOnPress,
} from '../../src/presentation/auth/logout-page.tsx';
import {
  h1,
  hrefs,
  redirectOf,
  renderElement,
  renderRoute,
  text,
} from './support/render-route.mjs';

const none = () => {};

test('/logout with an active session sends nothing and asks first', async () => {
  const sessionCalls = { signOut: 0, check: 0 };
  const html = await renderRoute('/logout', { sessionCalls });
  assert.equal(h1(html), 'Выйти из аккаунта?');
  assert.equal(sessionCalls.signOut, 0);
  assert.equal(await redirectOf('/logout'), undefined);
});

test('the question offers «Выйти» and «Остаться» that opens the app', async () => {
  const html = await renderRoute('/logout');
  assert.match(text(html), /Выйти/);
  assert.match(text(html), /Остаться/);
  assert.ok(hrefs(html).includes('/app'));
  assert.doesNotMatch(text(html), /Выходим/);
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
  signOutOnPress(session, {
    show: (state) => steps.push(state),
    leave: () => steps.push('login'),
  });
  assert.deepEqual(steps, ['pending']);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, ['signOut']);
  assert.deepEqual(steps, ['pending', 'login']);
});

test('a lost answer ends on «Не знаем, получилось ли выйти»', async () => {
  const steps = [];
  signOutOnPress(
    { signOut: () => Promise.resolve('failed') },
    { show: (state) => steps.push(state), leave: none },
  );
  await Promise.resolve();
  await Promise.resolve();
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
