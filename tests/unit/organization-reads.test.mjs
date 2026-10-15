import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createOrganizationReads } from '../../src/application/organization-reads.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const context = {
  orgID: A,
  readerEpoch: 'e1',
  aggregateRevision: '5',
  evaluatedAt: { iso: '2026-10-15T10:00:00Z', epochMs: 0 },
};

// Two pages of members: the first points to the second.
function fakeApi() {
  const calls = [];
  return {
    calls,
    api: {
      members: (orgID, state, query) => {
        calls.push(['members', orgID, state, query]);
        return Promise.resolve(
          query.cursor === undefined
            ? { context, items: ['m1'], nextCursor: 'c1' }
            : { context, items: ['m2'], nextCursor: undefined },
        );
      },
      invitations: (orgID, state, query) => {
        calls.push(['invitations', orgID, state, query]);
        return Promise.resolve({
          context,
          items: ['i1'],
          nextCursor: undefined,
        });
      },
      organization: (orgID, query) => {
        calls.push(['organization', orgID, query]);
        return Promise.resolve({ orgID, name: 'Сеть' });
      },
    },
  };
}

function reads() {
  const fake = fakeApi();
  return {
    ...fake,
    reads: createOrganizationReads({ api: fake.api, now: () => 7000 }),
  };
}

test('one model per organization and kind', () => {
  const { reads: set } = reads();
  assert.equal(set.members(A), set.members(A));
  assert.notEqual(set.members(A), set.members(B));
  assert.equal(set.invitations(A), set.invitations(A));
  assert.notEqual(set.invitations(A), set.invitations(B));
  assert.equal(set.profile(A), set.profile(A));
  assert.notEqual(set.profile(A), set.profile(B));
});

test('subscribing reads both pages of the members', async () => {
  const { reads: set, calls } = reads();
  const model = set.members(A);
  model.subscribe(() => undefined);
  await settled();
  assert.deepEqual(calls, [
    ['members', A, 'active', { cursor: undefined, background: false }],
    ['members', A, 'active', { cursor: 'c1', background: false }],
  ]);
  const snapshot = model.getSnapshot();
  assert.deepEqual(snapshot.value.items, ['m1', 'm2']);
  assert.equal(snapshot.value.context.aggregateRevision, '5');
  assert.equal(snapshot.loadedAt, 7000);
});

test('invitations of every state and the profile are read', async () => {
  const { reads: set, calls } = reads();
  set.invitations(A).subscribe(() => undefined);
  set.profile(A).subscribe(() => undefined);
  await settled();
  assert.deepEqual(calls, [
    ['invitations', A, 'all', { cursor: undefined, background: false }],
    ['organization', A, { background: false }],
  ]);
  assert.equal(set.profile(A).getSnapshot().value.name, 'Сеть');
});

test('markStale reads again in the background', async () => {
  const { reads: set, calls } = reads();
  const model = set.members(A);
  model.subscribe(() => undefined);
  await settled();
  model.markStale('all');
  await settled();
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[2], [
    'members',
    A,
    'active',
    { cursor: undefined, background: true },
  ]);
  assert.deepEqual(calls[3], [
    'members',
    A,
    'active',
    { cursor: 'c1', background: true },
  ]);
});

test('the time tick does not read the lists again', async () => {
  const { reads: set, calls } = reads();
  const model = set.members(A);
  model.subscribe(() => undefined);
  await settled();
  model.markStale('time');
  await settled();
  assert.equal(calls.length, 2);
});

test('clear() forgets every model', () => {
  const { reads: set } = reads();
  const before = [set.members(A), set.invitations(A), set.profile(A)];
  set.clear();
  assert.notEqual(set.members(A), before[0]);
  assert.notEqual(set.invitations(A), before[1]);
  assert.notEqual(set.profile(A), before[2]);
});
