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
const sample =
  /Марина Белова|m\.belova|Восток Фуд|На Пушкинской|Южного федерального|Ковалёва|restoran\.example|Уральская кухня|Тальятелле|Яйцо куриное|ord-20261010-0042|P-0158|Масло трюфельное/;
const allowed = ['src/presentation/landing/product-preview.tsx'];

test('production source has no prototype data or imports', () => {
  const offenders = files(join(root, 'src'))
    .map((path) => relative(root, path))
    .filter(
      (path) =>
        path.includes('placeholder-') ||
        /(?:placeholder-[a-z]+|examples\/ui-prototype)/.test(
          readFileSync(join(root, path), 'utf8'),
        ) ||
        (!allowed.includes(path) &&
          sample.test(readFileSync(join(root, path), 'utf8'))),
    );
  assert.deepEqual(offenders, []);
});
