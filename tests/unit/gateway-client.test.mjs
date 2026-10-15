import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError } from '../../src/application/api.ts';
import { createGatewayClient } from '../../src/adapters/http/gateway-client.ts';

const json = (status, body) =>
  new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('a scoped read passes cancellation to the actual fetch', async () => {
  const controller = new AbortController();
  let signal;
  const client = createGatewayClient(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        signal = init.signal;
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      }),
  );
  const pending = client.read('/api/v2/r/scoped/warehouse/inventory', {
    background: true,
    signal: controller.signal,
  });
  controller.abort();
  assert.equal((await failureOf(pending)).code, 'Transport');
  assert.equal(signal, controller.signal);
});

const refusal = (status, code, outcome, extra = {}) =>
  json(status, { code, outcome, message: code, retryable: false, ...extra });

function fakeFetch(...answers) {
  const calls = [];
  const fetch = (url, init) => {
    calls.push({ url, init });
    const answer = answers.shift();
    if (answer === undefined) throw new Error(`unexpected ${url}`);
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer);
  };
  return { fetch, calls };
}

const failureOf = async (promise) => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiError, String(error));
    return error.failure;
  }
  throw new Error('the request did not fail');
};

test('a read is a GET that sends no activity header', async () => {
  const { fetch, calls } = fakeFetch(json(200, { ok: true }));
  const client = createGatewayClient(fetch);
  assert.deepEqual(await client.read('/api/v2/me', { background: false }), {
    ok: true,
  });
  assert.equal(calls[0].url, '/api/v2/me');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[0].init.headers['X-Umir-Activity'], undefined);
});

test('a background read sends X-Umir-Activity: background', async () => {
  const { fetch, calls } = fakeFetch(json(200, {}));
  await createGatewayClient(fetch).read('/api/v2/me', { background: true });
  assert.equal(calls[0].init.headers['X-Umir-Activity'], 'background');
});

test('a refused read rejects with the decoded contract failure', async () => {
  const { fetch } = fakeFetch(
    refusal(503, 'RuntimeNotReady', 'unavailable', { retryable: true }),
  );
  const failure = await failureOf(
    createGatewayClient(fetch).read('/api/v2/r/x/serving/menu', {
      background: false,
    }),
  );
  assert.equal(failure.status, 503);
  assert.equal(failure.code, 'RuntimeNotReady');
  assert.equal(failure.outcome, 'unavailable');
});

test('a lost answer is unavailable for a read and unknown for a write', async () => {
  const read = fakeFetch(new TypeError('Failed to fetch'));
  const readFailure = await failureOf(
    createGatewayClient(read.fetch).read('/api/v2/me', { background: false }),
  );
  assert.deepEqual(
    [readFailure.status, readFailure.code, readFailure.outcome],
    [0, 'Transport', 'unavailable'],
  );
  const write = fakeFetch(new TypeError('Failed to fetch'));
  const client = createGatewayClient(write.fetch);
  client.setCsrfToken('t');
  const writeFailure = await failureOf(
    client.send('POST', '/api/v2/session', { body: {} }),
  );
  assert.deepEqual(
    [writeFailure.code, writeFailure.outcome],
    ['Transport', 'unknown'],
  );
});

test('an answer outside the contract is malformed with the method outcome', async () => {
  const html = new Response('<html>502</html>', { status: 502 });
  const { fetch } = fakeFetch(html);
  const failure = await failureOf(
    createGatewayClient(fetch).read('/api/v2/me', { background: false }),
  );
  assert.deepEqual(
    [failure.status, failure.code, failure.outcome],
    [502, 'Malformed', 'unavailable'],
  );
  const noRetryable = fakeFetch(
    json(502, {
      code: 'UpstreamUnavailable',
      message: 'm',
      outcome: 'unknown',
    }),
  );
  const client = createGatewayClient(noRetryable.fetch);
  client.setCsrfToken('t');
  const writeFailure = await failureOf(
    client.send('POST', '/api/v2/session', { body: {} }),
  );
  assert.deepEqual(
    [writeFailure.code, writeFailure.outcome],
    ['Malformed', 'unknown'],
  );
});

test('the first write fetches the CSRF token, then sends JSON with it', async () => {
  const { fetch, calls } = fakeFetch(
    json(200, { csrfToken: 'anon-1' }),
    json(200, { done: true }),
  );
  const client = createGatewayClient(fetch);
  const result = await client.send('POST', '/api/v2/r/x/warehouse/products', {
    body: { commandID: 'c1', name: 'Мука' },
    epoch: 'e1',
  });
  assert.deepEqual(result, { done: true });
  assert.equal(calls[0].url, '/api/v2/csrf');
  assert.equal(calls[0].init.method, 'GET');
  const sent = calls[1].init;
  assert.equal(sent.method, 'POST');
  assert.equal(sent.headers['X-CSRF-Token'], 'anon-1');
  assert.equal(sent.headers['Content-Type'], 'application/json');
  assert.equal(sent.headers['X-Umir-Runtime-Epoch'], 'e1');
  assert.equal(sent.body, '{"commandID":"c1","name":"Мука"}');
});

test('a known token is used without a CSRF read; 204 resolves to undefined', async () => {
  const { fetch, calls } = fakeFetch(new Response(null, { status: 204 }));
  const client = createGatewayClient(fetch);
  client.setCsrfToken('session-1');
  assert.equal(await client.send('DELETE', '/api/v2/session'), undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers['X-CSRF-Token'], 'session-1');
  assert.equal(calls[0].init.headers['Content-Type'], undefined);
  assert.equal(calls[0].init.body, undefined);
});

test('InvalidCsrfToken refreshes the token and resends once', async () => {
  const { fetch, calls } = fakeFetch(
    refusal(403, 'InvalidCsrfToken', 'not_committed'),
    json(200, { csrfToken: 'fresh' }),
    json(200, { ok: true }),
  );
  const client = createGatewayClient(fetch);
  client.setCsrfToken('stale');
  assert.deepEqual(
    await client.send('POST', '/api/v2/session', { body: { a: 1 } }),
    {
      ok: true,
    },
  );
  assert.deepEqual(
    calls.map((call) => [call.url, call.init.headers['X-CSRF-Token']]),
    [
      ['/api/v2/session', 'stale'],
      ['/api/v2/csrf', undefined],
      ['/api/v2/session', 'fresh'],
    ],
  );
});

test('a second InvalidCsrfToken is returned, not retried again', async () => {
  const { fetch, calls } = fakeFetch(
    refusal(403, 'InvalidCsrfToken', 'not_committed'),
    json(200, { csrfToken: 'fresh' }),
    refusal(403, 'InvalidCsrfToken', 'not_committed'),
  );
  const client = createGatewayClient(fetch);
  client.setCsrfToken('stale');
  const failure = await failureOf(
    client.send('POST', '/api/v2/session', { body: {} }),
  );
  assert.equal(failure.code, 'InvalidCsrfToken');
  assert.equal(calls.length, 3);
});

test('a 2xx write whose body is not JSON has an unknown outcome', async () => {
  const { fetch } = fakeFetch(new Response('{', { status: 200 }));
  const client = createGatewayClient(fetch);
  client.setCsrfToken('t');
  const failure = await failureOf(
    client.send('POST', '/api/v2/session', { body: {} }),
  );
  assert.deepEqual([failure.code, failure.outcome], ['Malformed', 'unknown']);
});

test('clearing the token makes the next write read a new one', async () => {
  const { fetch, calls } = fakeFetch(
    json(200, { csrfToken: 'again' }),
    json(200, {}),
  );
  const client = createGatewayClient(fetch);
  client.setCsrfToken('old');
  client.clearCsrfToken();
  await client.send('POST', '/api/v2/session', { body: {} });
  assert.equal(calls[0].url, '/api/v2/csrf');
  assert.equal(calls[1].init.headers['X-CSRF-Token'], 'again');
});
