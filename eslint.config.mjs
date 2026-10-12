import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig([
  { ignores: ['dist/**', 'coverage/**', '.memory-base/**'] },
  {
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: process.cwd() },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-eval': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.type!="Literal"]',
          message:
            'Use a literal import so architecture checks can resolve the dependency.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{js,mjs,cjs,jsx,mts,cts}'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            'Production source uses TypeScript; move this file to .ts or .tsx.',
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}', 'src/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'self',
          'globalThis',
          'document',
          'navigator',
          'location',
          'fetch',
          'XMLHttpRequest',
          'WebSocket',
          'EventSource',
          'localStorage',
          'sessionStorage',
          'indexedDB',
          'caches',
          'crypto',
          'performance',
          'Date',
          'setTimeout',
          'setInterval',
          'requestAnimationFrame',
          'Worker',
          'SharedWorker',
          'BroadcastChannel',
          'process',
          'require',
          'Buffer',
          'console',
        ].map((name) => ({
          name,
          message: 'Inject this mechanism through an application port.',
        })),
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Inject identifiers or randomness through an application port.',
        },
      ],
    },
  },
  {
    files: ['src/presentation/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          globals: [
            'fetch',
            'XMLHttpRequest',
            'WebSocket',
            'EventSource',
            'localStorage',
            'sessionStorage',
            'indexedDB',
            'caches',
          ].map((name) => ({
            name,
            message: 'Call an application port; keep IO in adapters.',
          })),
          checkGlobalObject: true,
        },
      ],
    },
  },
]);
