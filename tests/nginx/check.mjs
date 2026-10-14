// Checks the frontend Nginx API proxy against the gateway stand-in (gateway#8, gateway#10).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const port = Number(process.env.FRONTEND_PORT ?? 18090);
const R = '33333333-3333-4333-8333-333333333333';
const live = `/api/v2/r/${R}/live`;
const feedbackPaths = ['/api/v2/feedback/anonymous', `/api/v2/r/${R}/feedback`];

function send(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, method, path, headers },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString(),
          });
        });
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

async function recorded() {
  const response = await send('GET', '/api/__requests');
  assert.equal(response.status, 200, 'gateway stand-in is not reachable');
  return JSON.parse(response.body);
}

async function ready() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if (
        (await send('GET', '/healthz')).status === 200 &&
        (await send('GET', '/api/__requests')).status === 200
      ) {
        return;
      }
    } catch {
      // Nginx or the stand-in is still starting.
    }
    await sleep(500);
  }
  throw new Error('frontend did not become ready');
}

// Reads a response to the end and notes when each chunk arrived.
function stream(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const request = http.request(
      { host: '127.0.0.1', port, method: 'GET', path, headers },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => {
          chunks.push({ at: Date.now() - started, text: chunk.toString() });
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            chunks,
          });
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

function json(response) {
  assert.match(response.headers['content-type'] ?? '', /^application\/json/);
  return JSON.parse(response.body);
}

const checks = {
  'passes the browser Host with its port, Origin, cookies and CSRF header':
    async () => {
      const headers = {
        Host: 'umir.example.test:8443',
        Origin: 'https://umir.example.test:8443',
        Cookie: 'umir_operator_preauth=p; theme=dark',
        'X-CSRF-Token': 'token-1',
        'Content-Type': 'application/json',
      };
      assert.equal(
        (await send('POST', '/api/v2/session', { headers, body: '{}' })).status,
        200,
      );
      const last = (await recorded()).at(-1);
      assert.deepEqual(
        [last.host, last.origin, last.cookie, last.csrf],
        [headers.Host, headers.Origin, headers.Cookie, headers['X-CSRF-Token']],
      );
    },

  'passes the raw path and query': async () => {
    const target = `/api/v2/r/${R}/warehouse/dish?dishID=%D0%B0%2Fb&x=%zz;y`;
    assert.equal((await send('GET', target)).status, 200);
    assert.equal((await recorded()).at(-1).url, target);
  },

  'passes gateway errors and Set-Cookie unchanged': async () => {
    for (const status of [401, 502, 503, 504]) {
      const response = await send('GET', `/api/respond/${status}`);
      assert.equal(response.status, status);
      assert.equal(response.body, '{"from":"gateway"}');
      assert.deepEqual(response.headers['set-cookie'], [
        'umir_operator_session=s; Path=/; HttpOnly',
      ]);
    }
  },

  'sends every request to gateway without caching': async () => {
    const before = (await recorded()).length;
    await send('GET', `/api/v2/r/${R}/serving/menu`);
    await send('GET', `/api/v2/r/${R}/serving/menu`);
    assert.equal((await recorded()).length, before + 2);
  },

  'answers a lost gateway answer with an outcome and never retries':
    async () => {
      for (const [method, outcome] of [
        ['GET', 'unavailable'],
        ['POST', 'unknown'],
      ]) {
        const before = (await recorded()).filter(
          (r) => r.url === '/api/drop' && r.method === method,
        ).length;
        const response = await send(method, '/api/drop', {
          body: method === 'POST' ? '{}' : undefined,
        });
        assert.equal(response.status, 502);
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.deepEqual(json(response), {
          code: 'UpstreamUnavailable',
          message: 'gateway did not respond',
          outcome,
          retryable: true,
        });
        const after = (await recorded()).filter(
          (r) => r.url === '/api/drop' && r.method === method,
        ).length;
        assert.equal(after, before + 1, `${method} was retried`);
      }
    },

  'answers a body over the general limit with the JSON error envelope':
    async () => {
      const before = (await recorded()).length;
      const response = await send(
        'POST',
        `/api/v2/r/${R}/serving/order-proposals`,
        {
          body: 'x'.repeat(1024 * 1024 + 1),
        },
      );
      assert.equal(response.status, 413);
      assert.equal(json(response).code, 'PayloadTooLarge');
      assert.equal(
        (await recorded()).length,
        before,
        'the post reached gateway',
      );
    },

  'accepts a 16 KiB feedback post on both feedback routes': async () => {
    for (const path of feedbackPaths) {
      const response = await send('POST', path, {
        body: 'x'.repeat(16 * 1024),
      });
      assert.equal(response.status, 200, path);
      const last = (await recorded()).at(-1);
      assert.deepEqual([last.url, last.length], [path, 16 * 1024]);
    }
  },

  'answers a larger feedback post with the contract error': async () => {
    for (const path of feedbackPaths) {
      const before = (await recorded()).length;
      const response = await send('POST', path, {
        body: 'x'.repeat(16 * 1024 + 1),
      });
      assert.equal(response.status, 413, path);
      assert.equal(response.headers['cache-control'], 'no-store');
      const problem = json(response);
      assert.deepEqual(
        [problem.code, problem.outcome, problem.retryable],
        ['PayloadTooLarge', 'not_committed', false],
      );
      assert.match(problem.requestID, /^[0-9a-f]{32}$/);
      assert.equal(
        (await recorded()).length,
        before,
        'the post reached gateway',
      );
    }
  },

  'keeps the general body limit for other API routes': async () => {
    const response = await send(
      'POST',
      `/api/v2/r/${R}/serving/order-proposals`,
      {
        body: 'x'.repeat(20000),
      },
    );
    assert.equal(response.status, 200);
    assert.equal((await recorded()).at(-1).length, 20000);
  },

  'passes the password reset steps with their bodies and CSRF header':
    async () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'token-2',
      };
      const id = '44444444-4444-4444-8444-444444444444';
      const begin =
        '{"commandID":"c1","email":"a@b.ru","purpose":"password_reset"}';
      const verify = `{"commandID":"c2","challengeID":"${id}","code":"482913"}`;
      assert.equal(
        (
          await send('POST', '/api/v2/email-challenges', {
            headers,
            body: begin,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await send('POST', `/api/v2/challenges/${id}/verify`, {
            headers,
            body: verify,
          })
        ).status,
        200,
      );
      const [first, second] = (await recorded()).slice(-2);
      assert.deepEqual(
        [
          first.url,
          first.length,
          first.csrf,
          second.url,
          second.length,
          second.csrf,
        ],
        [
          '/api/v2/email-challenges',
          Buffer.byteLength(begin),
          'token-2',
          `/api/v2/challenges/${id}/verify`,
          Buffer.byteLength(verify),
          'token-2',
        ],
      );
    },

  // Nginx 1.30 already streams small chunks and speaks HTTP/1.1 upstream by
  // default, so the contract's settings are checked in the file as well.
  'configures the restaurant stream for a long-lived connection': () => {
    const config = readFileSync(
      new URL('../../nginx.conf', import.meta.url),
      'utf8',
    );
    const head = 'location ~ ^/api/v2/r/[0-9a-f-]+/live$ {';
    const start = config.indexOf(head);
    assert.ok(start >= 0, 'missing the stream location');
    const block = config.slice(start, config.indexOf('}', start));
    for (const directive of [
      'proxy_http_version 1.1;',
      'proxy_set_header Connection "";',
      'proxy_buffering off;',
      'proxy_cache off;',
      'gzip off;',
      'proxy_read_timeout 60s;',
    ]) {
      assert.ok(block.includes(directive), `missing ${directive}`);
    }
    assert.ok(
      !config.includes('location = /api/live'),
      'the v1 stream block is still there',
    );
    assert.ok(
      !config.includes('location = /api/feedback'),
      'the v1 feedback block is still there',
    );
  },

  'passes /api/live over HTTP/1.1 with the browser headers': async () => {
    const headers = {
      Host: 'umir.example.test:8443',
      Cookie: 'umir_operator_session=s',
    };
    assert.equal((await stream(live, headers)).status, 200);
    const last = (await recorded()).filter((r) => r.url === live).at(-1);
    assert.deepEqual(
      [last.httpVersion, last.connection, last.host, last.cookie],
      ['1.1', null, headers.Host, headers.Cookie],
    );
  },

  'passes each /api/live event at once': async () => {
    const response = await stream(live, { 'Accept-Encoding': 'gzip' });
    assert.match(response.headers['content-type'], /^text\/event-stream/);
    assert.equal(response.headers['content-encoding'], undefined);
    // The stand-in writes the second event 1.5 s after the first.
    const first = response.chunks.at(0);
    const last = response.chunks.at(-1);
    assert.ok(last.at - first.at >= 1000, 'Nginx held the first event back');
    assert.match(first.text, /^retry: 3000\n\nevent: refresh-required\n/);
    assert.match(last.text, /"type":"change"/);
  },

  'answers a lost /api/live answer with the JSON error envelope': async () => {
    const before = (await recorded()).filter(
      (r) => r.url === `${live}?drop`,
    ).length;
    const response = await send('GET', `${live}?drop`);
    assert.equal(response.status, 502);
    assert.deepEqual(json(response), {
      code: 'UpstreamUnavailable',
      message: 'gateway did not respond',
      outcome: 'unavailable',
      retryable: true,
    });
    const after = (await recorded()).filter(
      (r) => r.url === `${live}?drop`,
    ).length;
    assert.equal(after, before + 1, 'the stream request was retried');
  },

  'passes the stream cursor unchanged': async () => {
    const path = `${live}?cursor=a%2Fb%2Bc`;
    assert.equal((await stream(path)).status, 200);
    assert.equal((await recorded()).filter((r) => r.url === path).length, 1);
  },
};

await ready();
let failed = 0;
for (const [name, check] of Object.entries(checks)) {
  try {
    await check();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.log(
      `not ok - ${name}\n  ${error.message.replaceAll('\n', '\n  ')}`,
    );
  }
}
process.exitCode = failed === 0 ? 0 : 1;
