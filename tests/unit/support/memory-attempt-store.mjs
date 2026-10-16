// A store of attempts in memory with the behavior of the AttemptStore port,
// for tests only. `corrupt` and `block` stand in for a damaged record and for
// storage that refuses every call.
const keyOf = (ref) =>
  JSON.stringify([
    ref.kind,
    ref.userID,
    ref.restaurantID,
    ref.kind === 'writeoff' ? ref.batchID : null,
  ]);

const refOf = (record) => ({
  kind: record.kind,
  userID: record.userID,
  restaurantID: record.restaurantID,
  ...(record.kind === 'writeoff' ? { batchID: record.payload.batchID } : {}),
});

export function createMemoryAttemptStore() {
  const records = new Map();
  const damaged = new Set();
  let blocked = false;
  const refs = new Map();
  const probe = (run) => (blocked ? { status: 'unavailable' } : run());
  return {
    block() {
      blocked = true;
    },
    corrupt(ref) {
      records.delete(keyOf(ref));
      refs.set(keyOf(ref), ref);
      damaged.add(keyOf(ref));
    },
    load: (ref) =>
      probe(() => {
        const key = keyOf(ref);
        if (damaged.has(key)) return { status: 'corrupt' };
        const record = records.get(key);
        return record === undefined
          ? { status: 'absent' }
          : { status: 'ok', record: structuredClone(record) };
      }),
    list: (userID) =>
      probe(() => ({
        status: 'ok',
        entries: [
          ...[...records.values()]
            .filter((record) => record.userID === userID)
            .map((record) => ({
              ref: refOf(record),
              result: { status: 'ok', record: structuredClone(record) },
            })),
          ...[...damaged]
            .map((key) => refs.get(key))
            .filter((ref) => ref.userID === userID)
            .map((ref) => ({ ref, result: { status: 'corrupt' } })),
        ],
      })),
    save(record) {
      if (blocked) return 'unavailable';
      const key = keyOf(refOf(record));
      damaged.delete(key);
      records.set(key, structuredClone(record));
      return 'ok';
    },
    remove(ref) {
      if (blocked) return 'unavailable';
      records.delete(keyOf(ref));
      damaged.delete(keyOf(ref));
      return 'ok';
    },
    discardCorrupt(ref) {
      if (blocked) return 'unavailable';
      if (!damaged.has(keyOf(ref))) return 'refused';
      damaged.delete(keyOf(ref));
      return 'ok';
    },
  };
}
