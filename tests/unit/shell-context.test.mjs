import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  missingSectionOf,
  sectionOfPath,
} from '../../src/presentation/app-shell/paths.ts';
import {
  rolesCaption,
  shellContext,
} from '../../src/presentation/app-shell/shell-context.ts';
import { R, readyAccess, sampleRestaurant } from './support/render-route.mjs';

const unverified = {
  status: 'unverified',
  failure: { status: 404, code: 'NotFound' },
};

test('a ready restaurant shows its name, roles and permitted sections', () => {
  const context = shellContext(
    readyAccess([sampleRestaurant({ roles: ['Waiter'] })]),
    'restaurant',
    R,
  );
  assert.equal(context.title, 'На Пушкинской');
  assert.equal(context.caption, 'На Пушкинской · Официант');
  assert.deepEqual(context.sections, ['overview', 'orders', 'menu']);
});

test('roles read as in Figma; an administrator is named once', () => {
  assert.equal(rolesCaption(['Warehouse', 'Waiter']), 'Склад, Официант');
  assert.equal(rolesCaption(['Warehouse', 'Admin']), 'Администратор');
});

test('W13, W15, W16 and W17 leave the sidebar empty with their captions', () => {
  const access = readyAccess([
    sampleRestaurant({ lifecycle: 'registering', roles: [] }),
  ]);
  assert.deepEqual(
    [
      shellContext(readyAccess([]), 'none', undefined),
      shellContext(readyAccess(), 'revoked', R),
      shellContext(access, 'preparing', R),
      shellContext(unverified, 'unverified', undefined),
    ].map((context) => [
      context.caption,
      context.sections.length,
      context.title,
    ]),
    [
      ['Нет доступных ресторанов', 0, 'Ровный ход'],
      ['Доступ к ресторану отозван', 0, 'Ровный ход'],
      ['На Пушкинской · подготавливается', 0, 'На Пушкинской'],
      ['Доступ не проверен', 0, 'Ровный ход'],
    ],
  );
});

test('without verified access a restaurant address keeps every section', () => {
  const context = shellContext(unverified, 'restaurant', R);
  assert.equal(context.caption, 'Доступ не проверен');
  assert.equal(context.sections.length, 6);
});

test('organization pages without any restaurant show «Нет доступных ресторанов»', () => {
  const context = shellContext(readyAccess([]), 'restaurant', undefined);
  assert.equal(context.caption, 'Нет доступных ресторанов');
  assert.deepEqual(context.sections, []);
});

test('the navigation state names a missing section only if it is a section', () => {
  assert.equal(missingSectionOf({ missingSection: 'warehouse' }), 'warehouse');
  assert.equal(missingSectionOf({ missingSection: 'weather' }), undefined);
  assert.equal(missingSectionOf(null), undefined);
});

test('the switcher keeps the section of a restaurant address; elsewhere it opens the overview', () => {
  assert.equal(sectionOfPath(`/app/r/${R}/warehouse/expiry`), 'warehouse');
  assert.equal(sectionOfPath(`/app/r/${R}`), 'overview');
  assert.equal(sectionOfPath('/app/settings'), 'overview');
  assert.equal(sectionOfPath('/app/organizations/yug'), 'overview');
});
