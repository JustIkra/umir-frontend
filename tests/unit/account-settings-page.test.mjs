import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  emailNote,
  initialName,
  initialPassword,
  nameLocked,
  nameAfterCheck,
  nameMessage,
  passwordFieldText,
  passwordLocked,
  passwordMessage,
} from '../../src/presentation/app-shell/account-settings-page.tsx';
import {
  NOW,
  activeSession,
  renderRoute,
  text,
} from './support/render-route.mjs';

test('the profile comes from the session', async () => {
  const plain = text(await renderRoute('/app/settings'));
  assert.ok(plain.includes('m.belova'));
  assert.ok(plain.includes('m.belova@restoran.example'));
  assert.ok(plain.includes('Сюда приходит код для восстановления пароля.'));
  assert.ok(!plain.includes('Изменить почту может администратор организации'));
  assert.ok(plain.includes('Марина Белова'));
  assert.ok(plain.includes('Изменить имя'));
  assert.ok(plain.includes('Изменить пароль'));
});

test('an account without email says the password cannot be reset', async () => {
  const session = {
    ...activeSession,
    user: { ...activeSession.user, email: undefined },
  };
  const plain = text(await renderRoute('/app/settings', { session }));
  assert.ok(plain.includes('Не указана'));
  assert.ok(
    plain.includes(
      'Без почты пароль не восстановить. Обратитесь к администратору организации.',
    ),
  );
  assert.equal(
    emailNote('a@b.ru'),
    'Сюда приходит код для восстановления пароля.',
  );
});

test('the name messages follow S06–S10', () => {
  assert.equal(nameMessage({ kind: 'idle' }, 'Марина'), undefined);
  const storage = nameMessage(
    { kind: 'storage', code: 'AuthStorageUnavailable' },
    'Марина',
  );
  assert.equal(storage.title, 'Сервис учётных записей недоступен');
  assert.equal(
    storage.text,
    'Имя не подтверждено. Показано последнее подтверждённое имя — «Марина». Черновик остался в поле.',
  );
  assert.deepEqual(storage.action, {
    kind: 'check-name',
    label: 'Обновить данные профиля',
  });
  assert.equal(storage.details, 'AuthStorageUnavailable');
  assert.equal(
    nameMessage({ kind: 'checking' }, 'Марина').title,
    'Проверяем, сохранилось ли имя',
  );
  assert.equal(
    nameMessage({ kind: 'unchanged', serverName: 'Марина' }, 'Марина').text,
    'Сервер вернул прежнее имя — «Марина». Черновик остался в поле: сохраните его ещё раз, если нужно.',
  );
  assert.equal(
    nameMessage({ kind: 'unconfirmed', code: 'AuthUnavailable' }, 'Марина')
      .action.label,
    'Повторить чтение профиля',
  );
  assert.equal(
    nameMessage(
      { kind: 'recovering', code: 'AuthUpdateOutcomeUnknown' },
      'Марина',
    ).action.label,
    'Проверить доступность учётной записи',
  );
});

test('a profile read settles the name, or keeps S06 and S10 when it fails', () => {
  const user = { displayName: 'С сервера' };
  assert.equal(
    nameAfterCheck({ kind: 'checking' }, { kind: 'saved', user }),
    'saved',
  );
  assert.deepEqual(
    nameAfterCheck({ kind: 'checking' }, { kind: 'unchanged', user }),
    {
      kind: 'unchanged',
      serverName: 'С сервера',
    },
  );
  assert.deepEqual(
    nameAfterCheck({ kind: 'checking' }, { kind: 'unreadable', code: 'X' }),
    {
      kind: 'unconfirmed',
      code: 'X',
    },
  );
  const recovering = { kind: 'recovering', code: 'AuthUpdateOutcomeUnknown' };
  assert.equal(
    nameAfterCheck(recovering, { kind: 'unreadable', code: 'X' }),
    recovering,
  );
  const storage = { kind: 'storage', code: 'AuthStorageUnavailable' };
  assert.equal(
    nameAfterCheck(storage, { kind: 'unreadable', code: 'X' }),
    storage,
  );
});

test('the password messages follow S18–S22 and the field texts S14–S17', () => {
  assert.equal(
    passwordMessage({ kind: 'limited', untilMs: NOW + 30_000 }, NOW).text,
    'Повторите через 30 с.',
  );
  assert.equal(
    passwordMessage({ kind: 'limited', untilMs: NOW }, NOW),
    undefined,
  );
  assert.equal(
    passwordMessage({ kind: 'storage', code: 'AuthStorageUnavailable' }, NOW)
      .text,
    'Изменение пароля не подтверждено и повторно не отправляется. Сначала обновите данные профиля.',
  );
  assert.deepEqual(passwordMessage({ kind: 'unknown' }, NOW).action, {
    kind: 'sign-in-to-check',
    label: 'Войти с новым паролем',
  });
  assert.equal(
    passwordMessage(
      { kind: 'recovering', code: 'AuthUpdateOutcomeUnknown' },
      NOW,
    ).text,
    'Изменение пароля ещё не подтверждено. Не входите заново, пока доступ не восстановится.',
  );
  assert.equal(
    passwordMessage({ kind: 'checking' }, NOW).title,
    'Проверяем доступность учётной записи',
  );
  assert.deepEqual(passwordMessage({ kind: 'unchanged' }, NOW), {
    tone: 'info',
    title: 'Пароль не изменён',
    text: 'Изменение пароля не применилось. Повторите изменение.',
  });
  assert.deepEqual(passwordFieldText, {
    'current-required': 'Введите текущий пароль',
    'current-wrong': 'Текущий пароль указан неверно.',
    'new-length': 'Нужно от 8 до 32 символов.',
    'new-rejected': 'Пароль должен содержать от 8 до 32 символов.',
    mismatch: 'Пароли не совпадают.',
  });
});

const nameKinds = [
  { kind: 'idle' },
  { kind: 'invalid' },
  { kind: 'saving' },
  { kind: 'storage', code: 'X' },
  { kind: 'checking' },
  { kind: 'unchanged', serverName: 'A' },
  { kind: 'unconfirmed', code: 'X' },
  { kind: 'recovering', code: 'X' },
];

test('the name is locked while the outcome is unknown or being read', () => {
  assert.deepEqual(
    nameKinds.map((status) => [status.kind, nameLocked(status)]),
    [
      ['idle', false],
      ['invalid', false],
      ['saving', false],
      ['storage', false],
      ['checking', true],
      ['unchanged', false],
      ['unconfirmed', true],
      ['recovering', true],
    ],
  );
});

test('the password fields are locked while the outcome is unknown or refused by storage', () => {
  const kinds = [
    ['idle', false],
    ['saving', false],
    ['invalid', false],
    ['limited', false],
    ['storage', true],
    ['unknown', true],
    ['recovering', true],
    ['checking', true],
    ['unchanged', false],
  ];
  for (const [kind, locked] of kinds) {
    assert.equal(passwordLocked({ kind }), locked, kind);
  }
});

test('a pending change opens the page in its unknown state', () => {
  assert.deepEqual(initialName({ name: undefined, password: undefined }), {
    editing: false,
    draft: '',
    status: { kind: 'idle' },
  });
  assert.deepEqual(initialName({ name: 'Новое имя', password: undefined }), {
    editing: true,
    draft: 'Новое имя',
    status: { kind: 'unconfirmed', code: 'AttemptPending' },
  });
  assert.deepEqual(initialPassword({ name: undefined, password: undefined }), {
    kind: 'idle',
  });
  assert.deepEqual(initialPassword({ name: undefined, password: 'unknown' }), {
    kind: 'unknown',
  });
  assert.deepEqual(
    initialPassword({ name: undefined, password: 'recovering' }),
    {
      kind: 'recovering',
      code: 'AuthUpdateOutcomeUnknown',
    },
  );
});

test('the page keeps a pending name closed', async () => {
  const plain = text(
    await renderRoute('/app/settings', {
      pending: { name: 'Новое имя', password: undefined },
    }),
  );
  assert.ok(plain.includes('Результат сохранения неизвестен'));
  const html = await renderRoute('/app/settings', {
    pending: { name: 'Новое имя', password: undefined },
  });
  assert.match(html, /<input[^>]*id="settings-name"[^>]*disabled/);
});

test('the page keeps a pending password closed', async () => {
  const plain = text(
    await renderRoute('/app/settings', {
      pending: { name: undefined, password: 'unknown' },
    }),
  );
  assert.ok(plain.includes('Результат изменения пароля неизвестен'));
});

test('the leave dialog is as wide as the S11 frame, 600 px', async () => {
  const html = await renderRoute('/app/settings', {
    pending: { name: 'Новое имя', password: undefined },
  });
  const dialog = /<dialog[^>]*class="css-([^"\s]+)"/.exec(html);
  assert.ok(dialog, 'the dialog is rendered');
  const style = new RegExp(
    `<style data-emotion="css ${dialog[1]}">([\\s\\S]*?)</style>`,
  ).exec(html);
  assert.ok(style, 'the dialog has its own styles');
  assert.match(style[1], /@media \(min-width: [^)]+\)\{[^}]*width:37\.5rem;/);
});
