import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { lookupOrganization } from '../../src/presentation/organizations/organization-layout.tsx';
import { ORG, readyAccess } from './support/render-route.mjs';

const retry = () => {};
const OTHER = '99999999-9999-4999-8999-999999999990';

test('an organization of access is ready', () => {
  const lookup = lookupOrganization(readyAccess(), ORG, retry);
  assert.equal(lookup.kind, 'ready');
  assert.equal(lookup.organization.orgID, ORG);
});

test('an organization access no longer has is missing, not thrown', () => {
  assert.deepEqual(lookupOrganization(readyAccess(), OTHER, retry), {
    kind: 'missing',
  });
  assert.deepEqual(lookupOrganization(readyAccess([]), ORG, retry), {
    kind: 'missing',
  });
});

test('an unverified refresh keeps the last known organizations', () => {
  const previous = readyAccess().organizations;
  const state = { status: 'unverified', previous };
  assert.equal(lookupOrganization(state, ORG, retry).kind, 'ready');
  assert.equal(lookupOrganization(state, OTHER, retry).kind, 'missing');
});

test('access without an answer is loading or failed', () => {
  assert.equal(
    lookupOrganization({ status: 'loading' }, ORG, retry).kind,
    'loading',
  );
  const failed = lookupOrganization(
    { status: 'unverified', previous: undefined },
    ORG,
    retry,
  );
  assert.equal(failed.kind, 'failed');
  assert.equal(failed.retry, retry);
});
