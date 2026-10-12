import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  activityHeader,
  readRequestInit,
} from '../../src/adapters/http/read-request.ts';

test('a background read sends exactly X-Umir-Activity: background', () => {
  assert.equal(activityHeader, 'X-Umir-Activity');
  assert.deepEqual(readRequestInit({ background: true }), {
    method: 'GET',
    headers: { 'X-Umir-Activity': 'background' },
  });
});

test('a read the operator caused sends no activity header', () => {
  assert.deepEqual(readRequestInit({ background: false }), {
    method: 'GET',
    headers: {},
  });
});
