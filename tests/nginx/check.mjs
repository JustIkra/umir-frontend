// Checks the frontend Nginx API proxy against the gateway stand-in (gateway#8, gateway#10).
import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const port = Number(process.env.FRONTEND_PORT ?? 18090);

function send(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method, path, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() });
      });
    });
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
      if ((await send('GET', '/healthz')).status === 200 && (await send('GET', '/api/__requests')).status === 200) {
        return;
      }
    } catch {
      // Nginx or the stand-in is still starting.
    }
    await sleep(500);
  }
  throw new Error('frontend did not become ready');
}

function json(response) {
  assert.match(response.headers['content-type'] ?? '', /^application\/json/);
  return JSON.parse(response.body);
}

const checks = {
  'passes the browser Host with its port, Origin, cookies and CSRF header': async () => {
    const headers = {
      Host: 'umir.example.test:8443',
      Origin: 'https://umir.example.test:8443',
      Cookie: 'umir_operator_preauth=p; theme=dark',
      'X-CSRF-Token': 'token-1',
      'Content-Type': 'application/json',
    };
    assert.equal((await send('POST', '/api/operator/session', { headers, body: '{}' })).status, 200);
    const last = (await recorded()).at(-1);
    assert.deepEqual([last.host, last.origin, last.cookie, last.csrf],
      [headers.Host, headers.Origin, headers.Cookie, headers['X-CSRF-Token']]);
  },

  'passes the raw path and query': async () => {
    const target = '/api/serving/items/%D0%B0%2Fb?cutoffAt=2026-10-10T12:00:00%2B03:00&x=%zz;y';
    assert.equal((await send('GET', target)).status, 200);
    assert.equal((await recorded()).at(-1).url, target);
  },

  'passes gateway errors and Set-Cookie unchanged': async () => {
    for (const status of [401, 502, 503, 504]) {
      const response = await send('GET', `/api/respond/${status}`);
      assert.equal(response.status, status);
      assert.equal(response.body, '{"from":"gateway"}');
      assert.deepEqual(response.headers['set-cookie'], ['umir_operator_session=s; Path=/; HttpOnly']);
    }
  },

  'sends every request to gateway without caching': async () => {
    const before = (await recorded()).length;
    await send('GET', '/api/serving/menu');
    await send('GET', '/api/serving/menu');
    assert.equal((await recorded()).length, before + 2);
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
    console.log(`not ok - ${name}\n  ${error.message.replaceAll('\n', '\n  ')}`);
  }
}
process.exitCode = failed === 0 ? 0 : 1;
