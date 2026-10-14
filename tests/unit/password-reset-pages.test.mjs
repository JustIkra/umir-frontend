import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  codeError,
  emailError,
  newPasswordErrors,
  resetMessage,
} from '../../src/presentation/auth/password-reset-pages.tsx';
import {
  NOW,
  h1,
  labels,
  redirectOf,
  renderRoute,
  resetSnapshot,
  text,
} from './support/render-route.mjs';

const email = 'm.belova@restoran.example';
const code = (overrides = {}) =>
  resetSnapshot({
    step: 'code',
    email,
    expiresAtMs: NOW + 600_000,
    resendAtMs: NOW + 59_000,
    ...overrides,
  });
const password = (overrides = {}) =>
  resetSnapshot({
    step: 'password',
    email,
    expiresAtMs: NOW + 600_000,
    resendAtMs: NOW,
    ...overrides,
  });
const page = async (path, reset) => text(await renderRoute(path, { reset }));

test('R01 asks for the email of the account', async () => {
  const html = await renderRoute('/password-reset');
  assert.equal(h1(html), 'Восстановление пароля');
  assert.ok(labels(html).includes('Почта'));
  assert.ok(!labels(html).includes('Логин'));
  const plain = text(html);
  assert.ok(
    plain.includes('Укажите почту учётной записи. Отправим на неё код.'),
  );
  assert.ok(plain.includes('Получить код'));
  assert.ok(
    plain.includes(
      'Нет доступа к почте — обратитесь к администратору организации.',
    ),
  );
});

test('R01 keeps the email after «Запросить новый код» and shows its refusals', async () => {
  const html = await renderRoute('/password-reset', {
    reset: resetSnapshot({ email }),
  });
  assert.ok(html.includes(`value="${email}"`));
  const notFound = await page(
    '/password-reset',
    resetSnapshot({ notice: { kind: 'not-found' } }),
  );
  assert.ok(notFound.includes('Учётной записи с такой почтой нет.'));
  const limited = await page(
    '/password-reset',
    resetSnapshot({ notice: { kind: 'limited', untilMs: NOW + 45_000 } }),
  );
  assert.ok(limited.includes('Отправка кода временно ограничена'));
  assert.ok(limited.includes('Повторить запрос можно через 45 с.'));
  const unknown = await page(
    '/password-reset',
    resetSnapshot({ notice: { kind: 'unknown', action: 'request' } }),
  );
  assert.ok(unknown.includes('Результат запроса неизвестен'));
  assert.ok(unknown.includes('Проверить результат'));
  const proof = await page(
    '/password-reset',
    resetSnapshot({ notice: { kind: 'proof-expired' } }),
  );
  assert.ok(proof.includes('Подтверждение устарело'));
});

test('R05 names the email and counts down to another code', async () => {
  const plain = await page('/password-reset/code', code());
  assert.ok(
    plain.includes(`Отправили код на ${email}. Код действует 10 минут.`),
  );
  assert.ok(plain.includes('Отправить код ещё раз можно через 0:59'));
  assert.ok(plain.includes('Указать другую почту'));
  const ready = await page(
    '/password-reset/code',
    code({ resendAtMs: NOW - 1 }),
  );
  assert.ok(ready.includes('Отправить код ещё раз'));
  assert.ok(!ready.includes('можно через'));
});

test('R05 states: wrong code, locked, expired, sent again', async () => {
  assert.ok(
    (
      await page(
        '/password-reset/code',
        code({ notice: { kind: 'wrong-code' } }),
      )
    ).includes('Неверный код.'),
  );
  const locked = await page(
    '/password-reset/code',
    code({ notice: { kind: 'locked' } }),
  );
  assert.ok(locked.includes('Код заблокирован'));
  assert.ok(locked.includes('Запросить новый код'));
  const expired = await page(
    '/password-reset/code',
    code({ expiresAtMs: NOW }),
  );
  assert.ok(expired.includes('Срок действия кода истёк'));
  assert.ok(!expired.includes('можно через'));
  assert.ok(
    (
      await page('/password-reset/code', code({ notice: { kind: 'resent' } }))
    ).includes('Новый код отправлен'),
  );
});

test('R08 says the new session starts at once and shows R09 and R11', async () => {
  const html = await renderRoute('/password-reset/new', { reset: password() });
  assert.equal(h1(html), 'Новый пароль');
  assert.ok(
    text(html).includes(
      'После сохранения прежние сеансы завершатся, и вы сразу войдёте с новым паролем.',
    ),
  );
  const fields = await page(
    '/password-reset/new',
    password({
      notice: {
        kind: 'password-fields',
        newPassword: 'length',
        repeat: 'mismatch',
      },
    }),
  );
  assert.ok(fields.includes('Нужно от 8 до 32 символов.'));
  assert.ok(fields.includes('Пароли не совпадают.'));
  const unknown = await page(
    '/password-reset/new',
    password({ notice: { kind: 'unknown', action: 'complete' } }),
  );
  assert.ok(unknown.includes('Сохранение пароля не подтверждено'));
  assert.ok(unknown.includes('Проверить результат'));
  assert.ok(unknown.includes('Перейти ко входу'));
});

test('the code and password steps open only on their own step', async () => {
  assert.equal(await redirectOf('/password-reset/code'), '/password-reset');
  assert.equal(await redirectOf('/password-reset/new'), '/password-reset');
  assert.equal(
    await redirectOf('/password-reset/new', { reset: code() }),
    '/password-reset/code',
  );
  assert.equal(
    await redirectOf('/password-reset/code', { reset: password() }),
    '/password-reset/new',
  );
  assert.equal(
    await redirectOf('/password-reset/code', { reset: code() }),
    undefined,
  );
});

test('texts of the notices', () => {
  assert.equal(emailError({ kind: 'email-required' }), 'Введите почту');
  assert.equal(emailError({ kind: 'invalid-email' }), 'Проверьте адрес почты.');
  assert.equal(codeError({ kind: 'code-format' }), 'Введите 6 цифр из письма.');
  assert.deepEqual(
    newPasswordErrors({
      kind: 'password-fields',
      newPassword: 'required',
      repeat: undefined,
    }),
    { newPassword: 'Введите новый пароль', repeat: undefined },
  );
  assert.equal(resetMessage({ kind: 'limited', untilMs: NOW }, NOW), undefined);
  assert.equal(
    resetMessage({ kind: 'unavailable' }, NOW).title,
    'Восстановление временно недоступно',
  );
  assert.equal(resetMessage(undefined, NOW), undefined);
});

test('R05 shows a refused renew of an expired code, not only the expiry', async () => {
  const limited = await renderRoute('/password-reset/code', {
    reset: code({
      expiresAtMs: NOW,
      notice: { kind: 'limited', untilMs: NOW + 45_000 },
    }),
  });
  assert.ok(text(limited).includes('Повторить запрос можно через 45 с.'));
  const button = /<button[^>]*>\s*Отправить код ещё раз\s*<\/button>/.exec(
    limited,
  );
  assert.ok(button, 'the resend button is rendered');
  assert.ok(/\bdisabled\b/.test(button[0]), 'the resend button is disabled');
  const unavailable = await page(
    '/password-reset/code',
    code({ expiresAtMs: NOW, notice: { kind: 'unavailable' } }),
  );
  assert.ok(unavailable.includes('Восстановление временно недоступно'));
});
