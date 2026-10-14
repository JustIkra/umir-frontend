import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createDeliveryFlowRegistry } from '../../src/application/delivery-flows.ts';

function fakeFlow(id) {
  return {
    id,
    disposed: false,
    dispose() {
      this.disposed = true;
    },
  };
}

test('one delivery flow per user and restaurant', () => {
  const created = [];
  const flows = createDeliveryFlowRegistry(
    (userID, restaurantID) => {
      const flow = fakeFlow(`${userID}/${restaurantID}`);
      created.push(flow);
      return flow;
    },
    { clearAll: () => {} },
  );
  assert.equal(flows.get('u1', 'r1'), flows.get('u1', 'r1'));
  assert.notEqual(flows.get('u1', 'r1'), flows.get('u2', 'r1'));
  assert.notEqual(flows.get('u1', 'r1'), flows.get('u1', 'r2'));
  assert.equal(created.length, 3);
});

test('a user change drops the delivery flows and the stored deliveries', () => {
  let cleared = 0;
  const flows = createDeliveryFlowRegistry((u, r) => fakeFlow(`${u}/${r}`), {
    clearAll: () => {
      cleared += 1;
    },
  });
  const first = flows.get('u1', 'r1');
  const second = flows.get('u1', 'r2');
  flows.forget();
  assert.equal(first.disposed, true);
  assert.equal(second.disposed, true);
  assert.equal(cleared, 1);
  assert.notEqual(flows.get('u1', 'r1'), first);
});

test('forget disposes the flows before the stored deliveries are cleared', () => {
  const order = [];
  const flows = createDeliveryFlowRegistry(
    () => ({
      dispose() {
        order.push('dispose');
      },
    }),
    {
      clearAll: () => {
        order.push('clearAll');
      },
    },
  );
  flows.get('u1', 'r1');
  flows.get('u1', 'r2');
  flows.forget();
  assert.deepEqual(order, ['dispose', 'dispose', 'clearAll']);
});
