import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import i18next from 'eslint-plugin-i18next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import monevo from './tools/eslint-plugin-monevo/index.js';

// Lint rules: coding-conventions.md. Custom rules live in tools/eslint-plugin-monevo.

const TS = ['**/*.ts', '**/*.tsx'];

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
    ],
  },
  js.configs.recommended,
  {
    files: TS,
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
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
        { property: '$queryRawUnsafe', message: 'Use the tagged template `$queryRaw` (security.md#database).' },
        { property: '$executeRawUnsafe', message: 'Use the tagged template `$executeRaw` (security.md#database).' },
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
          'jsx-attributes': { include: ['^(aria-label|aria-description|title|alt|placeholder|label|description)$'] },
        },
      ],
    },
  },
  {
    // The clock itself, tests, and tooling may read the wall clock.
    files: [
      'apps/server/src/infra/clock.ts',
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
