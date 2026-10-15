import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { collectPages } from '../../src/application/organizations.ts';

const context = (revision = '5', epoch = 'e1') => ({
  orgID: 'org',
  readerEpoch: epoch,
  aggregateRevision: revision,
  evaluatedAt: { iso: '2026-10-15T10:00:00Z', epochMs: 0 },
});

const page = (items, nextCursor, ctx = context()) => ({
  context: ctx,
  items,
  nextCursor,
});

const refresh = () =>
  new ApiError(localFailure('RefreshRequired', 'unavailable', 409));

// A reader that answers from a script and records the cursors it was asked.
function reader(...script) {
  const cursors = [];
  const read = (cursor) => {
    cursors.push(cursor);
    const next = script.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { cursors, read };
}

test('one page is the whole list', async () => {
  const { read, cursors } = reader(page(['a', 'b'], undefined));
  const list = await collectPages(read);
  assert.deepEqual(list.items, ['a', 'b']);
  assert.equal(list.context.aggregateRevision, '5');
  assert.deepEqual(cursors, [undefined]);
});

test('pages of one snapshot are joined in order', async () => {
  const { read, cursors } = reader(
    page(['a'], 'c1'),
    page(['b'], 'c2'),
    page(['c'], undefined),
  );
  const list = await collectPages(read);
  assert.deepEqual(list.items, ['a', 'b', 'c']);
  assert.deepEqual(cursors, [undefined, 'c1', 'c2']);
});

test('RefreshRequired on a later page starts the read over', async () => {
  const { read, cursors } = reader(
    page(['old'], 'c1'),
    refresh(),
    page(['a'], 'c9'),
    page(['b'], undefined),
  );
  const list = await collectPages(read);
  assert.deepEqual(list.items, ['a', 'b']);
  assert.deepEqual(cursors, [undefined, 'c1', undefined, 'c9']);
});

test('another revision or reader epoch between pages starts the read over', async () => {
  for (const changed of [context('6'), context('5', 'e2')]) {
    const { read } = reader(
      page(['old'], 'c1'),
      page(['mixed'], undefined, changed),
      page(['a'], undefined, changed),
    );
    const list = await collectPages(read);
    assert.deepEqual(list.items, ['a']);
    assert.equal(list.context.aggregateRevision, changed.aggregateRevision);
  }
});

test('three restarts in a row fail with RefreshRequired', async () => {
  const { read, cursors } = reader(
    page(['a'], 'c1'),
    refresh(),
    page(['a'], 'c1'),
    refresh(),
    page(['a'], 'c1'),
    refresh(),
  );
  await assert.rejects(
    collectPages(read),
    (error) =>
      error instanceof ApiError && error.failure.code === 'RefreshRequired',
  );
  assert.equal(cursors.length, 6);
});

test('a list that does not end is malformed, not partial', async () => {
  const read = (cursor) =>
    Promise.resolve(page(['x'], `c${String((cursor?.length ?? 0) + 1)}`));
  await assert.rejects(
    collectPages(read),
    (error) =>
      error instanceof ApiError &&
      error.failure.code === 'Malformed' &&
      error.failure.outcome === 'unavailable',
  );
});

test('at most 20 pages are read', async () => {
  let calls = 0;
  const read = () => {
    calls += 1;
    return Promise.resolve(page(['x'], 'next'));
  };
  await assert.rejects(collectPages(read));
  assert.equal(calls, 20);
});

test('RefreshRequired on the first page and other errors pass through', async () => {
  const first = refresh();
  await assert.rejects(
    collectPages(reader(first).read),
    (error) => error === first,
  );
  const other = new ApiError(localFailure('Forbidden', 'unavailable', 403));
  await assert.rejects(
    collectPages(reader(page(['a'], 'c1'), other).read),
    (error) => error === other,
  );
});
