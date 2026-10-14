// Generates src/adapters/api/backend-v2.d.ts from the pinned contract. With
// --check it verifies the SHA-256 pins in api/README.md and that the committed
// file equals a fresh generation; npm run check runs it that way.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const root = fileURLToPath(new URL('..', import.meta.url));
const contract = join(root, 'api/ui-amendment-v1-composed-public.json');
const target = join(root, 'src/adapters/api/backend-v2.d.ts');
const check = process.argv.includes('--check');

function pins() {
  const readme = readFileSync(join(root, 'api/README.md'), 'utf8');
  const rows = [
    ...readme.matchAll(
      /^\| `([^`]+\.json)`\s*\|.+\|\s*`([0-9a-f]{64})`\s*\|$/gm,
    ),
  ];
  if (rows.length !== 3) {
    throw new Error('api/README.md must pin exactly three contract files');
  }
  return rows.map(([, file, hash]) => ({ file, hash }));
}

async function generate() {
  const dir = mkdtempSync(join(tmpdir(), 'umir-api-'));
  try {
    const out = join(dir, 'backend-v2.d.ts');
    execFileSync(
      join(root, 'node_modules/.bin/openapi-typescript'),
      [contract, '-o', out],
      { stdio: 'pipe' },
    );
    const options = await prettier.resolveConfig(target);
    return await prettier.format(readFileSync(out, 'utf8'), {
      ...options,
      filepath: target,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

let failed = false;
for (const { file, hash } of pins()) {
  const actual = createHash('sha256')
    .update(readFileSync(join(root, 'api', file)))
    .digest('hex');
  if (actual !== hash) {
    console.error(`api/${file}: SHA-256 ${actual}, api/README.md pins ${hash}`);
    failed = true;
  }
}
const types = await generate();
if (check) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // A missing file is reported below as out of date.
  }
  if (current !== types) {
    console.error(`${target} is out of date: run npm run api:types`);
    failed = true;
  }
} else {
  writeFileSync(target, types);
}
if (failed) process.exit(1);
