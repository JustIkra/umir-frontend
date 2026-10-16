import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createOrderStore } from '../../src/adapters/browser-storage/order-store.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import { createOrderFlow } from '../../src/application/order-flow.ts';
import { createOrderFlowRegistry } from '../../src/application/order-flows.ts';

function fakeFlow(id) {
  return {
    id,
    disposed: false,
    dispose() {
      this.disposed = true;
    },
  };
}

test('one flow per user and restaurant', () => {
  const created = [];
  const flows = createOrderFlowRegistry((userID, restaurantID) => {
    const flow = fakeFlow(`${userID}/${restaurantID}`);
    created.push(flow);
    return flow;
  });
  assert.equal(flows.get('u1', 'r1'), flows.get('u1', 'r1'));
  assert.notEqual(flows.get('u1', 'r1'), flows.get('u2', 'r1'));
  assert.equal(created.length, 2);
});

test('forgetting only stops the flows', () => {
  const flows = createOrderFlowRegistry((u, r) => fakeFlow(`${u}/${r}`));
  const first = flows.get('u1', 'r1');
  flows.forget();
  assert.equal(first.disposed, true);
  assert.notEqual(flows.get('u1', 'r1'), first);
});

const R = '33333333-3333-4333-8333-333333333333';
const EPOCH = '55555555-5555-4555-8555-555555555555';

function sessionStorageStub() {
  const items = new Map();
  return {
    items,
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

// The real flow and the real order store over one tab storage.
function tabRegistry(storage) {
  const epochs = createEpochRegistry();
  epochs.record(R, 'serving', EPOCH);
  let n = 0;
  const commands = createCommandRunner({
    newId: () => `cmd-${String((n += 1))}`,
    now: () => 0,
    epochs,
    onReset: () => {},
  });
  const store = createOrderStore(storage);
  return createOrderFlowRegistry((userID, restaurantID) =>
    createOrderFlow({
      api: {
        prepare: () => Promise.reject(new Error('unused')),
        confirm: () => Promise.reject(new Error('unused')),
        resolve: () => Promise.reject(new Error('unused')),
      },
      commands,
      epochs,
      storage: store,
      scheduler: { schedule: () => () => {} },
      now: () => 7,
      restaurantID,
      userID,
      onReset: () => {},
      onOrdered: () => {},
      onUnauthenticated: () => {},
    }),
  );
}

const proposal = {
  proposalID: 'prp-1',
  evaluatedAt: { iso: '2026-10-14T10:00:00+03:00', epochMs: 1 },
  stateVersion: '1',
  requestedPositions: [],
  acceptedPositions: [],
  changes: [],
  warehouseEpoch: '66666666-6666-4666-8666-666666666666',
};

test('sign-out and another user keep the unchecked order of the first user', () => {
  const storage = sessionStorageStub();
  storage.setItem(
    `umir.order.userA.${R}`,
    JSON.stringify({
      userID: 'userA',
      restaurantID: R,
      lines: [{ lineNo: 1, dishID: '206', portions: '2' }],
      attempt: {
        commandID: 'cmd-a',
        proposalID: 'prp-1',
        runtimeEpoch: EPOCH,
        proposal,
        startedAt: 5,
        state: 'sent',
      },
    }),
  );
  const flows = tabRegistry(storage);
  const before = flows.get('userA', R).getSnapshot();
  assert.equal(before.phase.kind, 'unknown');
  // Sign-out of A, then B signs in.
  flows.forget();
  const other = flows.get('userB', R).getSnapshot();
  assert.equal(other.phase.kind, 'compose');
  assert.deepEqual(other.draft, []);
  // B leaves, A returns: the attempt is back and is the same command.
  flows.forget();
  const again = flows.get('userA', R).getSnapshot();
  assert.equal(again.phase.kind, 'unknown');
  assert.equal(again.phase.attempt.commandID, 'cmd-a');
  assert.deepEqual(again.draft, before.draft);
  assert.ok(storage.items.has(`umir.order.userA.${R}`));
});
