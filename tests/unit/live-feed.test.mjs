import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { decodeLiveEvent } from '../../src/adapters/live/decode.ts';
import {
  createEventSourceFeed,
  liveStreamPath,
} from '../../src/adapters/live/event-source-feed.ts';

test('every contract event is decoded', () => {
  assert.deepEqual(
    decodeLiveEvent('change', '{"epoch":"01JQ","seq":"9223372036854775807"}'),
    { type: 'change', epoch: '01JQ', seq: 9223372036854775807n },
  );
  assert.deepEqual(decodeLiveEvent('change', '{"epoch":"e","seq":"0"}'), {
    type: 'change',
    epoch: 'e',
    seq: 0n,
  });
  const longEpoch = 'э'.repeat(64);
  assert.equal(
    decodeLiveEvent('change', JSON.stringify({ epoch: longEpoch, seq: '1' }))
      ?.epoch,
    longEpoch,
  );
  assert.deepEqual(
    decodeLiveEvent('tick', '{"serverTime":"2026-10-12T12:01:00.5+03:00"}'),
    { type: 'tick', serverTime: '2026-10-12T12:01:00.5+03:00' },
  );
  assert.deepEqual(
    decodeLiveEvent(
      'session',
      '{"idleExpiresAt":"2026-10-12T12:30:00+03:00","absoluteExpiresAt":"2026-10-12T20:00:00+03:00"}',
    ),
    {
      type: 'session',
      idleExpiresAt: '2026-10-12T12:30:00+03:00',
      absoluteExpiresAt: '2026-10-12T20:00:00+03:00',
    },
  );
  for (const reason of ['signed_out', 'revoked', 'expired']) {
    assert.deepEqual(
      decodeLiveEvent('session-ended', JSON.stringify({ reason })),
      { type: 'session-ended', reason },
    );
  }
  assert.deepEqual(decodeLiveEvent('upstream', '{"available":false}'), {
    type: 'upstream',
    available: false,
  });
});

const malformed = [
  ['change', 'not json'],
  ['change', '[]'],
  ['change', 'null'],
  ['change', '{"epoch":"e","seq":1}'],
  ['change', '{"epoch":"e","seq":"01"}'],
  ['change', '{"epoch":"e","seq":"-1"}'],
  ['change', '{"epoch":"e","seq":"9223372036854775808"}'],
  ['change', '{"epoch":"","seq":"1"}'],
  ['change', JSON.stringify({ epoch: 'e'.repeat(65), seq: '1' })],
  ['change', '{"epoch":"e","seq":"1","extra":true}'],
  ['change', '{"epoch":"e"}'],
  ['tick', '{"serverTime":"2026-10-12T09:01:00Z"}'],
  ['tick', '{"serverTime":"2026-02-30T12:00:00+03:00"}'],
  ['tick', '{"serverTime":"2026-10-12"}'],
  ['session', '{"idleExpiresAt":"2026-10-12T12:30:00+03:00"}'],
  ['session-ended', '{"reason":"timeout"}'],
  ['upstream', '{"available":"false"}'],
];

for (const [name, data] of malformed) {
  test(`rejects ${name} ${data.slice(0, 40)}`, () => {
    assert.equal(decodeLiveEvent(name, data), undefined);
  });
}

test('the leap day exists only in leap years', () => {
  const tick = (date) =>
    decodeLiveEvent(
      'tick',
      JSON.stringify({ serverTime: `${date}T12:00:00+03:00` }),
    );
  assert.notEqual(tick('2028-02-29'), undefined);
  assert.equal(tick('2026-02-29'), undefined);
  assert.equal(tick('2100-02-29'), undefined);
  assert.notEqual(tick('2000-02-29'), undefined);
});

// EventSource stand-in: emit() dispatches like the browser.
class FakeEventSource {
  static last;
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.closed = false;
    this.listeners = new Map();
    FakeEventSource.last = this;
  }
  addEventListener(type, listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.readyState = 2;
    this.closed = true;
  }
  emit(type, data) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

function subscribe() {
  const events = [];
  const statuses = [];
  const feed = createEventSourceFeed((url) => new FakeEventSource(url));
  const unsubscribe = feed.subscribe(
    (event) => events.push(event),
    (status) => statuses.push(status),
  );
  return { source: FakeEventSource.last, events, statuses, unsubscribe };
}

test('the feed opens the live stream and reports decoded events', () => {
  const { source, events, statuses } = subscribe();
  assert.equal(source.url, liveStreamPath);
  assert.equal(liveStreamPath, '/api/live');
  assert.deepEqual(statuses, []);
  source.readyState = 1;
  source.emit('open');
  source.emit('upstream', '{"available":true}');
  assert.deepEqual(statuses, ['open']);
  assert.deepEqual(events, [{ type: 'upstream', available: true }]);
});

test('a browser retry reports connecting and keeps the source', () => {
  const { source, statuses } = subscribe();
  source.readyState = 0;
  source.emit('error');
  assert.deepEqual(statuses, ['connecting']);
  assert.equal(source.closed, false);
});

test('a source the browser closed reports closed', () => {
  const { source, statuses } = subscribe();
  source.readyState = 2;
  source.emit('error');
  assert.deepEqual(statuses, ['closed']);
});

test('a malformed event closes the source and reports a failure', () => {
  const { source, events, statuses } = subscribe();
  source.emit('open');
  source.emit('change', '{"epoch":"e","seq":1}');
  source.emit('change', '{"epoch":"e","seq":"1"}');
  assert.deepEqual(events, []);
  assert.deepEqual(statuses, ['open', 'closed']);
  assert.equal(source.closed, true);
});

test('nothing is reported after unsubscribe', () => {
  const { source, events, statuses, unsubscribe } = subscribe();
  unsubscribe();
  assert.equal(source.closed, true);
  source.emit('open');
  source.emit('error');
  source.emit('upstream', '{"available":true}');
  assert.deepEqual(events, []);
  assert.deepEqual(statuses, []);
});
