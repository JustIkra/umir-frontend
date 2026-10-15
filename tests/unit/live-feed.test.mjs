import assert from 'node:assert/strict';
import { test } from 'bun:test';
import examples from '../../api/backend-v2-examples.json' with { type: 'json' };
import { decodeLiveEvent } from '../../src/adapters/live/decode.ts';
import {
  createEventSourceFeed,
  livePath,
} from '../../src/adapters/live/event-source-feed.ts';

const R = '33333333-3333-4333-8333-333333333333';
const EPOCH = '44444444-4444-4444-8444-444444444444';
const data = (value) => JSON.stringify(value);

test('the contract SSE examples decode or are refused', () => {
  const list = examples.schemaCases.filter(
    (item) => item.schema === 'LiveEvent',
  );
  assert.ok(list.length >= 2);
  for (const item of list) {
    const decodedEvent = decodeLiveEvent(item.value.type, data(item.value));
    assert.equal(decodedEvent !== undefined, item.valid, item.name);
  }
});

test('a change keeps its sequence as bigint and its topics', () => {
  assert.deepEqual(
    decodeLiveEvent(
      'change',
      data({
        type: 'change',
        tenantID: R,
        epoch: EPOCH,
        sequence: '12',
        topics: ['stock', 'menu'],
      }),
    ),
    {
      type: 'change',
      tenantID: R,
      epoch: EPOCH,
      sequence: 12n,
      topics: ['stock', 'menu'],
    },
  );
});

test('refresh-required and access-ended decode', () => {
  assert.deepEqual(
    decodeLiveEvent(
      'refresh-required',
      data({ type: 'refresh-required', tenantID: R, epoch: EPOCH }),
    ),
    {
      type: 'refresh-required',
      tenantID: R,
      epoch: EPOCH,
    },
  );
  assert.deepEqual(
    decodeLiveEvent(
      'access-ended',
      data({ type: 'access-ended', tenantID: R, reason: 'session-expired' }),
    ),
    {
      type: 'access-ended',
      tenantID: R,
      reason: 'session-expired',
    },
  );
});

test('malformed events are refused', () => {
  const change = {
    type: 'change',
    tenantID: R,
    epoch: EPOCH,
    sequence: '1',
    topics: ['stock'],
  };
  for (const [name, value] of [
    ['change', { ...change, topics: [] }],
    ['change', { ...change, topics: ['stock', 'stock'] }],
    ['change', { ...change, topics: ['weather'] }],
    ['change', { ...change, sequence: '0' }],
    ['change', { ...change, type: 'refresh-required' }],
    ['access-ended', { type: 'access-ended', tenantID: R, reason: 'bored' }],
  ]) {
    assert.equal(
      decodeLiveEvent(name, data(value)),
      undefined,
      JSON.stringify(value),
    );
  }
  assert.equal(decodeLiveEvent('change', '{'), undefined);
  assert.equal(decodeLiveEvent('change', undefined), undefined);
});

test('the stream path names the restaurant and the cursor', () => {
  assert.equal(livePath(R), `/api/v2/r/${R}/live`);
  assert.equal(livePath(R, 'a/b+c'), `/api/v2/r/${R}/live?cursor=a%2Fb%2Bc`);
});

function fakeSources() {
  const opened = [];
  const open = (url) => {
    const listeners = new Map();
    const source = {
      url,
      readyState: 0,
      closed: false,
      addEventListener(type, listener) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      close() {
        source.closed = true;
      },
      fire(type, event = {}) {
        for (const listener of listeners.get(type) ?? []) listener(event);
      },
    };
    opened.push(source);
    return source;
  };
  return { open, opened };
}

test('the feed opens the restaurant stream and passes decoded events', () => {
  const { open, opened } = fakeSources();
  const events = [];
  const statuses = [];
  const unsubscribe = createEventSourceFeed(open).subscribe(
    R,
    (event) => events.push(event),
    (status) => statuses.push(status),
  );
  assert.equal(opened[0].url, `/api/v2/r/${R}/live`);
  opened[0].fire('open');
  opened[0].fire('refresh-required', {
    data: data({ type: 'refresh-required', tenantID: R, epoch: EPOCH }),
    lastEventId: '',
  });
  assert.deepEqual(statuses, ['open']);
  assert.equal(events[0].type, 'refresh-required');
  unsubscribe();
  assert.equal(opened[0].closed, true);
});

test('a malformed event or a closed source ends the subscription', () => {
  const { open, opened } = fakeSources();
  const statuses = [];
  createEventSourceFeed(open).subscribe(
    R,
    () => {},
    (status) => statuses.push(status),
  );
  opened[0].fire('change', { data: '{' });
  assert.deepEqual(statuses, ['closed']);
  assert.equal(opened[0].closed, true);
  const second = fakeSources();
  const more = [];
  createEventSourceFeed(second.open).subscribe(
    R,
    () => {},
    (status) => more.push(status),
  );
  second.opened[0].fire('error');
  second.opened[0].readyState = 2;
  second.opened[0].fire('error');
  assert.deepEqual(more, ['connecting', 'closed']);
});

test('the next subscription resumes from the last event id; a refused resume drops it', () => {
  const { open, opened } = fakeSources();
  const feed = createEventSourceFeed(open);
  const stop = feed.subscribe(
    R,
    () => {},
    () => {},
  );
  opened[0].fire('open');
  opened[0].fire('change', {
    data: data({
      type: 'change',
      tenantID: R,
      epoch: EPOCH,
      sequence: '5',
      topics: ['stock'],
    }),
    lastEventId: 'cur-5',
  });
  stop();
  feed.subscribe(
    R,
    () => {},
    () => {},
  );
  assert.equal(opened[1].url, `/api/v2/r/${R}/live?cursor=cur-5`);
  opened[1].readyState = 2;
  opened[1].fire('error');
  feed.subscribe(
    R,
    () => {},
    () => {},
  );
  assert.equal(opened[2].url, `/api/v2/r/${R}/live`);
});

test('forget drops every saved cursor so the next user starts without one', () => {
  const { open, opened } = fakeSources();
  const feed = createEventSourceFeed(open);
  const stop = feed.subscribe(
    R,
    () => {},
    () => {},
  );
  opened[0].fire('open');
  opened[0].fire('change', {
    data: data({
      type: 'change',
      tenantID: R,
      epoch: EPOCH,
      sequence: '7',
      topics: ['stock'],
    }),
    lastEventId: 'cur-7',
  });
  stop();
  feed.forget();
  feed.subscribe(
    R,
    () => {},
    () => {},
  );
  assert.equal(opened[1].url, `/api/v2/r/${R}/live`);
});
