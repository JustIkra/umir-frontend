import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  cookieNoticeKey,
  createCookieNoticeStore,
} from '../../src/adapters/browser-storage/cookie-notice-store.ts';

function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

test('closing the notice is remembered under the documented key', () => {
  const storage = memoryStorage();
  assert.equal(createCookieNoticeStore(storage).isClosed(), false);
  createCookieNoticeStore(storage).close();
  assert.equal(storage.items.get(cookieNoticeKey), 'closed');
  assert.equal(createCookieNoticeStore(storage).isClosed(), true);
});

test('blocked storage keeps the notice closed until reload', () => {
  const blocked = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  const store = createCookieNoticeStore(blocked);
  assert.equal(store.isClosed(), false);
  store.close();
  assert.equal(store.isClosed(), true);
  assert.equal(createCookieNoticeStore(blocked).isClosed(), false);
});

test('missing storage behaves like blocked storage', () => {
  const store = createCookieNoticeStore(undefined);
  assert.equal(store.isClosed(), false);
  store.close();
  assert.equal(store.isClosed(), true);
});
