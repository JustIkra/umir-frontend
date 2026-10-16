import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'bun:test';
import {
  cookiePolicy,
  cookieRows,
} from '../../src/presentation/documents/content.ts';

const storageDir = join(import.meta.dir, '../../src/adapters/browser-storage');

// Every quoted 'umir.…' key or key prefix that the storage adapters declare.
function declaredKeys() {
  const keys = new Set();
  for (const file of readdirSync(storageDir)) {
    const source = readFileSync(join(storageDir, file), 'utf8');
    for (const match of source.matchAll(
      /export const \w+ = '(umir\.[^']+)'/g,
    )) {
      keys.add(match[1]);
    }
  }
  return keys;
}

const browserRows = cookieRows.filter((row) => row.storage.endsWith('Storage'));
const prefixOf = (name) => name.replace(/\*$/, '');

test('every browser storage row of the cookie table is a key prefix in the code', () => {
  const keys = declaredKeys();
  assert.ok(keys.size >= 7);
  for (const row of browserRows) {
    assert.ok(
      keys.has(prefixOf(row.name)),
      `${row.name} is not a key or key prefix in src/adapters/browser-storage`,
    );
  }
});

test('every key the code writes to browser storage has a row in the cookie table', () => {
  const documented = new Set(browserRows.map((row) => prefixOf(row.name)));
  for (const key of declaredKeys()) {
    assert.ok(documented.has(key), `${key} is missing from cookieRows`);
  }
});

test('attempts and orders are described as kept until the tab closes or the result', () => {
  for (const name of ['umir.order.*', 'umir.attempt.*']) {
    const row = cookieRows.find((item) => item.name === name);
    assert.ok(row, name);
    assert.equal(row.storage, 'sessionStorage');
    assert.match(row.term, /закрытия вкладки/);
  }
});

test('the blocked-storage paragraph names every command that is not remembered', () => {
  const text = JSON.stringify(cookiePolicy);
  for (const word of ['поставк', 'списани', 'заказ', 'продукт', 'блюд']) {
    assert.ok(text.includes(word), word);
  }
  assert.ok(!text.includes('pendingAttempt'));
});
