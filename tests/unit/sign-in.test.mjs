import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { localFailure } from '../../src/application/api.ts';
import { signInMessage } from '../../src/presentation/auth/sign-in-page.tsx';

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
