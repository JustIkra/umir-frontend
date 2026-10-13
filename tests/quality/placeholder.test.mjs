import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'bun:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
const sample = /Марина Белова|m\.belova|Восток Фуд|На Пушкинской/;
// The landing illustration shows its own sample screen.
const allowed = [
  'src/presentation/placeholder-account.ts',
  'src/presentation/landing/product-preview.tsx',
];

test('placeholder data lives in one module', () => {
  const module = join(root, 'src/presentation/placeholder-account.ts');
  assert.match(
    readFileSync(module, 'utf8'),
    /Temporary data from the Figma sample/,
  );
  const offenders = files(join(root, 'src'))
    .map((path) => relative(root, path))
    .filter(
      (path) =>
        !allowed.includes(path) &&
        sample.test(readFileSync(join(root, path), 'utf8')),
    );
  assert.deepEqual(offenders, []);
});
