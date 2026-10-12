const classified = '^src/(domain|application|adapters|presentation|app)/';
const testFiles =
  '(^|/)(tests?|__tests__|fixtures|__fixtures__|examples)(/|$)|\\.(test|spec)\\.[cm]?[jt]sx?$';
const layerRules = [
  ['domain-only-domain', 'domain', '^src/domain/'],
  ['application-only-inner', 'application', '^src/(domain|application)/'],
  [
    'adapters-only-inner',
    'adapters',
    '^src/(domain|application|adapters)/|(^|/)node_modules/',
  ],
  [
    'presentation-only-inner',
    'presentation',
    '^src/(domain|application|presentation)/|(^|/)node_modules/',
  ],
  ['app-only-source-and-runtime', 'app', `${classified}|(^|/)node_modules/`],
];

module.exports = {
  forbidden: [
    ...layerRules.map(([name, layer, allowed]) => ({
      name,
      severity: 'error',
      from: { path: `^src/${layer}/` },
      to: { pathNot: allowed },
    })),
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-unresolved',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-unclassified-importers',
      severity: 'error',
      from: { path: '^src/', pathNot: classified },
      to: {},
    },
    {
      name: 'no-unclassified-orphans',
      severity: 'error',
      from: { path: '^src/', pathNot: classified, orphan: true },
      to: {},
    },
    {
      name: 'no-production-test-imports',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: testFiles },
    },
    {
      name: 'no-tests-in-src',
      severity: 'error',
      from: { path: `^src/.*(?:${testFiles})`, orphan: true },
      to: {},
    },
    {
      name: 'no-test-importers-in-src',
      severity: 'error',
      from: { path: `^src/.*(?:${testFiles})` },
      to: {},
    },
    {
      name: 'no-node-builtins',
      severity: 'error',
      from: { path: '^src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-runtime-dev-dependencies',
      severity: 'error',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-undeclared-dependencies',
      severity: 'error',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      conditionNames: ['import', 'browser', 'default'],
      exportsFields: ['exports'],
      mainFields: ['browser', 'module', 'main'],
    },
  },
};
