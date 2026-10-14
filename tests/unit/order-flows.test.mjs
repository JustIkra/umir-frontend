import assert from 'node:assert/strict';
import { test } from 'bun:test';
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
  const flows = createOrderFlowRegistry(
    (userID, restaurantID) => {
      const flow = fakeFlow(`${userID}/${restaurantID}`);
      created.push(flow);
      return flow;
    },
    { clearAll: () => {} },
  );
  assert.equal(flows.get('u1', 'r1'), flows.get('u1', 'r1'));
  assert.notEqual(flows.get('u1', 'r1'), flows.get('u2', 'r1'));
  assert.equal(created.length, 2);
});

test('a user change drops the order flows and the stored orders', () => {
  let cleared = 0;
  const flows = createOrderFlowRegistry((u, r) => fakeFlow(`${u}/${r}`), {
    clearAll: () => {
      cleared += 1;
    },
  });
  const first = flows.get('u1', 'r1');
  flows.forget();
  assert.equal(first.disposed, true);
  assert.equal(cleared, 1);
  assert.notEqual(flows.get('u1', 'r1'), first);
});
