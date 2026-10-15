// Checks the frontend Nginx API proxy against the gateway stand-in (gateway#8, gateway#10).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
            rawHeaders: response.rawHeaders,
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

const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self'; connect-src 'self'; " +
  "frame-src https://yandex.ru; manifest-src 'self'; object-src 'none'; " +
  "base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

// Every value of one header as sent, so a doubled header is seen.
function values(response, name) {
  const found = [];
  for (let i = 0; i < response.rawHeaders.length; i += 2) {
    if (response.rawHeaders[i].toLowerCase() === name) {
      found.push(response.rawHeaders[i + 1]);
    }
  }
  return found;
}

function assertSecurityHeaders(response, referrer, where) {
  assert.deepEqual(values(response, 'content-security-policy'), [csp], where);
  assert.deepEqual(
    values(response, 'x-content-type-options'),
    ['nosniff'],
    where,
  );
  assert.deepEqual(values(response, 'x-frame-options'), ['DENY'], where);
  assert.deepEqual(values(response, 'referrer-policy'), [referrer], where);
}

const crossOrigin = 'strict-origin-when-cross-origin';

function compose(...args) {
  return execFileSync('docker', ['compose', '-f', 'compose.yaml', ...args], {
    encoding: 'utf8',
  });
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

  'serves the invitation page without a referrer and without a cache':
    async () => {
      const id = '77777777-7777-4777-8777-777777777777';
      const response = await send('GET', `/invite/${id}`);
      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'] ?? '', /^text\/html/);
      assert.equal(response.headers['cache-control'], 'no-cache');
      // Exactly one policy: the general one is replaced, not added to.
      assertSecurityHeaders(response, 'no-referrer', 'invitation');
      // Only the invitation address carries it.
      const other = await send('GET', '/login');
      assert.equal(other.status, 200);
      assert.deepEqual(values(other, 'referrer-policy'), [crossOrigin]);
    },

  'serves the pages with the security headers and no cache': async () => {
    for (const path of ['/', '/login', '/app', '/index.html']) {
      const response = await send('GET', path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers['content-type'] ?? '', /^text\/html/);
      assert.equal(response.headers['cache-control'], 'no-cache', path);
      assertSecurityHeaders(response, crossOrigin, path);
    }
  },

  'serves root files without long caching': async () => {
    const response = await send('GET', '/favicon.svg');
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 'no-cache');
    assertSecurityHeaders(response, crossOrigin, 'favicon');
    const manifest = await send('GET', '/manifest.webmanifest');
    assert.equal(manifest.headers['cache-control'], 'no-cache');
    assertSecurityHeaders(manifest, crossOrigin, 'manifest');
  },

  'serves hashed assets compressed and cached for good': async () => {
    for (const file of ['app-3f9a1c2b.js', 'app-3f9a1c2b.css']) {
      const path = `/assets/${file}`;
      const response = await send('GET', path, {
        headers: { 'Accept-Encoding': 'gzip' },
      });
      assert.equal(response.status, 200, path);
      assert.equal(response.headers['content-encoding'], 'gzip', path);
      assert.match(response.headers['vary'] ?? '', /Accept-Encoding/i, path);
      assert.equal(
        response.headers['cache-control'],
        'public, max-age=31536000, immutable',
        path,
      );
      assertSecurityHeaders(response, crossOrigin, path);
    }
  },

  'answers a missing asset with 404, not the page, and no long caching':
    async () => {
      const response = await send('GET', '/assets/missing.js');
      assert.equal(response.status, 404);
      assert.doesNotMatch(response.headers['cache-control'] ?? '', /immutable/);
      assert.ok(!response.body.includes('id="root"'), 'got the page');
      assertSecurityHeaders(response, crossOrigin, 'missing asset');
    },

  'puts the security headers on the contract errors and the status path':
    async () => {
      const lost = await send('GET', '/api/drop');
      assert.equal(lost.status, 502);
      assert.equal(lost.headers['cache-control'], 'no-store');
      assertSecurityHeaders(lost, crossOrigin, '502');
      const big = await send('POST', `/api/v2/r/${R}/serving/order-proposals`, {
        body: 'x'.repeat(1024 * 1024 + 1),
      });
      assert.equal(big.status, 413);
      assert.equal(big.headers['cache-control'], 'no-store');
      assertSecurityHeaders(big, crossOrigin, '413');
      const health = await send('GET', '/healthz');
      assert.equal(health.status, 200);
      assertSecurityHeaders(health, crossOrigin, 'healthz');
    },

  // The 504 answer needs a 30 s wait, so the file is read instead: nginx
  // drops inherited add_header lines in a block with its own, so each such
  // block must include the shared file again.
  'includes the security headers in every block with its own add_header':
    () => {
      const config = readFileSync(
        new URL('../../nginx.conf', import.meta.url),
        'utf8',
      );
      const include = 'include /etc/nginx/security-headers.conf;';
      assert.ok(
        config.includes(include),
        'the server does not include the file',
      );
      const blocks = [...config.matchAll(/^\s*location [^{]*\{([^}]*)\}/gm)];
      assert.ok(blocks.length >= 10, 'could not read the location blocks');
      let own = 0;
      for (const [block, body] of blocks) {
        if (!/\badd_header\b/.test(body)) continue;
        own += 1;
        assert.ok(
          body.includes(include),
          `no include in ${block.trim().split('\n')[0]}`,
        );
      }
      assert.ok(own >= 6, 'expected the error, page and asset blocks');
      assert.ok(/location @api_timeout/.test(config));
    },

  'does not compress API answers': async () => {
    const response = await send('GET', '/api/compressible', {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(response.status, 200);
    assert.ok(response.body.length > 2048, 'the stand-in body is too small');
    assert.equal(response.headers['content-encoding'], undefined);
  },

  'logs a request without the client address, referrer and query': async () => {
    const marker = `q${Date.now()}`;
    const response = await send('GET', `/login?token=${marker}`, {
      headers: { Referer: 'https://leak.example.test/from' },
    });
    assert.equal(response.status, 200);
    await sleep(300);
    const lines = compose('logs', '--no-log-prefix', 'frontend')
      .split('\n')
      .filter((line) => line.includes('/login'));
    assert.ok(lines.length > 0, 'the request is not in the log');
    for (const line of lines) {
      assert.doesNotMatch(line, /\d{1,3}(\.\d{1,3}){3}/, `address in: ${line}`);
      assert.ok(!line.includes(marker) && !line.includes('leak.example'), line);
    }
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

  // The last check: it stops the stand-in and starts it again.
  'answers /readyz without gateway and without caching': async () => {
    compose('stop', 'gateway');
    try {
      const response = await send('GET', '/readyz');
      assert.equal(response.status, 200);
      assert.match(
        response.headers['content-type'] ?? '',
        /^application\/json/,
      );
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.deepEqual(JSON.parse(response.body), {
        capabilities: { static: 'ok' },
      });
      assertSecurityHeaders(response, crossOrigin, 'readyz');
      assert.equal((await send('GET', '/healthz')).status, 200);
      await sleep(300);
      assert.ok(
        !compose('logs', '--no-log-prefix', 'frontend').includes('/readyz'),
        'the probe is in the log',
      );
    } finally {
      compose('start', 'gateway');
    }
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
