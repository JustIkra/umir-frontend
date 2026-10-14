import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createCommandRunner } from '../../src/application/commands.ts';
import {
  createDeliveryFlow,
  deliveryKey,
} from '../../src/application/delivery-flow.ts';
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
              clearAll: () => {},
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

const storedDelivery = {
  userID: 'u',
  restaurantID: R,
  draft: {
    number: '1193',
    createdAt: '2026-10-14T09:30',
    lines: [
      {
        key: 1,
        productID: '130',
        quantity: '2,5',
        manufacturedAt: '2026-10-13T08:00',
        shelfLifeValue: '3',
        shelfLifeUnit: 'day',
        receivedAt: '2026-10-14T09:30',
      },
    ],
    nextKey: 2,
  },
  deliveryID: 'dlv-1',
  attempt: {
    commandID: 'saved-delivery-cmd',
    epoch: EPOCH,
    startedAt: 7,
    input: {
      deliveryID: 'dlv-1',
      number: '1193',
      createdAt: { civil: { localDateTime: '2026-10-14T09:30:00' } },
      expectedSettingsVersion: '1',
      lines: [
        {
          productID: '130',
          manufacturedAt: { civil: { localDateTime: '2026-10-13T08:00:00' } },
          shelfLife: { value: '3', unit: 'day' },
          receivedAt: { civil: { localDateTime: '2026-10-14T09:30:00' } },
          quantity: '2500',
        },
      ],
    },
  },
};

function servicesWithStoredDelivery() {
  const epochs = createEpochRegistry();
  const commands = createCommandRunner({
    newId: () => 'new-cmd',
    now: () => 0,
    epochs,
    onReset: () => {},
  });
  const flows = new Map();
  return {
    ...fakeServices(),
    commands,
    deliveryFlow: (restaurantID) => {
      if (!flows.has(restaurantID)) {
        flows.set(
          restaurantID,
          createDeliveryFlow({
            api: {},
            commands,
            epochs,
            storage: {
              load: () => storedDelivery,
              save: () => {},
              clear: () => {},
              clearAll: () => {},
            },
            newID: () => 'new-id',
            now: () => 42,
            restaurantID,
            userID: 'u',
            onReceived: () => {},
            onSettingsChanged: () => {},
            onUnauthenticated: () => {},
          }),
        );
      }
      return flows.get(restaurantID);
    },
  };
}

test('the restaurant loader restores a stored delivery attempt before the first render', async () => {
  const services = servicesWithStoredDelivery();
  assert.equal(services.commands.getSnapshot().length, 0);
  await createRestaurantLoader(services)({ params: { restaurantID: R } });
  const attempts = services.commands.getSnapshot();
  assert.deepEqual(
    attempts.map(({ key, commandID }) => [key, commandID]),
    [[deliveryKey(R), 'saved-delivery-cmd']],
  );
  assert.equal(services.deliveryFlow(R).getSnapshot().phase.kind, 'unknown');
});

test('the restaurant loader creates no delivery flow for a guest', async () => {
  let created = 0;
  const base = fakeServices({
    session: { status: 'anonymous', expired: false },
  });
  const services = {
    ...base,
    deliveryFlow: () => {
      created += 1;
      return undefined;
    },
  };
  await createRestaurantLoader(services)({ params: { restaurantID: R } });
  assert.equal(created, 0);
});
