import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  attemptKeyPrefix,
  createAttemptStore,
} from '../../src/adapters/browser-storage/attempt-store.ts';
import { createMemoryAttemptStore } from './support/memory-attempt-store.mjs';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const R1 = '33333333-3333-4333-8333-333333333333';
const R2 = '44444444-4444-4444-8444-444444444444';
const B1 = '55555555-5555-4555-8555-555555555555';
const B2 = '66666666-6666-4666-8666-666666666666';

const civil = (localDateTime) => ({ civil: { localDateTime } });
const delivery = (userID = U1, restaurantID = R1) => ({
  kind: 'delivery',
  userID,
  restaurantID,
  commandID: 'c-delivery',
  epoch: 'epoch-1',
  startedAt: 1700,
  payload: {
    timeZone: 'Europe/Moscow',
    input: {
      deliveryID: 'd-1',
      number: 'ТН-1',
      createdAt: civil('2026-10-15T09:00:00'),
      expectedSettingsVersion: '3',
      lines: [
        {
          productID: 'p-1',
          quantity: '40000',
          manufacturedAt: civil('2026-10-14T09:00:00'),
          receivedAt: civil('2026-10-15T09:00:00'),
          shelfLife: { value: '5', unit: 'day' },
        },
      ],
    },
  },
});
const writeoff = (userID = U1, restaurantID = R1, batchID = B1) => ({
  kind: 'writeoff',
  userID,
  restaurantID,
  commandID: 'c-writeoff',
  epoch: undefined,
  startedAt: 1800,
  payload: { batchID },
});
const product = (userID = U1, restaurantID = R1) => ({
  kind: 'product',
  userID,
  restaurantID,
  commandID: 'c-product',
  epoch: 'epoch-1',
  startedAt: 1900,
  payload: { productID: 'p-2', name: 'Мука', baseUnit: 'g' },
});
const dish = (userID = U1, restaurantID = R1) => ({
  kind: 'dish',
  userID,
  restaurantID,
  commandID: 'c-dish',
  epoch: 'epoch-1',
  startedAt: 2000,
  payload: {
    dishID: '300',
    name: 'Блин',
    ingredients: [{ productID: 'p-2', quantity: '1500', baseUnit: 'g' }],
  },
});
const all = [delivery, writeoff, product, dish];
const refOf = (record) => ({
  kind: record.kind,
  userID: record.userID,
  restaurantID: record.restaurantID,
  ...(record.kind === 'writeoff' ? { batchID: record.payload.batchID } : {}),
});

function memoryStorage(entries = []) {
  const items = new Map(entries);
  const storage = {
    items,
    broken: { get: false, set: false, remove: false },
    get length() {
      if (storage.broken.get) throw new Error('blocked');
      return items.size;
    },
    key(index) {
      if (storage.broken.get) throw new Error('blocked');
      return [...items.keys()][index] ?? null;
    },
    getItem(key) {
      if (storage.broken.get) throw new Error('blocked');
      return items.get(key) ?? null;
    },
    setItem(key, value) {
      if (storage.broken.set) throw new Error('quota');
      items.set(key, value);
    },
    removeItem(key) {
      if (storage.broken.remove) throw new Error('blocked');
      items.delete(key);
    },
  };
  return storage;
}

// One set of behavior for the adapter on a Storage and for the stand-in kept
// in memory, so that the port is defined by what it does.
const kinds = {
  memory: () => {
    const store = createMemoryAttemptStore();
    return {
      store,
      corrupt: (ref) => store.corrupt(ref),
      block: () => store.block(),
    };
  },
  storage: () => {
    const storage = memoryStorage();
    const store = createAttemptStore(storage);
    return {
      store,
      corrupt: (ref) =>
        storage.items.set(
          `${attemptKeyPrefix}${ref.kind}.${ref.userID}.${ref.restaurantID}${
            ref.kind === 'writeoff' ? `.${ref.batchID}` : ''
          }`,
          '{"v":1',
        ),
      block: () => {
        storage.broken.get = true;
        storage.broken.set = true;
        storage.broken.remove = true;
      },
    };
  },
};

for (const [name, make] of Object.entries(kinds)) {
  const label = (text) => `${name}: ${text}`;

  test(label('a saved attempt comes back for the same user and place'), () => {
    const { store } = make();
    for (const build of all) {
      const record = build();
      assert.equal(store.load(refOf(record)).status, 'absent');
      assert.equal(store.save(record), 'ok');
      assert.deepEqual(store.load(refOf(record)), { status: 'ok', record });
    }
  });

  test(label('another user or restaurant does not see the attempt'), () => {
    const { store } = make();
    for (const build of all) {
      store.save(build());
      assert.equal(store.load(refOf(build(U2))).status, 'absent');
      assert.equal(store.load(refOf(build(U1, R2))).status, 'absent');
    }
  });

  test(label('write-offs of different batches are kept apart'), () => {
    const { store } = make();
    store.save(writeoff(U1, R1, B1));
    assert.equal(store.load(refOf(writeoff(U1, R1, B2))).status, 'absent');
    store.save(writeoff(U1, R1, B2));
    store.remove(refOf(writeoff(U1, R1, B1)));
    assert.equal(store.load(refOf(writeoff(U1, R1, B1))).status, 'absent');
    assert.equal(store.load(refOf(writeoff(U1, R1, B2))).status, 'ok');
  });

  test(label('two users share one tab without seeing each other'), () => {
    const { store } = make();
    store.save(delivery(U1));
    store.save({ ...delivery(U2), commandID: 'c-other' });
    assert.equal(
      store.load(refOf(delivery(U1))).record.commandID,
      'c-delivery',
    );
    assert.equal(store.load(refOf(delivery(U2))).record.commandID, 'c-other');
    store.remove(refOf(delivery(U2)));
    assert.equal(store.load(refOf(delivery(U1))).status, 'ok');
    assert.equal(store.load(refOf(delivery(U2))).status, 'absent');
  });

  test(label('list returns the records of one user only'), () => {
    const { store } = make();
    store.save(delivery(U1, R1));
    store.save(writeoff(U1, R2, B1));
    store.save(product(U2, R1));
    const listed = store.list(U1);
    assert.equal(listed.status, 'ok');
    const byKind = (a, b) => a.kind.localeCompare(b.kind);
    assert.deepEqual(
      listed.entries.map((entry) => entry.ref).sort(byKind),
      [refOf(delivery(U1, R1)), refOf(writeoff(U1, R2, B1))].sort(byKind),
    );
    assert.deepEqual(store.list('nobody'), { status: 'ok', entries: [] });
  });

  test(label('a damaged record is corrupt, stays and is listed'), () => {
    const { store, corrupt } = make();
    const ref = refOf(delivery());
    corrupt(ref);
    assert.deepEqual(store.load(ref), { status: 'corrupt' });
    assert.deepEqual(store.load(ref), { status: 'corrupt' });
    const entries = store.list(U1).entries;
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].ref, ref);
    assert.equal(entries[0].result.status, 'corrupt');
    assert.equal(store.list(U2).entries.length, 0);
  });

  test(label('discardCorrupt removes a damaged record only'), () => {
    const { store, corrupt } = make();
    const damaged = refOf(product());
    corrupt(damaged);
    assert.equal(store.discardCorrupt(damaged), 'ok');
    assert.equal(store.load(damaged).status, 'absent');
    const readable = dish();
    store.save(readable);
    assert.equal(store.discardCorrupt(refOf(readable)), 'refused');
    assert.deepEqual(store.load(refOf(readable)), {
      status: 'ok',
      record: readable,
    });
    assert.equal(store.discardCorrupt(refOf(delivery())), 'refused');
  });

  test(label('blocked storage answers unavailable without throwing'), () => {
    const { store, block } = make();
    store.save(delivery());
    block();
    assert.equal(store.save(delivery()), 'unavailable');
    assert.equal(store.load(refOf(delivery())).status, 'unavailable');
    assert.equal(store.list(U1).status, 'unavailable');
    assert.equal(store.remove(refOf(delivery())), 'unavailable');
    assert.equal(store.discardCorrupt(refOf(delivery())), 'unavailable');
  });
}

test('the adapter keys records by kind, user, restaurant and batch', () => {
  const storage = memoryStorage();
  const store = createAttemptStore(storage);
  for (const build of all) store.save(build());
  assert.deepEqual(
    [...storage.items.keys()].sort(),
    [
      `umir.attempt.delivery.${U1}.${R1}`,
      `umir.attempt.writeoff.${U1}.${R1}.${B1}`,
      `umir.attempt.product.${U1}.${R1}`,
      `umir.attempt.dish.${U1}.${R1}`,
    ].sort(),
  );
  const stored = JSON.parse(
    storage.items.get(`umir.attempt.writeoff.${U1}.${R1}.${B1}`),
  );
  assert.deepEqual(stored, {
    v: 1,
    kind: 'writeoff',
    userID: U1,
    restaurantID: R1,
    commandID: 'c-writeoff',
    startedAt: 1800,
    payload: { batchID: B1 },
  });
});

test('only the known fields reach the storage', () => {
  const storage = memoryStorage();
  const store = createAttemptStore(storage);
  const record = delivery();
  const secret = {
    ...record,
    password: 'hunter2',
    csrfToken: 'csrf',
    payload: {
      ...record.payload,
      cookie: 'sid=1',
      input: {
        ...record.payload.input,
        token: 't',
        lines: [{ ...record.payload.input.lines[0], model: { big: 1 } }],
      },
    },
  };
  assert.equal(store.save(secret), 'ok');
  const raw = [...storage.items.values()].join('');
  for (const word of ['hunter2', 'csrf', 'sid=1', 'model', '"token"']) {
    assert.equal(raw.includes(word), false, word);
  }
  assert.deepEqual(store.load(refOf(record)), { status: 'ok', record });
});

test('a record that cannot be stored safely is not saved', () => {
  const storage = memoryStorage();
  const store = createAttemptStore(storage);
  const bad = delivery();
  bad.payload.input.lines[0].quantity = '0';
  assert.equal(store.save(bad), 'unavailable');
  assert.equal(store.save({ ...writeoff(), userID: 'a.b' }), 'unavailable');
  assert.equal(storage.items.size, 0);
});

test('setItem that throws leaves the old record alone', () => {
  const storage = memoryStorage();
  const store = createAttemptStore(storage);
  store.save(delivery());
  storage.broken.set = true;
  assert.equal(
    store.save({ ...delivery(), commandID: 'c-new' }),
    'unavailable',
  );
  storage.broken.set = false;
  assert.equal(store.load(refOf(delivery())).record.commandID, 'c-delivery');
});

test('a storage that is missing makes every call unavailable', () => {
  const store = createAttemptStore(undefined);
  assert.equal(store.save(delivery()), 'unavailable');
  assert.equal(store.load(refOf(delivery())).status, 'unavailable');
  assert.equal(store.list(U1).status, 'unavailable');
  assert.equal(store.remove(refOf(delivery())), 'unavailable');
  assert.equal(store.discardCorrupt(refOf(delivery())), 'unavailable');
});

test('remove that fails reports it', () => {
  const storage = memoryStorage();
  const store = createAttemptStore(storage);
  store.save(delivery());
  storage.broken.remove = true;
  assert.equal(store.remove(refOf(delivery())), 'unavailable');
  assert.equal(store.load(refOf(delivery())).status, 'ok');
});

const keyOf = (record) =>
  `umir.attempt.${record.kind}.${record.userID}.${record.restaurantID}${
    record.kind === 'writeoff' ? `.${record.payload.batchID}` : ''
  }`;
const wire = (record) => ({ v: 1, ...record });

const damaged = {
  'invalid JSON': () => ['{"v":1', delivery()],
  'not an object': () => ['[1]', delivery()],
  'wrong version': () => [
    JSON.stringify({ ...wire(delivery()), v: 2 }),
    delivery(),
  ],
  'missing version': () => [
    JSON.stringify({ ...wire(delivery()), v: undefined }),
    delivery(),
  ],
  'another kind than the key': () => [
    JSON.stringify({ ...wire(product()), kind: 'dish' }),
    product(),
  ],
  'another user than the key': () => [
    JSON.stringify({ ...wire(delivery()), userID: U2 }),
    delivery(),
  ],
  'another restaurant than the key': () => [
    JSON.stringify({ ...wire(delivery()), restaurantID: R2 }),
    delivery(),
  ],
  'another batch than the key': () => [
    JSON.stringify({ ...wire(writeoff()), payload: { batchID: B2 } }),
    writeoff(),
  ],
  'no command id': () => [
    JSON.stringify({ ...wire(delivery()), commandID: undefined }),
    delivery(),
  ],
  'empty command id': () => [
    JSON.stringify({ ...wire(delivery()), commandID: '' }),
    delivery(),
  ],
  'epoch that is not text': () => [
    JSON.stringify({ ...wire(delivery()), epoch: 5 }),
    delivery(),
  ],
  'start time that is not a number': () => [
    JSON.stringify({ ...wire(delivery()), startedAt: '1700' }),
    delivery(),
  ],
  'start time that is not finite': () => [
    '{"v":1,"kind":"product","userID":"' +
      U1 +
      '","restaurantID":"' +
      R1 +
      '","commandID":"c","startedAt":1e999,"payload":{"productID":"p","name":"n","baseUnit":"g"}}',
    product(),
  ],
  'no payload': () => [
    JSON.stringify({ ...wire(dish()), payload: undefined }),
    dish(),
  ],
  'product with an unknown unit': () => [
    JSON.stringify({
      ...wire(product()),
      payload: { ...product().payload, baseUnit: 'kg' },
    }),
    product(),
  ],
  'product without a name': () => [
    JSON.stringify({
      ...wire(product()),
      payload: { productID: 'p-2', baseUnit: 'g' },
    }),
    product(),
  ],
  'dish ingredient with a bad quantity': () => [
    JSON.stringify({
      ...wire(dish()),
      payload: {
        ...dish().payload,
        ingredients: [{ productID: 'p', quantity: '1.5', baseUnit: 'g' }],
      },
    }),
    dish(),
  ],
  'dish ingredient that is not an object': () => [
    JSON.stringify({
      ...wire(dish()),
      payload: { ...dish().payload, ingredients: ['p'] },
    }),
    dish(),
  ],
  'dish without ingredients list': () => [
    JSON.stringify({
      ...wire(dish()),
      payload: { dishID: '300', name: 'Блин' },
    }),
    dish(),
  ],
  'write-off payload without a batch': () => [
    JSON.stringify({ ...wire(writeoff()), payload: {} }),
    writeoff(),
  ],
  'delivery without a time zone': () => {
    const record = delivery();
    return [
      JSON.stringify({
        ...wire(record),
        payload: { input: record.payload.input },
      }),
      record,
    ];
  },
  'delivery with lines that are not a list': () => {
    const record = delivery();
    return [
      JSON.stringify({
        ...wire(record),
        payload: {
          ...record.payload,
          input: { ...record.payload.input, lines: {} },
        },
      }),
      record,
    ];
  },
  'delivery without a civil creation time': () => {
    const record = delivery();
    return [
      JSON.stringify({
        ...wire(record),
        payload: {
          ...record.payload,
          input: { ...record.payload.input, createdAt: '2026-10-15' },
        },
      }),
      record,
    ];
  },
};

for (const [line, field, value] of [
  ['with no quantity', 'quantity', undefined],
  ['with zero quantity', 'quantity', '0'],
  ['with a leading zero', 'quantity', '01'],
  ['with a negative quantity', 'quantity', '-5'],
  ['with a fractional quantity', 'quantity', '1.5'],
  ['with a quantity longer than 18 digits', 'quantity', '1'.repeat(19)],
  ['with a numeric quantity', 'quantity', 5],
  ['with no product', 'productID', undefined],
  ['with a manufacture time that is not civil', 'manufacturedAt', {}],
  ['with a receipt time without text', 'receivedAt', civil(5)],
  ['with a shelf life in years', 'shelfLife', { value: '5', unit: 'year' }],
  ['with a numeric shelf life', 'shelfLife', { value: 5, unit: 'day' }],
]) {
  damaged[`delivery line ${line}`] = () => {
    const record = delivery();
    const next = { ...record.payload.input.lines[0], [field]: value };
    return [
      JSON.stringify({
        ...wire(record),
        payload: {
          ...record.payload,
          input: { ...record.payload.input, lines: [next] },
        },
      }),
      record,
    ];
  };
}

for (const [title, build] of Object.entries(damaged)) {
  test(`a record with ${title} is corrupt and stays`, () => {
    const [raw, record] = build();
    const storage = memoryStorage([[keyOf(record), raw]]);
    const store = createAttemptStore(storage);
    assert.deepEqual(store.load(refOf(record)), { status: 'corrupt' });
    assert.equal(storage.items.get(keyOf(record)), raw);
    const listed = store.list(record.userID);
    assert.equal(listed.entries.length, 1);
    assert.equal(listed.entries[0].result.status, 'corrupt');
    assert.equal(storage.items.get(keyOf(record)), raw);
  });
}

test('a delivery with several lines and no lines at all is readable', () => {
  const record = delivery();
  const line = record.payload.input.lines[0];
  record.payload.input.lines = [line, { ...line, productID: 'p-3' }];
  const storage = memoryStorage();
  const store = createAttemptStore(storage);
  store.save(record);
  assert.deepEqual(store.load(refOf(record)), { status: 'ok', record });
});

test('records of other users and keys that are not ours are never read', () => {
  const storage = memoryStorage([
    [`umir.attempt.delivery.${U2}.${R1}`, 'garbage'],
    [`umir.attempt.delivery.${U1}.${R1}.extra`, 'garbage'],
    [`umir.attempt.bogus.${U1}.${R1}`, 'garbage'],
    [`umir.order.${U1}.${R1}`, 'garbage'],
    [`other.${U1}`, 'garbage'],
  ]);
  const store = createAttemptStore(storage);
  assert.deepEqual(store.list(U1), { status: 'ok', entries: [] });
  assert.equal(store.load(refOf(delivery())).status, 'absent');
  assert.equal(storage.items.size, 5);
});

test('a user id that contains the separator never matches another user', () => {
  const storage = memoryStorage();
  const store = createAttemptStore(storage);
  store.save(delivery(U1));
  assert.deepEqual(store.list('11111111-1111-4111-8111'), {
    status: 'ok',
    entries: [],
  });
  assert.equal(store.load(refOf(delivery('a.b'))).status, 'absent');
});

test('discardCorrupt leaves a readable record in the storage', () => {
  const storage = memoryStorage();
  const store = createAttemptStore(storage);
  store.save(writeoff());
  assert.equal(store.discardCorrupt(refOf(writeoff())), 'refused');
  assert.equal(storage.items.size, 1);
});
