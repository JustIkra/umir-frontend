import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  createSessionCheck,
  sessionCheckPath,
} from '../../src/adapters/http/session-check.ts';

function recordingSend(answer) {
  const calls = [];
  const send = (path, init) => {
    calls.push({ path, init });
    return answer();
  };
  return { calls, send };
}

test('the profile status tells the session state', async () => {
  for (const [status, expected] of [
    [200, 'active'],
    [401, 'ended'],
    [500, 'unknown'],
    [502, 'unknown'],
    [503, 'unknown'],
  ]) {
    const { send } = recordingSend(() => Promise.resolve({ status }));
    assert.equal(
      await createSessionCheck(send).check(),
      expected,
      String(status),
    );
  }
});

test('a network error leaves the session state unknown', async () => {
  const { send } = recordingSend(() =>
    Promise.reject(new TypeError('Failed to fetch')),
  );
  assert.equal(await createSessionCheck(send).check(), 'unknown');
});

test('the check is a background read of the operator profile', async () => {
  const { calls, send } = recordingSend(() => Promise.resolve({ status: 200 }));
  await createSessionCheck(send).check();
  assert.equal(sessionCheckPath, '/api/operator/me');
  assert.deepEqual(calls, [
    {
      path: '/api/operator/me',
      init: { method: 'GET', headers: { 'X-Umir-Activity': 'background' } },
    },
  ]);
});
