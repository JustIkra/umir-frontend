// Checks the frontend Nginx API proxy against the gateway stand-in (gateway#8, gateway#10).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { gunzipSync } from 'node:zlib';

const port = Number(process.env.FRONTEND_PORT ?? 18090);
// The second instance trusts no peer the test client can be.
const untrustedPort = Number(process.env.FRONTEND_PORT_UNTRUSTED ?? 18191);
const R = '33333333-3333-4333-8333-333333333333';
const live = `/api/v2/r/${R}/live`;
const feedbackPaths = ['/api/v2/feedback/anonymous', `/api/v2/r/${R}/feedback`];

function send(method, path, { headers = {}, body, to = port } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port: to, method, path, headers },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            rawHeaders: response.rawHeaders,
            raw: Buffer.concat(chunks),
            body: Buffer.concat(chunks).toString(),
          });
        });
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

// The free local ports of the running stand-in replicas, read from Docker.
let replicaPorts = null;
function replicas() {
  if (replicaPorts === null) {
    const ids = compose('ps', '-q', 'gateway').split('\n').filter(Boolean);
    replicaPorts = ids.map((id) => ({
      id,
      // The container's hostname, which the stand-in sends as X-Stand-In.
      name: id.slice(0, 12),
      port: Number(
        compose(
          'port',
          '--index',
          String(ids.indexOf(id) + 1),
          'gateway',
          '8080',
        )
          .trim()
          .split(':')
          .at(-1),
      ),
    }));
  }
  return replicaPorts;
}

// What every running replica received, in arrival order. The proxy reaches a replica of its own
// choosing, so the lists are read from the replicas directly.
async function recorded() {
  const all = [];
  for (const { port: to } of replicas()) {
    const response = await send('GET', '/api/__requests', { to });
    assert.equal(response.status, 200, 'gateway stand-in is not reachable');
    all.push(...JSON.parse(response.body));
  }
  return all.sort((a, b) => a.at - b.at);
}

async function ready() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if (
        (await send('GET', '/healthz')).status === 200 &&
        (await send('GET', '/healthz', { to: untrustedPort })).status === 200 &&
        replicas().length === 2 &&
        // Nginx looks the replicas up after it starts; until then a stream has no one to go to.
        (await answeredBy('umir_operator_session=ready')).status === 200
      ) {
        await recorded();
        return;
      }
    } catch {
      // Nginx or the stand-in is still starting.
      replicaPorts = null;
    }
    await sleep(500);
  }
  throw new Error('frontend did not become ready');
}

// Reads a response to the end and notes when each chunk arrived.
function stream(path, headers = {}, to = port) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const request = http.request(
      { host: '127.0.0.1', port: to, method: 'GET', path, headers },
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

// Which stand-in replica answered a live request (its X-Stand-In header). The stream is closed
// as soon as the headers are in.
function answeredBy(cookie, to = port) {
  return new Promise((resolve, reject) => {
    const headers = cookie === undefined ? {} : { Cookie: cookie };
    const request = http.request(
      { host: '127.0.0.1', port: to, method: 'GET', path: live, headers },
      (response) => {
        resolve({
          status: response.statusCode,
          node: response.headers['x-stand-in'],
        });
        response.on('error', () => {});
        request.destroy();
      },
    );
    request.on('error', reject);
    request.end();
  });
}

// The replicas that answered a cookie list, one request each.
async function nodesFor(cookies) {
  const answers = await Promise.all(cookies.map((c) => answeredBy(c)));
  for (const answer of answers) assert.equal(answer.status, 200);
  return answers.map((answer) => answer.node);
}

const sessionCookieNames = [
  'umir_operator_session',
  '__Host-umir_operator_session',
];

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

// The text of the server block with every nested block (location, map-like braces) cut out.
function serverLevel(config) {
  const start = config.indexOf('server {');
  assert.ok(start >= 0, 'no server block');
  let depth = 0;
  let level = '';
  for (const char of config.slice(start)) {
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) break;
    } else if (depth === 1) level += char;
  }
  return level;
}

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

  // A stopped replica must not hold a stream request for the 5 s of the other locations.
  'gives the live stream a short connect timeout so a stopped replica is skipped quickly':
    () => {
      const config = readFileSync(
        new URL('../../nginx.conf', import.meta.url),
        'utf8',
      );
      const live =
        /location ~ \^\/api\/v2\/r\/\[0-9a-f-\]\+\/live\$ \{([^}]*)\}/.exec(
          config,
        );
      assert.ok(live, 'the live location was not found');
      const seconds = /proxy_connect_timeout (\d+)s;/.exec(live[1]);
      assert.ok(seconds, 'the live location has no connect timeout of its own');
      assert.ok(Number(seconds[1]) <= 2, 'connect timeout above 2 s');
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
      // The include must stand in the server itself, outside every location.
      assert.ok(
        serverLevel(config).includes(include),
        'the server does not include the file outside its locations',
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

  // A proxied answer takes the headers from the server level only: its location sets none.
  'puts the security headers on a proxied API answer': async () => {
    for (const path of ['/api/v2/session', `/api/v2/r/${R}/serving/menu`]) {
      const response = await send('GET', path);
      assert.equal(response.status, 200, path);
      assertSecurityHeaders(response, crossOrigin, path);
    }
  },

  'answers a sub-path of the status addresses with 404, not the page':
    async () => {
      for (const path of ['/readyz/x', '/healthz/x', '/readyz/', '/healthz/']) {
        const response = await send('GET', path);
        assert.equal(response.status, 404, path);
        assert.ok(!response.body.includes('id="root"'), `${path} got the page`);
        assertSecurityHeaders(response, crossOrigin, path);
      }
      assert.equal((await send('GET', '/readyz')).status, 200);
      assert.equal((await send('GET', '/healthz')).status, 200);
    },

  'compresses the page on every route that serves it': async () => {
    const id = '77777777-7777-4777-8777-777777777777';
    const page = readFileSync(
      new URL('./site/index.html', import.meta.url),
      'utf8',
    );
    assert.ok(Buffer.byteLength(page) > 1024, 'the stand-in page is too small');
    for (const path of ['/', '/index.html', '/login', `/invite/${id}`]) {
      const response = await send('GET', path, {
        headers: { 'Accept-Encoding': 'gzip' },
      });
      assert.equal(response.status, 200, path);
      assert.equal(response.headers['content-encoding'], 'gzip', path);
      assert.match(response.headers['vary'] ?? '', /Accept-Encoding/i, path);
      assert.equal(gunzipSync(response.raw).toString(), page, path);
      // Without the request header the page comes plain.
      const plain = await send('GET', path);
      assert.equal(plain.headers['content-encoding'], undefined, path);
    }
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
    // The trusting instance would log the forwarded address ($remote_addr), the other the socket's.
    for (const [service, to] of [
      ['frontend', port],
      ['frontend-untrusted', untrustedPort],
    ]) {
      const marker = `q${Date.now()}`;
      const response = await send('GET', `/login?token=${marker}`, {
        headers: {
          Referer: 'https://leak.example.test/from',
          'X-Forwarded-For': '1.1.1.1, 10.9.9.9',
        },
        to,
      });
      assert.equal(response.status, 200);
      await sleep(300);
      const lines = compose('logs', '--no-log-prefix', service)
        .split('\n')
        .filter((line) => line.includes('/login'));
      assert.ok(lines.length > 0, `${service}: the request is not in the log`);
      for (const line of lines) {
        assert.doesNotMatch(
          line,
          /\d{1,3}(\.\d{1,3}){3}/,
          `address in: ${line}`,
        );
        assert.ok(
          !line.includes(marker) && !line.includes('leak.example'),
          line,
        );
      }
    }
  },

  'tells gateway the last X-Forwarded-For entry of a trusted proxy':
    async () => {
      const path = `/api/v2/forwarded?${Date.now()}`;
      const headers = {
        'X-Forwarded-For': '1.1.1.1, 10.9.9.9',
        Forwarded: 'for=2.2.2.2',
        'X-Real-IP': '3.3.3.3',
      };
      assert.equal((await send('GET', path, { headers })).status, 200);
      const seen = (await recorded()).find((r) => r.url === path);
      assert.equal(seen.xForwardedFor, '10.9.9.9');
      assert.equal(seen.forwarded, null);
      assert.equal(seen.xRealIp, null);
    },

  'takes the address from the last of several X-Forwarded-For lines':
    async () => {
      const path = `/api/v2/forwarded-lines?${Date.now()}`;
      const headers = { 'X-Forwarded-For': ['1.1.1.1', '10.9.9.9'] };
      assert.equal((await send('GET', path, { headers })).status, 200);
      const seen = (await recorded()).find((r) => r.url === path);
      assert.equal(seen.xForwardedFor, '10.9.9.9');
    },

  'tells gateway the peer address when nothing is forwarded': async () => {
    for (const to of [port, untrustedPort]) {
      const path = `/api/v2/forwarded-none?${to}.${Date.now()}`;
      assert.equal((await send('GET', path, { to })).status, 200);
      const seen = (await recorded()).find((r) => r.url === path);
      assert.match(seen.xForwardedFor, /^\d{1,3}(\.\d{1,3}){3}$/);
      assert.equal(seen.forwarded, null);
      assert.equal(seen.xRealIp, null);
    }
  },

  'ignores forwarding headers from a peer it does not trust': async () => {
    const path = `/api/v2/forwarded-untrusted?${Date.now()}`;
    const headers = {
      'X-Forwarded-For': '1.1.1.1, 10.9.9.9',
      Forwarded: 'for=2.2.2.2',
      'X-Real-IP': '3.3.3.3',
    };
    const to = untrustedPort;
    assert.equal((await send('GET', path, { headers, to })).status, 200);
    const seen = (await recorded()).find((r) => r.url === path);
    // One address, the peer's: nothing the client sent is in it.
    assert.match(seen.xForwardedFor, /^\d{1,3}(\.\d{1,3}){3}$/);
    assert.ok(!['1.1.1.1', '10.9.9.9'].includes(seen.xForwardedFor));
    assert.equal(seen.forwarded, null);
    assert.equal(seen.xRealIp, null);
    // The peer address is the one the trusting instance sees without a header.
    const none = `/api/v2/forwarded-peer?${Date.now()}`;
    await send('GET', none);
    const peer = (await recorded()).find((r) => r.url === none);
    assert.equal(seen.xForwardedFor, peer.xForwardedFor);
  },

  'does not trust a garbled X-Forwarded-For of a trusted proxy': async () => {
    const path = `/api/v2/forwarded-garbled?${Date.now()}`;
    const headers = { 'X-Forwarded-For': 'not-an-address' };
    assert.equal((await send('GET', path, { headers })).status, 200);
    const seen = (await recorded()).find((r) => r.url === path);
    assert.match(seen.xForwardedFor, /^\d{1,3}(\.\d{1,3}){3}$/);
  },

  'rewrites the forwarding headers on the live stream too': async () => {
    const trusted = `${live}?trusted=${Date.now()}`;
    const other = `${live}?untrusted=${Date.now()}`;
    const headers = {
      'X-Forwarded-For': '1.1.1.1, 10.9.9.9',
      Forwarded: 'for=2.2.2.2',
      'X-Real-IP': '3.3.3.3',
    };
    assert.equal((await stream(trusted, headers)).status, 200);
    assert.equal((await stream(other, headers, untrustedPort)).status, 200);
    const seen = await recorded();
    const first = seen.find((r) => r.url === trusted);
    const second = seen.find((r) => r.url === other);
    assert.equal(first.xForwardedFor, '10.9.9.9');
    assert.match(second.xForwardedFor, /^\d{1,3}(\.\d{1,3}){3}$/);
    assert.ok(!['1.1.1.1', '10.9.9.9'].includes(second.xForwardedFor));
    for (const r of [first, second]) {
      assert.equal(r.forwarded, null);
      assert.equal(r.xRealIp, null);
    }
  },

  'builds the image from the template and trusts only the loopback': () => {
    const image = readFileSync(
      new URL('../../Dockerfile', import.meta.url),
      'utf8',
    );
    assert.match(
      image,
      /^COPY (--link )?nginx\.conf \/etc\/nginx\/templates\/default\.conf\.template$/m,
    );
    assert.match(image, /^ENV NGINX_ENVSUBST_FILTER=\^UMIR_$/m);
    assert.match(image, /^ENV UMIR_TRUSTED_PROXY=127\.0\.0\.1\/32$/m);
    const config = readFileSync(
      new URL('../../nginx.conf', import.meta.url),
      'utf8',
    );
    assert.match(config, /^\s*set_real_ip_from \$\{UMIR_TRUSTED_PROXY\};$/m);
    assert.match(config, /^\s*real_ip_header X-Forwarded-For;$/m);
    assert.match(config, /^\s*real_ip_recursive off;$/m);
    // Both proxy blocks (API and live stream) name the client from $remote_addr alone.
    assert.ok(!config.includes('$proxy_add_x_forwarded_for'));
    assert.equal(
      config.match(/proxy_set_header X-Forwarded-For \$remote_addr;/g).length,
      2,
    );
    assert.equal(config.match(/proxy_set_header Forwarded "";/g).length, 2);
    assert.equal(config.match(/proxy_set_header X-Real-IP "";/g).length, 2);
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
      // The one block that is pinned to a replica and may try a second one.
      'proxy_pass http://gateway_live;',
      'proxy_next_upstream error timeout;',
      'proxy_next_upstream_tries 2;',
    ]) {
      assert.ok(block.includes(directive), `missing ${directive}`);
    }
    // Everything else stays on the dynamic name and never retries a request.
    assert.equal(config.match(/proxy_pass \$gateway;/g).length, 2);
    assert.equal(config.match(/proxy_pass http:\/\/gateway_live;/g).length, 1);
    assert.equal(config.match(/proxy_next_upstream off;/g).length, 1);
    assert.equal(config.match(/proxy_next_upstream error/g).length, 1);
    // The session is read from the cookie by a map: the name with a hyphen has no $cookie_ variable.
    assert.ok(!/\$cookie_/.test(config));
    assert.ok(
      config.includes(
        '"~(?:^|;\\s*)(?:__Host-)?umir_operator_session=(?<sid>[^;\\s]+)" $sid;',
      ),
    );
    assert.match(config, /hash \$umir_live_key;/);
    assert.match(config, /server gateway:8080 resolve;/);
    assert.match(config, /zone gateway_live 64k;/);
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

  'keeps one session on one gateway replica': async () => {
    for (const name of sessionCookieNames) {
      const value = randomUUID();
      const nodes = await nodesFor(Array(10).fill(`${name}=${value}`));
      assert.equal(new Set(nodes).size, 1, `${name}: ${nodes}`);
      // Other cookies around it do not move the session.
      const around = await nodesFor([
        `theme=dark; ${name}=${value}; a=b`,
        `a=b;${name}=${value}`,
      ]);
      assert.deepEqual(around, [nodes[0], nodes[0]], name);
    }
  },

  'spreads different sessions over both gateway replicas': async () => {
    const names = replicas().map((replica) => replica.name);
    for (const name of sessionCookieNames) {
      const cookies = Array.from(
        { length: 40 },
        () => `${name}=${randomUUID()}`,
      );
      const nodes = await nodesFor(cookies);
      assert.deepEqual([...new Set(nodes)].sort(), [...names].sort(), name);
    }
  },

  'treats both session cookie names as the same session': async () => {
    const value = randomUUID();
    const [plain, secure] = await nodesFor([
      `umir_operator_session=${value}`,
      `__Host-umir_operator_session=${value}`,
    ]);
    assert.equal(plain, secure);
  },

  'serves a stream without a session cookie, keyed by the client address':
    async () => {
      const bare = await nodesFor(Array(6).fill(undefined));
      assert.equal(new Set(bare).size, 1, `${bare}`);
      // These are not the session cookie: the stream falls back to the address as well.
      const other = await nodesFor([
        ...Array.from(
          { length: 8 },
          () => `x_umir_operator_session=${randomUUID()}`,
        ),
        ...Array.from(
          { length: 8 },
          () => `umir_operator_session_x=${randomUUID()}`,
        ),
        'umir_operator_session=',
      ]);
      assert.deepEqual([...new Set(other)], [bare[0]]);
    },

  'passes the stream cursor unchanged': async () => {
    const path = `${live}?cursor=a%2Fb%2Bc`;
    assert.equal((await stream(path)).status, 200);
    assert.equal((await recorded()).filter((r) => r.url === path).length, 1);
  },

  // Stops one replica and starts it again; it comes before the last check.
  'moves a session to the other gateway replica when its own is stopped':
    async () => {
      const [first, second] = replicas();
      const name = '__Host-umir_operator_session';
      let owned;
      for (let i = 0; i < 40 && owned === undefined; i += 1) {
        const cookie = `${name}=${randomUUID()}`;
        if ((await answeredBy(cookie)).node === first.name) owned = cookie;
      }
      assert.ok(owned, 'no session of the first replica found');
      execFileSync('docker', ['stop', '--time', '1', first.id]);
      try {
        // At once Nginx may still list the stopped replica. The call that finds it out can end in a
        // 504 (the connect to a stopped container times out after 2 s, and Nginx does not always
        // have a second try left while it re-reads the replicas' addresses); it marks the replica
        // failed, and the very next call of the same session reaches the other one.
        let now = await answeredBy(owned);
        if (now.status === 504) now = await answeredBy(owned);
        assert.deepEqual([now.status, now.node], [200, second.name]);
        // Docker drops the stopped replica from the name; Nginx notices within the resolver's 10 s.
        await sleep(12000);
        const cookies = Array.from(
          { length: 20 },
          () => `${name}=${randomUUID()}`,
        );
        assert.deepEqual([...new Set(await nodesFor(cookies))], [second.name]);
      } finally {
        execFileSync('docker', ['start', first.id]);
        replicaPorts = null;
      }
      // The restarted replica is found again once the name is resolved anew.
      const names = [];
      for (let i = 0; i < 30 && names.length < 2; i += 1) {
        await sleep(1000);
        const cookies = Array.from(
          { length: 30 },
          () => `${name}=${randomUUID()}`,
        );
        names.splice(0, names.length, ...new Set(await nodesFor(cookies)));
      }
      assert.equal(names.length, 2, 'the restarted replica got no sessions');
    },

  // Both replicas drop the request, so Nginx counts a failure for each and leaves both out for its
  // fail_timeout (10 s): no stream check may follow it.
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
    // A stream read is tried once more, on the other replica, and then given up.
    const tried = (await recorded()).filter((r) => r.url === `${live}?drop`);
    assert.equal(tried.length - before, 2, 'expected one try on each replica');
    assert.notEqual(tried.at(-1).node, tried.at(-2).node);
  },

  // C55: the error log is set to "crit". At "error" Nginx writes the client address and the request
  // line of a failed upstream call, which the access-log rules (no address, no query) forbid.
  'keeps the client address and the request out of the error log': async () => {
    // The checks before this one made Nginx fail upstream calls (a dropped answer, a stopped replica);
    // sending another dropped answer here would leave both replicas out for the next 10 s.
    for (const service of ['frontend', 'frontend-untrusted']) {
      const log = compose('logs', '--no-log-prefix', service);
      assert.doesNotMatch(log, /\[(error|warn)\]/, `${service}: error line`);
      assert.ok(!log.includes('client:'), `${service}: client address`);
      assert.ok(!log.includes('request:'), `${service}: request line`);
      assert.ok(!log.includes('?drop'), `${service}: query string`);
    }
    assert.match(
      compose('logs', '--no-log-prefix', 'frontend'),
      / GET \/api\/v2\/r\/[^ ]+\/live 502 /,
      'the failed call is not in the access log',
    );
    const config = readFileSync(
      new URL('../../nginx.conf', import.meta.url),
      'utf8',
    );
    assert.match(config, /^error_log stderr crit;$/m);
  },

  // C34: UMIR_TRUSTED_PROXY is exactly one CIDR (or address). An empty value or a list would give
  // an invalid "set_real_ip_from"; the image must refuse to start rather than trust anyone.
  'refuses to start on an empty or a many-valued UMIR_TRUSTED_PROXY': () => {
    const test = (value) => {
      try {
        execFileSync(
          'docker',
          [
            'run',
            '--rm',
            '-e',
            'NGINX_ENVSUBST_FILTER=^UMIR_',
            '-e',
            `UMIR_TRUSTED_PROXY=${value}`,
            '-v',
            `${new URL('../../nginx.conf', import.meta.url).pathname}:/etc/nginx/templates/default.conf.template:ro`,
            '-v',
            `${new URL('../../security-headers.conf', import.meta.url).pathname}:/etc/nginx/security-headers.conf:ro`,
            process.env.NGINX_IMAGE,
            'nginx',
            '-t',
          ],
          { encoding: 'utf8', stdio: 'pipe' },
        );
        return true;
      } catch {
        return false;
      }
    };
    assert.ok(test('10.0.0.0/8'), 'one CIDR must start');
    assert.ok(test('10.0.0.1'), 'one address must start');
    assert.ok(!test(''), 'an empty value must not start');
    assert.ok(!test('10.0.0.0/8,172.16.0.0/12'), 'a comma list must not start');
    assert.ok(!test('10.0.0.0/8 172.16.0.0/12'), 'a space list must not start');
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
        !/ \/readyz /.test(compose('logs', '--no-log-prefix', 'frontend')),
        'the probe is in the log',
      );
    } finally {
      compose('start', 'gateway');
      replicaPorts = null;
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
