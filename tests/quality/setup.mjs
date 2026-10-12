import { version } from 'bun';
import { readFileSync } from 'node:fs';

const expected = readFileSync(
  new URL('../../.bun-version', import.meta.url),
  'utf8',
).trim();
if (version !== expected) {
  throw new Error(
    `Tests require Bun ${expected}; found ${version}. Install the version in .bun-version.`,
  );
}
