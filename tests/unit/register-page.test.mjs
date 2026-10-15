import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  createRegisterLoader,
  registerMessage,
} from '../../src/presentation/register/register-page.tsx';
import {
  NOW,
  activeSession,
  fakeServices,
  h1,
  hrefs,
  labels,
  redirectOf,
  registerSnapshot,
  renderRoute,
  text,
} from './support/render-route.mjs';

const anonymous = { status: 'anonymous', expired: false };
const page = (register, options = {}) =>
  renderRoute('/register', { session: anonymous, register, ...options });
const pageText = async (register, options) =>
  text(await page(register, options));
const code = (overrides = {}) =>
  registerSnapshot({
    step: 'code',
    email: 'i.kovaleva@example.test',
    displayName: 'Ирина Ковалёва',
    expiresAtMs: NOW + 600_000,
    resendAtMs: NOW + 59_000,
    ...overrides,
  });
const input = (html, id) =>
  new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? '';

test('registerMessage words the notices of the registration', () => {
  const message = (notice) => registerMessage(notice, NOW);
  assert.deepEqual(message({ kind: 'closed' }), {
    tone: 'error',
    title: 'Регистрация недоступна',
    text: 'Сейчас создать учётную запись нельзя. Доступ предоставляет администратор организации по приглашению.',
  });
  assert.deepEqual(message({ kind: 'email-taken' }), {
    tone: 'error',
    title: 'Учётная запись уже есть',
    text: 'Пользователь с этой почтой уже зарегистрирован. Войдите или восстановите пароль.',
  });
  assert.deepEqual(message({ kind: 'wrong-code' }), {
    tone: 'error',
    title: 'Неверный код',
    text: 'Проверьте код из последнего письма.',
  });
  assert.equal(message({ kind: 'locked' }).title, 'Код заблокирован');
  assert.equal(message({ kind: 'expired' }).title, 'Срок действия кода истёк');
  assert.equal(message({ kind: 'resent' }).tone, 'success');
  assert.equal(message({ kind: 'resent' }).title, 'Новый код отправлен');
  assert.equal(
    message({ kind: 'proof-expired' }).title,
    'Подтверждение устарело',
  );
  assert.deepEqual(message({ kind: 'not-sent' }), {
    tone: 'error',
    title: 'Код не отправлен',
    text: 'Сервис не принял запрос нового кода. Повторите попытку через несколько минут.',
  });
  assert.equal(
    message({ kind: 'unavailable' }).title,
    'Регистрация временно недоступна',
  );
});

test('registerMessage counts a wait down and leaves field and lost-answer notices', () => {
  const limited = { kind: 'limited', untilMs: NOW + 45_000 };
  const shown = registerMessage(limited, NOW);
  assert.equal(shown.title, 'Отправка кода временно ограничена');
  assert.ok(shown.text.includes('через 45 с.'));
  assert.equal(registerMessage(limited, NOW + 45_000), undefined);
  assert.equal(registerMessage(undefined, NOW), undefined);
  assert.equal(registerMessage({ kind: 'code-format' }, NOW), undefined);
  assert.equal(registerMessage({ kind: 'consent' }, NOW), undefined);
  assert.equal(
    registerMessage({ kind: 'unknown', action: 'verify' }, NOW),
    undefined,
  );
  assert.equal(
    registerMessage({ kind: 'fields', name: 'required' }, NOW),
    undefined,
  );
});

test('a guest sees the registration form', async () => {
  const html = await page(registerSnapshot());
  assert.equal(h1(html), 'Регистрация в «Ровном ходе»');
  assert.deepEqual(labels(html).slice(0, 4), [
    'Имя',
    'Почта',
    'Пароль',
    'Повторите пароль',
  ]);
  const plain = text(html);
  assert.ok(
    plain.includes(
      'Создайте учётную запись: укажите имя, почту и пароль. Почту подтвердит код из письма.',
    ),
  );
  assert.ok(plain.includes('Даю согласие на обработку персональных данных'));
  assert.ok(plain.includes('Текст согласия'));
  assert.ok(plain.includes('Политика конфиденциальности'));
  assert.ok(plain.includes('Получить код'));
  assert.ok(plain.includes('Уже есть учётная запись? Войти'));
  assert.ok(plain.includes('От 8 до 32 символов.'));
  const links = hrefs(html);
  for (const href of ['/consent', '/privacy', '/login']) {
    assert.ok(links.includes(href), href);
  }
  assert.match(input(html, 'register-name'), /autoComplete="name"/i);
  const email = input(html, 'register-email');
  assert.match(email, /type="email"/);
  assert.match(email, /autoComplete="email"/i);
  assert.match(
    input(html, 'register-password'),
    /autoComplete="new-password"/i,
  );
  assert.match(input(html, 'register-repeat'), /autoComplete="new-password"/i);
  assert.match(input(html, 'register-consent'), /type="checkbox"/);
  assert.ok(!html.includes('name="referrer"'));
});

test('the form keeps the typed name and email', async () => {
  const html = await page(
    registerSnapshot({
      displayName: 'Ирина Ковалёва',
      email: 'i.kovaleva@example.test',
    }),
  );
  assert.ok(html.includes('value="Ирина Ковалёва"'));
  assert.ok(html.includes('value="i.kovaleva@example.test"'));
});

test('a signed-in user is sent to the app', async () => {
  assert.equal(
    await redirectOf('/register', { session: activeSession }),
    '/app',
  );
  assert.equal(
    await redirectOf('/register', { session: anonymous }),
    undefined,
  );
});

test('the loader redirects only an active session', async () => {
  const load = (session) => createRegisterLoader(fakeServices({ session }))();
  const redirected = await load(activeSession);
  assert.equal(redirected.status, 302);
  assert.equal(redirected.headers.get('Location'), '/app');
  assert.equal(await load(anonymous), null);
});

test('the form shows the faults of its fields', async () => {
  const faulty = await page(
    registerSnapshot({
      notice: {
        kind: 'fields',
        name: 'length',
        email: 'format',
        password: 'required',
        repeat: 'mismatch',
      },
    }),
  );
  const plain = text(faulty);
  assert.ok(plain.includes('Нужно от 2 до 80 символов.'));
  assert.ok(plain.includes('Проверьте адрес почты.'));
  assert.ok(plain.includes('Введите пароль'));
  assert.ok(plain.includes('Пароли не совпадают.'));
  for (const id of [
    'register-name',
    'register-email',
    'register-password',
    'register-repeat',
  ]) {
    assert.match(input(faulty, id), /aria-invalid="true"/, id);
  }
  const required = text(
    await page(
      registerSnapshot({
        notice: {
          kind: 'fields',
          name: 'required',
          email: 'required',
          password: undefined,
          repeat: undefined,
        },
      }),
    ),
  );
  assert.ok(required.includes('Введите имя'));
  assert.ok(required.includes('Введите почту'));
  const fine = await page(
    registerSnapshot({
      notice: {
        kind: 'fields',
        name: undefined,
        email: undefined,
        password: 'length',
        repeat: undefined,
      },
    }),
  );
  assert.ok(!input(fine, 'register-name').includes('aria-invalid'));
  assert.ok(!input(fine, 'register-email').includes('aria-invalid'));
  assert.match(input(fine, 'register-password'), /aria-invalid="true"/);
  assert.ok(!input(fine, 'register-repeat').includes('aria-invalid'));
});

test('the consent fault sits at the checkbox', async () => {
  const html = await page(registerSnapshot({ notice: { kind: 'consent' } }));
  assert.ok(
    text(html).includes(
      'Подтвердите согласие на обработку персональных данных',
    ),
  );
  assert.match(input(html, 'register-consent'), /aria-invalid="true"/);
  const fine = await page(registerSnapshot());
  assert.ok(!input(fine, 'register-consent').includes('aria-invalid'));
});

test('the form shows the refusals of the code request', async () => {
  const closed = await pageText(
    registerSnapshot({ notice: { kind: 'closed' } }),
  );
  assert.ok(closed.includes('Регистрация недоступна'));
  assert.ok(closed.includes('Доступ предоставляет администратор организации'));
  const taken = await page(
    registerSnapshot({ notice: { kind: 'email-taken' } }),
  );
  assert.ok(text(taken).includes('Учётная запись уже есть'));
  assert.ok(hrefs(taken).includes('/password-reset'));
  assert.ok(hrefs(taken).filter((href) => href === '/login').length >= 2);
  const unknown = await pageText(
    registerSnapshot({ notice: { kind: 'unknown', action: 'begin' } }),
  );
  assert.ok(unknown.includes('Результат запроса кода неизвестен'));
  assert.ok(unknown.includes('Проверить результат'));
  const limited = await pageText(
    registerSnapshot({ notice: { kind: 'limited', untilMs: NOW + 30_000 } }),
  );
  assert.ok(limited.includes('Отправка кода временно ограничена'));
});

test('the code step asks for the code of the email', async () => {
  const html = await page(code());
  assert.equal(h1(html), 'Введите код из письма');
  const plain = text(html);
  assert.ok(
    plain.includes(
      'Если для адреса i.kovaleva@example.test ещё нет учётной записи, на него отправлен код. Он действует 10 минут. Уже зарегистрированы? Войдите или восстановите пароль.',
    ),
  );
  const links = hrefs(html);
  assert.ok(links.includes('/login'));
  assert.ok(links.includes('/password-reset'));
  assert.ok(labels(html).includes('Код из письма'));
  assert.ok(plain.includes('Подтвердить'));
  assert.ok(plain.includes('Отправить код повторно можно через 0:59'));
});

test('the code step offers the resend once the wait is over', async () => {
  const plain = await pageText(code({ resendAtMs: NOW }));
  assert.ok(plain.includes('Отправить код повторно'));
  assert.ok(!plain.includes('можно через'));
});

test('the code step turns into «expired» at the expiry time', async () => {
  const plain = await pageText(code({ expiresAtMs: NOW - 1 }));
  assert.ok(plain.includes('Срок действия кода истёк'));
  assert.ok(plain.includes('Получить новый код'));
  const locked = await pageText(code({ notice: { kind: 'locked' } }));
  assert.ok(locked.includes('Код заблокирован'));
  assert.ok(locked.includes('Получить новый код'));
  const wrong = await pageText(code({ notice: { kind: 'wrong-code' } }));
  assert.ok(wrong.includes('Неверный код'));
  const format = await pageText(code({ notice: { kind: 'code-format' } }));
  assert.ok(format.includes('Введите 6 цифр из письма.'));
});

test('the details step asks for the name and the password again', async () => {
  const html = await page(
    code({ step: 'details', displayName: 'Анна Смирнова' }),
  );
  assert.equal(h1(html), 'Завершите регистрацию');
  assert.deepEqual(labels(html).slice(0, 3), [
    'Имя',
    'Пароль',
    'Повторите пароль',
  ]);
  assert.ok(!labels(html).includes('Почта'));
  assert.ok(html.includes('value="Анна Смирнова"'));
  assert.ok(text(html).includes('Создать учётную запись'));
  const lost = await pageText(
    code({
      step: 'details',
      notice: { kind: 'unknown', action: 'complete' },
    }),
  );
  assert.ok(lost.includes('Создание учётной записи не подтверждено'));
});

test('the result offers to create an enterprise', async () => {
  const html = await page(registerSnapshot({ step: 'done' }));
  assert.equal(h1(html), 'Учётная запись создана');
  const plain = text(html);
  assert.ok(
    plain.includes(
      'Вы вошли. Создайте своё предприятие или дождитесь приглашения от администратора организации.',
    ),
  );
  assert.ok(plain.includes('Создать предприятие'));
  assert.ok(plain.includes('Перейти к работе'));
  const links = hrefs(html);
  assert.ok(links.includes('/app/organizations/new'));
  assert.ok(links.includes('/app'));
});

test('the sign-in page links to the registration', async () => {
  const html = await renderRoute('/login', { session: anonymous });
  assert.ok(text(html).includes('Нет учётной записи? Зарегистрироваться'));
  assert.ok(hrefs(html).includes('/register'));
});

test('the code step tells a new code that was not taken', async () => {
  const plain = await pageText(code({ notice: { kind: 'not-sent' } }));
  assert.ok(plain.includes('Код не отправлен'));
  assert.ok(plain.includes('Сервис не принял запрос нового кода.'));
  assert.ok(plain.includes('Подтвердить'));
});
