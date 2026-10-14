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
// Names, codes and the fixed date of the Figma sample. The warehouse, the
// directories, the orders and the overview read backend v2 now.
const sample =
  /Марина Белова|m\.belova|Восток Фуд|На Пушкинской|Южного федерального|Ковалёва|restoran\.example|Уральская кухня|Тальятелле|Яйцо куриное|ord-20261010-0042|P-0158|Масло трюфельное|Суббота, 10 октября/;
// The landing illustration shows its own sample screen.
const allowed = [
  'src/presentation/placeholder-organizations.ts',
  'src/presentation/landing/product-preview.tsx',
];

test('placeholder data lives in marked modules', () => {
  for (const module of allowed.filter((path) => path.includes('placeholder-')))
    assert.match(
      readFileSync(join(root, module), 'utf8'),
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

test('only the organization screens keep sample modules', () => {
  assert.deepEqual(
    readdirSync(join(root, 'src/presentation')).filter((name) =>
      name.startsWith('placeholder-'),
    ),
    ['placeholder-organizations.ts'],
  );
});
