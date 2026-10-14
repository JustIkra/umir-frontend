import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { localFailure } from '../../src/application/api.ts';
import {
  noticeMessage,
  signInMessage,
} from '../../src/presentation/auth/sign-in-page.tsx';
import { renderRoute, text } from './support/render-route.mjs';

const rejected = (code, extra = {}) => ({
  kind: 'rejected',
  failure: { ...localFailure(code, 'not_committed', 401), ...extra },
});

test('wrong credentials read as L05', () => {
  assert.deepEqual(signInMessage(rejected('InvalidCredentials')), {
    tone: 'error',
    title: 'Не удалось войти',
    text: 'Проверьте логин и пароль и попробуйте снова.',
  });
  assert.equal(
    signInMessage(rejected('InvalidArgument')).title,
    'Не удалось войти',
  );
});

test('a rate limit names the wait', () => {
  assert.deepEqual(
    signInMessage(
      rejected('LoginRateLimited', { status: 429, retryAfterSeconds: 60 }),
    ),
    {
      tone: 'error',
      title: 'Слишком много попыток входа',
      text: 'Повторите вход через 60 с.',
      waitSeconds: 60,
    },
  );
});

test('an unknown outcome continues the same attempt', () => {
  const message = signInMessage({
    kind: 'unknown',
    failure: localFailure('Transport', 'unknown'),
    attempt: {},
  });
  assert.equal(message.tone, 'unknown');
  assert.equal(message.title, 'Результат входа неизвестен');
  assert.equal(
    message.text,
    'Ответ сервиса не получен. Вход мог быть выполнен. Повторная отправка не требуется: проверка продолжит ту же попытку.',
  );
});

test('any other refusal says the service did not answer', () => {
  assert.deepEqual(
    signInMessage(rejected('AuthUnavailable', { status: 503 })),
    {
      tone: 'error',
      title: 'Вход не выполнен',
      text: 'Сервис авторизации не отвечает. Повторите попытку через несколько минут.',
    },
  );
  assert.equal(signInMessage({ kind: 'committed', value: {} }), undefined);
});

const unknownChange = { kind: 'password-unknown', login: 'm.belova' };

test('under L13 a refused service reads as L14; wrong credentials stay L05', () => {
  assert.deepEqual(
    signInMessage(rejected('AuthUnavailable', { status: 503 }), unknownChange),
    {
      tone: 'error',
      title: 'Вход не выполнен',
      text: 'Действующий пароль пока не определён. Повторите вход через несколько минут.',
    },
  );
  assert.equal(
    signInMessage(rejected('InvalidCredentials'), unknownChange).title,
    'Не удалось войти',
  );
});

test('notices of L11, L13 and L10', () => {
  assert.deepEqual(
    noticeMessage({ kind: 'password-changed', login: 'm.belova' }),
    {
      tone: 'success',
      title: 'Пароль изменён',
      text: 'Все сеансы завершены. Войдите с новым паролем.',
    },
  );
  assert.deepEqual(noticeMessage(unknownChange), {
    tone: 'unknown',
    title: 'Результат изменения пароля неизвестен',
    text: 'Если пароль изменился, войти можно только с новым. Попробуйте войти с ним — изменение повторно не отправляется.',
  });
  assert.deepEqual(noticeMessage({ kind: 'password-limit' }), {
    tone: 'unknown',
    title: 'Сессия завершена',
    text: 'Превышено число неверных попыток ввести текущий пароль. Войдите снова.',
  });
});

test('the sign-in page shows the notice and fills in the login', async () => {
  const html = await renderRoute('/login', {
    session: {
      status: 'anonymous',
      expired: false,
      notice: { kind: 'password-changed', login: 'm.belova' },
    },
  });
  assert.ok(text(html).includes('Пароль изменён'));
  assert.ok(html.includes('value="m.belova"'));
  const limit = await renderRoute('/login', {
    session: {
      status: 'anonymous',
      expired: false,
      notice: { kind: 'password-limit' },
    },
  });
  assert.ok(text(limit).includes('Превышено число неверных попыток'));
});

test('an expired session with the L13 notice shows L13, not the plain expiry', async () => {
  const plainExpiry = 'Войдите снова — после входа откроется та же страница.';
  const html = await renderRoute('/login?return=%2Fapp%2Fsettings&expired=1', {
    session: { status: 'anonymous', expired: true, notice: unknownChange },
  });
  const plain = text(html);
  assert.ok(plain.includes('Результат изменения пароля неизвестен'));
  assert.ok(html.includes('value="m.belova"'));
  assert.ok(!plain.includes('Сессия завершена'));
  assert.ok(!plain.includes(plainExpiry));
  const changed = text(
    await renderRoute('/login?expired=1', {
      session: {
        status: 'anonymous',
        expired: true,
        notice: { kind: 'password-changed', login: 'm.belova' },
      },
    }),
  );
  assert.ok(changed.includes('Пароль изменён'));
  assert.ok(!changed.includes('Сессия завершена'));
  assert.ok(!changed.includes(plainExpiry));
  const bare = text(
    await renderRoute('/login?expired=1', {
      session: { status: 'anonymous', expired: true },
    }),
  );
  assert.ok(bare.includes('Сессия завершена'));
  assert.ok(bare.includes(plainExpiry));
});
