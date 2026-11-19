import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import boundaries from 'eslint-plugin-boundaries';
import i18next from 'eslint-plugin-i18next';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import monevo from './tools/eslint-plugin-monevo/index.js';

// Lint rules: coding-conventions.md. Custom rules live in tools/eslint-plugin-monevo.

const TS = ['**/*.ts', '**/*.tsx'];
const CODE = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.mjs'];

// Package dependency rules (application-structure.md#package-responsibilities-and-dependency-rules,
// ADR-0012) and backend module entry points (ADR-0001, rule 4). Workspace imports such as `@monevo/domain`
// resolve through the TypeScript resolver to the package sources, so they are local elements.
const ELEMENTS = [
  { type: 'domain', pattern: 'packages/domain/**', partialMatch: false },
  { type: 'contracts', pattern: 'packages/contracts/**', partialMatch: false },
  { type: 'i18n', pattern: 'packages/i18n/**', partialMatch: false },
  {
    type: 'server-module',
    pattern: 'apps/server/src/modules/*',
    partialMatch: false,
    capture: ['module'],
  },
  { type: 'server', pattern: 'apps/server/**', partialMatch: false },
  { type: 'web', pattern: 'apps/web/src/**', partialMatch: false },
  { type: 'web-build', pattern: 'apps/web/**', partialMatch: false },
  { type: 'e2e', pattern: 'e2e/**', partialMatch: false },
  { type: 'tooling', pattern: '{scripts,tools}/**', partialMatch: false },
];
const SHARED = ['contracts', 'domain', 'i18n'];
const SERVER_ONLY = [
  '@prisma/*',
  'prisma',
  'pg',
  'pg-boss',
  'express',
  'helmet',
  'swagger-ui-express',
];
const BROWSER_ONLY = [
  'react',
  'react-dom',
  'react-dom/*',
  'react-router',
  'react-router/*',
  '@mantine/*',
];
const allowLocal = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: { type: to } } },
});
const disallowModules = (from, source, message) => ({
  from: { element: { type: from } },
  disallow: { to: { module: { origin: 'external', source } } },
  message,
});

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'apps/server/src/generated/**',
      'apps/web/dev-dist/**',
      'e2e/test-results/**',
      'e2e/playwright-report/**',
      // Project-level agent skills (gitignored, third-party scripts).
      '.claude/**',
    ],
  },
  js.configs.recommended,
  {
    files: CODE,
    // Root tool configuration files are not part of any boundaries element.
    ignores: ['eslint.config.js', '.release-it.js'],
    plugins: { boundaries, 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
      // eslint-plugin-boundaries reads the legacy resolver setting.
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      'boundaries/elements': ELEMENTS,
      'boundaries/files': [
        { pattern: '**/{__tests__,test}/**', category: 'test' },
        { pattern: '**/*.test.{ts,tsx}', category: 'test' },
      ],
    },
    rules: {
      // coding-conventions.md#1-general: import ordering.
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [{ pattern: '@monevo/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'never',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          checkAllOrigins: true,
          checkUnknownLocals: true,
          policies: [
            // Third-party and Node core modules are allowed unless a rule below forbids them.
            { allow: { to: { module: { origin: ['external', 'core'] } } } },
            allowLocal('domain', ['domain']),
            allowLocal('contracts', ['contracts', 'domain']),
            allowLocal('i18n', ['i18n']),
            allowLocal('server', ['server', ...SHARED]),
            allowLocal('server-module', ['server', ...SHARED]),
            // Other server code reaches a module only through its index.ts (application-structure.md
            // rule 4, ADR-0001); a module's own files may import each other.
            {
              from: { element: { type: ['server', 'server-module'] } },
              allow: { to: { element: { type: 'server-module', fileInternalPath: 'index.ts' } } },
            },
            {
              from: { element: { type: 'server-module' } },
              allow: {
                to: {
                  element: {
                    type: 'server-module',
                    captured: { module: '{{ from.element.captured.module }}' },
                  },
                },
              },
            },
            // Server integration tests may use dev tools such as the mock IdP; server src may not.
            {
              from: {
                element: { type: 'server' },
                file: { path: 'apps/server/test/**', categories: 'test' },
              },
              allow: { to: { element: { type: 'tooling' } } },
            },
            allowLocal('web', ['web', ...SHARED]),
            allowLocal('web-build', ['web-build', 'web', ...SHARED]),
            allowLocal('e2e', ['e2e']),
            allowLocal('tooling', ['tooling', ...SHARED]),
            disallowModules(
              'domain',
              [...SERVER_ONLY, ...BROWSER_ONLY],
              'domain is pure: no I/O, Prisma, Express or React.',
            ),
            {
              from: { element: { type: 'domain' } },
              disallow: { to: { module: { origin: 'core' } } },
              message: 'domain is pure: no Node.js APIs outside tests.',
            },
            disallowModules(
              'contracts',
              [...SERVER_ONLY, ...BROWSER_ONLY],
              'contracts hold schemas only: no Prisma, Express or React.',
            ),
            disallowModules(
              'i18n',
              [...SERVER_ONLY, ...BROWSER_ONLY],
              'i18n holds locale files and a tiny loader only.',
            ),
            disallowModules(
              'server',
              BROWSER_ONLY,
              'The server must not import browser UI libraries.',
            ),
            disallowModules(
              'web',
              SERVER_ONLY,
              'The web app must not import Prisma or server libraries.',
            ),
            {
              from: { element: { type: 'web' } },
              disallow: { to: { module: { origin: 'core' } } },
              message: 'The web app runs in the browser: no Node.js APIs.',
            },
          ],
        },
      ],
      'boundaries/no-unknown-files': 'error',
    },
  },
  {
    files: TS,
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    plugins: { monevo },
    rules: {
      'monevo/no-float-money': 'error',
      'monevo/no-ambient-time': 'error',
    },
  },
  {
    files: ['apps/server/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'monevo/no-unscoped-prisma': 'error',
      'no-restricted-properties': [
        'error',
        {
          property: '$queryRawUnsafe',
          message: 'Use the tagged template `$queryRaw` (security.md#database).',
        },
        {
          property: '$executeRawUnsafe',
          message: 'Use the tagged template `$executeRaw` (security.md#database).',
        },
      ],
    },
  },
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },

  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is forbidden (security.md#output-and-xss).',
        },
      ],
    },
  },
  {
    // All user-visible text goes through t() (coding-conventions.md).
    files: ['apps/web/src/features/**/*.tsx', 'apps/web/src/app/**/*.tsx'],
    extends: [i18next.configs['flat/recommended']],
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          // Only attributes that reach the user; props like size="h3" or c="dimmed" are not text.
          'jsx-attributes': {
            include: ['^(aria-label|aria-description|title|alt|placeholder|label|description)$'],
          },
        },
      ],
    },
  },
  {
    // The clock itself, tests, and tooling may read the wall clock.
    files: [
      'apps/server/src/infra/clock.ts',
      'apps/web/src/data/clock.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/__tests__/**',
      'apps/server/test/**',
      'e2e/**',
      'scripts/**',
      'tools/**',
    ],
    rules: { 'monevo/no-ambient-time': 'off' },
  },
  {
    // supertest response bodies are `any`; tests assert their shape explicitly.
    files: ['**/*.test.ts', '**/*.test.tsx', 'apps/server/test/**', 'e2e/**'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
);
