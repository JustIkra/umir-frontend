import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  acceptMessage,
  createInviteLoader,
} from '../../src/presentation/invite/invite-page.tsx';
import { NotFound } from '../../src/presentation/documents/not-found-page.tsx';
import {
  INVITATION,
  NOW,
  ORG,
  R,
  activeSession,
  fakeServices,
  h1,
  hrefs,
  inviteSnapshot,
  labels,
  readyAccess,
  renderRoute,
  sampleRestaurant,
  text,
} from './support/render-route.mjs';

const anonymous = { status: 'anonymous', expired: false };
const path = `/invite/${INVITATION}`;
const page = (invite, options = {}) =>
  renderRoute(path, { session: anonymous, invite, ...options });
const pageText = async (invite, options) => text(await page(invite, options));
const code = (overrides = {}) =>
  inviteSnapshot({
    step: 'code',
    invitationID: INVITATION,
    expiresAtMs: NOW + 600_000,
    resendAtMs: NOW + 59_000,
    ...overrides,
  });

test('acceptMessage words every notice of the invitee', () => {
  const message = (notice) => acceptMessage(notice, NOW);
  assert.deepEqual(message({ kind: 'wrong-code' }), {
    tone: 'error',
    title: 'Неверный код',
    text: 'Проверьте код из последнего письма.',
  });
  assert.equal(message({ kind: 'locked' }).title, 'Код заблокирован');
  assert.equal(message({ kind: 'expired' }).title, 'Срок действия кода истёк');
  assert.deepEqual(message({ kind: 'resent' }).tone, 'success');
  assert.equal(message({ kind: 'resent' }).title, 'Новый код отправлен');
  assert.equal(
    message({ kind: 'proof-expired' }).title,
    'Подтверждение устарело',
  );
  assert.equal(
    message({ kind: 'unavailable' }).title,
    'Приглашение временно недоступно',
  );
  assert.deepEqual(message({ kind: 'invitation-closed' }), {
    tone: 'error',
    title: 'Приглашение недействительно',
    text: 'Срок приглашения истёк, его отменили или уже приняли. Попросите администратора организации отправить новое.',
  });
  assert.deepEqual(message({ kind: 'scope-closed' }), {
    tone: 'error',
    title: 'Приглашение недоступно',
    text: 'Организация или ресторан из приглашения сейчас недоступны. Обратитесь к администратору организации.',
  });
  assert.deepEqual(message({ kind: 'email-taken' }), {
    tone: 'error',
    title: 'Учётная запись уже есть',
    text: 'Пользователь с почтой из приглашения уже зарегистрирован. Войдите и примите приглашение.',
  });
  assert.deepEqual(message({ kind: 'other-email' }), {
    tone: 'error',
    title: 'Приглашение отправлено на другую почту',
    text: 'Почта этой учётной записи не совпадает с почтой из приглашения. Войдите учётной записью, на почту которой пришло письмо.',
  });
  assert.deepEqual(message({ kind: 'not-accepted' }), {
    tone: 'error',
    title: 'Приглашение не принято',
    text: 'Учётная запись уже состоит в этой организации или почта из приглашения принадлежит другой учётной записи.',
  });
});

test('acceptMessage counts a wait down and leaves field and lost-answer notices', () => {
  const limited = { kind: 'limited', untilMs: NOW + 45_000 };
  const shown = acceptMessage(limited, NOW);
  assert.equal(shown.title, 'Отправка кода временно ограничена');
  assert.ok(shown.text.includes('через 45 с.'));
  assert.equal(acceptMessage(limited, NOW + 45_000), undefined);
  assert.equal(acceptMessage(undefined, NOW), undefined);
  assert.equal(acceptMessage({ kind: 'code-format' }, NOW), undefined);
  assert.equal(
    acceptMessage(
      { kind: 'fields', name: 'required', password: undefined },
      NOW,
    ),
    undefined,
  );
  assert.equal(
    acceptMessage({ kind: 'unknown', action: 'verify' }, NOW),
    undefined,
  );
});

test('a guest sees the registration form of the invitation', async () => {
  const html = await page(inviteSnapshot());
  assert.equal(h1(html), 'Приглашение в «Ровный ход»');
  assert.deepEqual(labels(html).slice(0, 3), [
    'Имя',
    'Пароль',
    'Повторите пароль',
  ]);
  const plain = text(html);
  assert.ok(
    plain.includes(
      'Вас пригласили в организацию. Чтобы принять приглашение, создайте учётную запись: укажите имя и пароль, затем подтвердите почту кодом из письма.',
    ),
  );
  assert.ok(plain.includes('Получить код'));
  assert.ok(plain.includes('Уже есть учётная запись? Войти'));
  assert.ok(
    html.includes('autoComplete="name"') ||
      html.includes('autocomplete="name"'),
  );
  assert.ok(hrefs(html).includes(`/login?return=%2Finvite%2F${INVITATION}`));
});

test('the page keeps the referrer to itself and loads nothing outside', async () => {
  const html = await page(inviteSnapshot());
  assert.ok(html.includes('name="referrer"'));
  assert.ok(html.includes('content="no-referrer"'));
  assert.ok(!/(src|href)="https?:/.test(html));
});

test('the registration form shows the faults of its fields', async () => {
  const plain = await pageText(
    inviteSnapshot({
      notice: {
        kind: 'fields',
        name: 'length',
        password: 'required',
        repeat: 'mismatch',
      },
    }),
  );
  assert.ok(plain.includes('Нужно от 2 до 80 символов.'));
  assert.ok(plain.includes('Введите пароль'));
  assert.ok(plain.includes('Пароли не совпадают.'));
});

test('the fields with a fault are marked invalid, the others are not', async () => {
  const input = (html, id) =>
    new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? '';
  const faulty = await page(
    inviteSnapshot({
      notice: {
        kind: 'fields',
        name: 'length',
        password: 'required',
        repeat: 'mismatch',
      },
    }),
  );
  for (const id of ['invite-name', 'invite-password', 'invite-repeat']) {
    assert.match(input(faulty, id), /aria-invalid="true"/, id);
  }
  const fine = await page(
    inviteSnapshot({
      notice: { kind: 'fields', name: undefined, password: 'length' },
    }),
  );
  assert.ok(!input(fine, 'invite-name').includes('aria-invalid'));
  assert.match(input(fine, 'invite-password'), /aria-invalid="true"/);
  assert.ok(!input(fine, 'invite-repeat').includes('aria-invalid'));
});

test('a signed-in user gets the code for the invitation straight away', async () => {
  const html = await renderRoute(path, { session: activeSession });
  const plain = text(html);
  assert.ok(
    plain.includes(
      'Вы вошли как Марина Белова. Код подтверждения придёт на почту, указанную в приглашении.',
    ),
  );
  assert.ok(plain.includes('Получить код'));
  assert.ok(plain.includes('Войти другой учётной записью'));
  assert.ok(!labels(html).includes('Имя'));
});

test('the start step shows the refusals of the code request', async () => {
  const closed = await pageText(
    inviteSnapshot({ notice: { kind: 'invitation-closed' } }),
  );
  assert.ok(closed.includes('Приглашение недействительно'));
  const taken = await page(inviteSnapshot({ notice: { kind: 'email-taken' } }));
  assert.ok(text(taken).includes('Учётная запись уже есть'));
  assert.ok(hrefs(taken).includes(`/login?return=%2Finvite%2F${INVITATION}`));
  const other = await pageText(
    inviteSnapshot({ notice: { kind: 'other-email' } }),
    {
      session: activeSession,
    },
  );
  assert.ok(other.includes('Приглашение отправлено на другую почту'));
  assert.equal(other.split('Войти другой учётной записью').length - 1, 1);
  const unknown = await pageText(
    inviteSnapshot({ notice: { kind: 'unknown', action: 'begin' } }),
  );
  assert.ok(unknown.includes('Результат запроса кода неизвестен'));
  assert.ok(unknown.includes('Проверить результат'));
});

test('the code step asks for the code of the email', async () => {
  const html = await page(code());
  assert.equal(h1(html), 'Введите код из письма');
  const plain = text(html);
  assert.ok(
    plain.includes(
      'Код отправлен на почту, указанную в приглашении. Он действует 10 минут.',
    ),
  );
  assert.ok(labels(html).includes('Код из письма'));
  assert.ok(plain.includes('Подтвердить'));
  assert.ok(plain.includes('Отправить код повторно можно через 0:59'));
});

test('the code step offers the resend once the wait is over', async () => {
  const html = await page(code({ resendAtMs: NOW }));
  const plain = text(html);
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

test('the details step completes the registration or the acceptance', async () => {
  const register = await page(
    code({ step: 'details', displayName: 'Анна Смирнова' }),
  );
  assert.equal(h1(register), 'Завершите регистрацию');
  assert.deepEqual(labels(register).slice(0, 3), [
    'Имя',
    'Пароль',
    'Повторите пароль',
  ]);
  assert.ok(register.includes('value="Анна Смирнова"'));
  assert.ok(text(register).includes('Создать учётную запись'));
  const accept = await renderRoute(path, {
    session: activeSession,
    invite: code({ step: 'details', mode: 'accept' }),
  });
  assert.ok(text(accept).includes('Принять приглашение'));
  assert.ok(!labels(accept).includes('Имя'));
});

const preparing = sampleRestaurant({
  restaurantID: '99999999-9999-4999-8999-999999999999',
  name: 'На Тверской',
  lifecycle: 'registering',
});

test('the result lists the restaurants of the organization with their roles', async () => {
  const html = await renderRoute(path, {
    session: activeSession,
    access: readyAccess([sampleRestaurant(), preparing]),
    invite: inviteSnapshot({
      step: 'done',
      mode: 'accept',
      membership: { orgID: ORG },
    }),
  });
  assert.equal(h1(html), 'Приглашение принято');
  const plain = text(html);
  assert.ok(plain.includes('На Пушкинской'));
  assert.ok(plain.includes('Склад, Официант'));
  assert.ok(hrefs(html).includes(`/app/r/${R}`));
  assert.ok(plain.includes('На Тверской'));
  assert.ok(plain.includes('Подготавливается'));
  assert.ok(
    !hrefs(html).includes('/app/r/99999999-9999-4999-8999-999999999999'),
  );
  assert.ok(hrefs(html).includes('/app'));
  assert.ok(plain.includes('Перейти к работе'));
});

test('the result of a registration says the account was created', async () => {
  const html = await renderRoute(path, {
    session: activeSession,
    invite: inviteSnapshot({ step: 'done', mode: 'register' }),
  });
  const plain = text(html);
  assert.equal(h1(html), 'Приглашение принято');
  assert.ok(plain.includes('Учётная запись создана.'));
  assert.ok(hrefs(html).includes(`/app/r/${R}`));
});

test('a malformed invitation id shows the 404 page', async () => {
  const html = await renderRoute('/invite/not-a-uuid');
  assert.equal(h1(html), 'Страница не найдена');
});

test('the loader opens the invitation in the mode of the session', async () => {
  const opened = [];
  const open = (...args) => opened.push(args);
  const load = async (session, id = INVITATION) => {
    const services = fakeServices({ session });
    services.invitationAcceptance.open = open;
    return createInviteLoader(services)({ params: { invitationID: id } });
  };
  await load(anonymous);
  await load(activeSession);
  assert.deepEqual(opened, [
    [INVITATION, 'register'],
    [INVITATION, 'accept'],
  ]);
  await assert.rejects(load(anonymous, 'not-a-uuid'), NotFound);
  assert.equal(opened.length, 2);
});
