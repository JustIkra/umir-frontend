import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('../../', import.meta.url));

async function lint(source, file = 'src/application/use-case.ts') {
  const cwd = mkdtempSync(join(tmpdir(), 'umir-code-'));
  try {
    symlinkSync(join(root, 'node_modules'), join(cwd, 'node_modules'), 'dir');
    copyFileSync(join(root, 'tsconfig.json'), join(cwd, 'tsconfig.json'));
    const filePath = join(cwd, file);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, source);
    const eslint = new ESLint({
      cwd,
      overrideConfigFile: join(root, 'eslint.config.mjs'),
    });
    const [result] = await eslint.lintFiles([filePath]);
    assert.ok(result);
    assert.ok(
      !result.messages.some((item) => item.fatal),
      JSON.stringify(result.messages),
    );
    return result.messages;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('accepts an injected asynchronous port', async () => {
  assert.deepEqual(
    await lint(
      'export const execute = async (port: () => Promise<string>): Promise<string> => port();\n',
    ),
    [],
  );
});

const cases = [
  [
    'floating promise',
    'export const execute = (): void => { Promise.resolve("pending"); };\n',
    '@typescript-eslint/no-floating-promises',
  ],
  [
    'unsafe any',
    'export const value: any = "pending";\n',
    '@typescript-eslint/no-explicit-any',
  ],
  [
    'missing result variant',
    'export const label = (state: "pending" | "unknown"): string => { switch(state) { case "pending": return "Pending"; } };\n',
    '@typescript-eslint/switch-exhaustiveness-check',
  ],
  [
    'ambient network',
    'export const read = () => fetch("/api/orders");\n',
    'no-restricted-globals',
  ],
  [
    'ambient time',
    'export const now = () => Date.now();\n',
    'no-restricted-globals',
  ],
  [
    'ambient storage',
    'export const read = () => localStorage.getItem("order");\n',
    'no-restricted-globals',
  ],
  [
    'global access escape',
    'export const now = () => globalThis.Date.now();\n',
    'no-restricted-globals',
  ],
  [
    'random ID',
    'export const id = () => Math.random();\n',
    'no-restricted-properties',
  ],
  [
    'nonliteral dynamic import',
    'export const load = (path: string) => import(path);\n',
    'no-restricted-syntax',
  ],
];

for (const [name, source, rule] of cases) {
  test(`rejects ${name}`, async () => {
    const messages = await lint(source);
    assert.ok(
      messages.some((item) => item.ruleId === rule && item.severity === 2),
      JSON.stringify(messages),
    );
  });
}

test('rejects a conditional React hook', async () => {
  const messages = await lint(
    'import { useState } from "react"; export function View({ enabled }: { enabled: boolean }) { if (enabled) { useState(0); } return null; }\n',
    'src/presentation/view.tsx',
  );
  assert.ok(
    messages.some((item) => item.ruleId === 'react-hooks/rules-of-hooks'),
  );
});

test('rejects JavaScript production source', async () => {
  const messages = await lint(
    'export const now = () => Date.now();\n',
    'src/domain/value.js',
  );
  assert.ok(messages.some((item) => item.ruleId === 'no-restricted-syntax'));
});

test('rejects IO from presentation', async () => {
  const messages = await lint(
    'export const read = () => window.fetch("/api/orders");\n',
    'src/presentation/read.ts',
  );
  assert.ok(messages.some((item) => item.ruleId === 'no-restricted-globals'));
});

for (const extension of ['mts', 'cts']) {
  test(`rejects production .${extension} source outside the chosen TS extensions`, async () => {
    const messages = await lint(
      'export const now = () => Date.now();\n',
      `src/domain/value.${extension}`,
    );
    assert.ok(messages.some((item) => item.ruleId === 'no-restricted-syntax'));
  });
}
