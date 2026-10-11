import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'bun:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cruiser = join(
  root,
  'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs',
);

function cruise(files) {
  const cwd = mkdtempSync(join(tmpdir(), 'umir-architecture-'));
  try {
    symlinkSync(join(root, 'node_modules'), join(cwd, 'node_modules'), 'dir');
    copyFileSync(join(root, 'package.json'), join(cwd, 'package.json'));
    copyFileSync(join(root, 'tsconfig.json'), join(cwd, 'tsconfig.json'));
    copyFileSync(
      join(root, '.dependency-cruiser.cjs'),
      join(cwd, '.dependency-cruiser.cjs'),
    );
    for (const [name, source] of Object.entries(files)) {
      const path = resolve(cwd, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, source);
    }
    const args = [
      cruiser,
      '--config',
      '.dependency-cruiser.cjs',
      '--no-ignore-known',
    ];
    const check = spawnSync('node', [...args, '--output-type', 'err', 'src'], {
      cwd,
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(check.error, undefined);
    const result = spawnSync(
      'node',
      [...args, '--output-type', 'json', 'src'],
      { cwd, encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(result.error, undefined);
    assert.ok(result.stdout.startsWith('{'), result.stderr || result.stdout);
    const graph = JSON.parse(result.stdout);
    return { status: check.status, violations: graph.summary.violations };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('accepts an empty typed entry point', () => {
  const result = cruise({ 'src/app/main.ts': 'export const ready = true;\n' });
  assert.equal(result.status, 0);
  assert.deepEqual(result.violations, []);
});

test('rejects framework imports from domain', () => {
  const result = cruise({
    'src/domain/value.ts': 'export { useState } from "react";\n',
  });
  assert.ok(result.status > 0, JSON.stringify(result.violations));
  assert.ok(
    result.violations.some((item) => item.rule.name === 'domain-only-domain'),
  );
});

test('accepts inward imports and app-owned composition', () => {
  const result = cruise({
    'src/domain/state.ts': 'export type State = "pending";\n',
    'src/application/port.ts':
      'import type { State } from "@/domain/state"; export type Port = () => State;\n',
    'src/adapters/http.ts':
      'import type { Port } from "../application/port"; export const read: Port = () => "pending";\n',
    'src/presentation/view.ts':
      'export type { Port } from "../application/port"; export { useState } from "react";\n',
    'src/app/main.ts':
      'export { read } from "../adapters/http"; export type { Port } from "../presentation/view";\n',
  });
  assert.equal(result.status, 0, JSON.stringify(result.violations));
});

const forbiddenImports = [
  [
    'domain cannot import application',
    'domain',
    'application',
    'domain-only-domain',
  ],
  [
    'application cannot import adapters',
    'application',
    'adapters',
    'application-only-inner',
  ],
  [
    'adapters cannot import presentation',
    'adapters',
    'presentation',
    'adapters-only-inner',
  ],
  [
    'presentation cannot import adapters',
    'presentation',
    'adapters',
    'presentation-only-inner',
  ],
  [
    'presentation cannot import app',
    'presentation',
    'app',
    'presentation-only-inner',
  ],
];

for (const [name, from, to, rule] of forbiddenImports) {
  test(name, () => {
    const result = cruise({
      [`src/${from}/from.ts`]: `export { value } from "../${to}/value";\n`,
      [`src/${to}/value.ts`]: 'export const value = true;\n',
    });
    assert.ok(result.status > 0, JSON.stringify(result.violations));
    assert.ok(result.violations.some((item) => item.rule.name === rule));
  });
}

const cases = [
  [
    'type-only upward import',
    {
      'src/domain/state.ts': 'export type { State } from "../adapters/dto";\n',
      'src/adapters/dto.ts': 'export type State = "pending";\n',
    },
    'domain-only-domain',
  ],
  [
    'alias upward import',
    {
      'src/application/run.ts': 'export { value } from "@/adapters/http";\n',
      'src/adapters/http.ts': 'export const value = true;\n',
    },
    'application-only-inner',
  ],
  [
    'application framework import',
    { 'src/application/run.ts': 'export { useState } from "react";\n' },
    'application-only-inner',
  ],
  [
    'literal dynamic upward import',
    {
      'src/application/run.ts':
        'export const load = () => import("../adapters/http");\n',
      'src/adapters/http.ts': 'export const value = true;\n',
    },
    'application-only-inner',
  ],
  [
    'cycle',
    {
      'src/domain/a.ts': 'export { b } from "./b"; export const a = true;\n',
      'src/domain/b.ts': 'export { a } from "./a"; export const b = true;\n',
    },
    'no-cycles',
  ],
  [
    'unresolved import',
    { 'src/app/main.ts': 'export { value } from "./missing";\n' },
    'no-unresolved',
  ],
  [
    'unclassified orphan',
    { 'src/misc.ts': 'export const value = true;\n' },
    'no-unclassified-orphans',
  ],
  [
    'unclassified importer',
    {
      'src/misc.ts': 'export { value } from "./domain/value";\n',
      'src/domain/value.ts': 'export const value = true;\n',
    },
    'no-unclassified-importers',
  ],
  [
    'production fixture import',
    {
      'src/app/main.ts': 'export { value } from "../../tests/fixture";\n',
      'tests/fixture.ts': 'export const value = true;\n',
    },
    'no-production-test-imports',
  ],
  [
    'test file inside production src',
    { 'src/domain/value.test.ts': 'export const value = true;\n' },
    'no-tests-in-src',
  ],
  [
    'Node builtin in browser app',
    { 'src/adapters/file.ts': 'export { readFile } from "node:fs";\n' },
    'no-node-builtins',
  ],
  [
    'runtime devDependency',
    { 'src/app/main.ts': 'export { ESLint } from "eslint";\n' },
    'no-runtime-dev-dependencies',
  ],
];

for (const [name, files, rule] of cases) {
  test(`rejects ${name}`, () => {
    const result = cruise(files);
    assert.ok(result.status > 0, JSON.stringify(result.violations));
    assert.ok(
      result.violations.some((item) => item.rule.name === rule),
      JSON.stringify(result.violations),
    );
  });
}
