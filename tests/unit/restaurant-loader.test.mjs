import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import {
  confirmKey,
  createOrderFlow,
} from '../../src/application/order-flow.ts';
import { createRestaurantLoader } from '../../src/presentation/app-shell/gates.tsx';
import { R, fakeServices } from './support/render-route.mjs';

const EPOCH = '55555555-5555-4555-8555-555555555555';
const at = { iso: '2026-10-14T10:00:00+03:00', epochMs: 1 };
const proposal = {
  proposalID: 'prp-1',
  evaluatedAt: at,
  stateVersion: '1',
  requestedPositions: [{ lineNo: '1', dishID: '206', portions: '1' }],
  acceptedPositions: [{ lineNo: '1', dishID: '206', portions: '1' }],
  changes: [],
  warehouseEpoch: '66666666-6666-4666-8666-666666666666',
};
const stored = {
  userID: 'u',
  restaurantID: R,
  lines: [{ lineNo: 1, dishID: '206', portions: '1' }],
  attempt: {
    commandID: 'saved-cmd',
    proposalID: 'prp-1',
    runtimeEpoch: EPOCH,
    proposal,
    startedAt: 7,
    state: 'sent',
  },
};

function servicesWithStoredAttempt() {
  const epochs = createEpochRegistry();
  epochs.record(R, 'serving', EPOCH);
  const commands = createCommandRunner({
    newId: () => 'new-cmd',
    now: () => 0,
    epochs,
    onReset: () => {},
  });
  const flows = new Map();
  const services = {
    ...fakeServices(),
    commands,
    orderFlow: (restaurantID) => {
      if (!flows.has(restaurantID)) {
        flows.set(
          restaurantID,
          createOrderFlow({
            api: {},
            commands,
            epochs,
            storage: {
              load: () => stored,
              save: () => {},
              clear: () => {},
            },
            scheduler: { schedule: () => () => {} },
            now: () => 42,
            restaurantID,
            userID: 'u',
            onReset: () => {},
            onOrdered: () => {},
            onUnauthenticated: () => {},
          }),
        );
      }
      return flows.get(restaurantID);
    },
  };
  return services;
}

test('the restaurant loader restores a stored order attempt before the first render', async () => {
  const services = servicesWithStoredAttempt();
  assert.equal(services.commands.getSnapshot().length, 0);
  await createRestaurantLoader(services)({ params: { restaurantID: R } });
  const attempts = services.commands.getSnapshot();
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].key, confirmKey(R));
});

test('the restaurant loader creates no order flow for a guest', async () => {
  let created = 0;
  const base = fakeServices({
    session: { status: 'anonymous', expired: false },
  });
  const services = {
    ...base,
    orderFlow: () => {
      created += 1;
      return undefined;
    },
  };
  await createRestaurantLoader(services)({ params: { restaurantID: R } });
  assert.equal(created, 0);
});
