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

// Vite inlines small SVGs as data: URIs with spaces and quotes; an unquoted
// url() around one is invalid CSS and the browser drops the declaration.
test('CSS url() around an imported asset is quoted', () => {
  const offenders = files(join(root, 'src'))
    .filter((path) => /\.tsx?$/.test(path))
    .flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .map((line, index) => [line, index])
        .filter(([line]) => /url\(\$\{/.test(line))
        .map(([, index]) => `${relative(root, path)}:${index + 1}`),
    );
  assert.deepEqual(offenders, []);
});
