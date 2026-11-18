#!/usr/bin/env node
// `pnpm i18n:check` (internationalization.md#tooling):
//  - en and pl define the same keys (namespace files and base keys),
//  - {{placeholders}} match across languages,
//  - plural keys have every category the language needs (Intl.PluralRules),
//  - errors.<CODE> keys equal ERROR_CODES from @monevo/contracts,
//  - every key used in apps/web/src exists, and no common-namespace key is unused.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(ROOT, 'packages/i18n/locales');
const WEB_SRC = join(ROOT, 'apps/web/src');
const SOURCE_LANGUAGE = 'en';
const DEFAULT_NAMESPACE = 'common';
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const problems = [];

function flatten(value, prefix = '', out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof child === 'string') out.set(path, child);
    else if (child !== null && typeof child === 'object') flatten(child, path, out);
    else problems.push(`non-string value at ${path}`);
  }
  return out;
}

function placeholders(text) {
  return [...text.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]).sort();
}

// language → namespace → (key → text)
const languages = readdirSync(LOCALES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const catalog = new Map();
for (const language of languages) {
  const namespaces = new Map();
  for (const file of readdirSync(join(LOCALES, language)).filter((name) => name.endsWith('.json'))) {
    namespaces.set(file.slice(0, -5), flatten(JSON.parse(readFileSync(join(LOCALES, language, file), 'utf8'))));
  }
  catalog.set(language, namespaces);
}

/** Groups plural variants under their base key: base → Map(category|'' → text). */
function baseKeys(keys) {
  const bases = new Map();
  for (const [key, text] of keys) {
    const match = PLURAL_SUFFIX.exec(key);
    const base = match ? key.slice(0, match.index) : key;
    const forms = bases.get(base) ?? new Map();
    forms.set(match ? match[1] : '', text);
    bases.set(base, forms);
  }
  return bases;
}

const source = catalog.get(SOURCE_LANGUAGE);
if (source === undefined) {
  console.error(`i18n:check: missing source language ${SOURCE_LANGUAGE}`);
  process.exit(1);
}

for (const language of languages) {
  const namespaces = catalog.get(language);
  const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
  for (const ns of new Set([...source.keys(), ...namespaces.keys()])) {
    if (!namespaces.has(ns)) {
      problems.push(`${language}: missing namespace ${ns}`);
      continue;
    }
    if (!source.has(ns)) {
      problems.push(`${language}: namespace ${ns} does not exist in ${SOURCE_LANGUAGE}`);
      continue;
    }
    const mine = baseKeys(namespaces.get(ns));
    const theirs = baseKeys(source.get(ns));
    for (const base of theirs.keys()) {
      if (!mine.has(base)) problems.push(`${language}: missing key ${ns}:${base}`);
    }
    for (const [base, forms] of mine) {
      if (!theirs.has(base)) {
        problems.push(`${language}: key ${ns}:${base} does not exist in ${SOURCE_LANGUAGE}`);
        continue;
      }
      const isPlural = [...forms.keys()].some((category) => category !== '');
      if (isPlural) {
        for (const category of categories) {
          if (!forms.has(category)) problems.push(`${language}: plural ${ns}:${base} lacks _${category}`);
        }
      }
      const expected = placeholders([...theirs.get(base).values()].join(' '));
      for (const [category, text] of forms) {
        const found = placeholders(text);
        const missing = [...new Set(expected)].filter((name) => !found.includes(name));
        const extra = found.filter((name) => !expected.includes(name));
        // A plural form may omit {{count}} (e.g. Polish "one" written as a word).
        const relevant = missing.filter((name) => !(category !== '' && name === 'count'));
        if (relevant.length > 0 || extra.length > 0) {
          const key = category === '' ? base : `${base}_${category}`;
          problems.push(
            `${language}: placeholders differ in ${ns}:${key} (missing: ${relevant.join(', ') || '-'}; unknown: ${extra.join(', ') || '-'})`,
          );
        }
      }
    }
  }
}

// errors namespace ⇔ ERROR_CODES. The contracts file has no imports, so Node loads it with type stripping.
const { ERROR_CODES } = await import(pathToFileURL(join(ROOT, 'packages/contracts/src/error-codes.ts')).href);
const errorKeys = new Set(source.get('errors')?.keys() ?? []);
for (const code of ERROR_CODES) {
  if (!errorKeys.has(code)) problems.push(`errors:${code} is missing (every ERROR_CODES entry needs a message)`);
}
for (const key of errorKeys) {
  if (!ERROR_CODES.includes(key)) problems.push(`errors:${key} is not an error code in @monevo/contracts`);
}

// Keys used by the web app. Literal t('…') calls must exist; any string literal or template prefix
// that names a key counts as a use (keys are also passed around as data, e.g. navigation labels).
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (['.ts', '.tsx'].includes(extname(entry.name)) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

function splitKey(key) {
  const colon = key.indexOf(':');
  return colon === -1 ? [DEFAULT_NAMESPACE, key] : [key.slice(0, colon), key.slice(colon + 1)];
}

const defined = new Map([...source].map(([ns, keys]) => [ns, baseKeys(keys)]));
const used = new Set();
const usedPrefixes = [];
for (const file of sourceFiles(WEB_SRC)) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\bt\(\s*(['"])([^'"]+)\1/g)) {
    const [ns, key] = splitKey(match[2]);
    if (!defined.get(ns)?.has(key)) problems.push(`${relative(ROOT, file)}: unknown key ${match[2]}`);
  }
  for (const match of text.matchAll(/(['"`])((?:\w+:)?[A-Za-z][\w-]*(?:\.[\w-]+)+)\1/g)) {
    used.add(splitKey(match[2]).join(':'));
  }
  for (const match of text.matchAll(/`((?:\w+:)?[A-Za-z][\w.-]*\.)\$\{/g)) {
    usedPrefixes.push(splitKey(match[1]).join(':'));
  }
}
for (const key of defined.get(DEFAULT_NAMESPACE)?.keys() ?? []) {
  const full = `${DEFAULT_NAMESPACE}:${key}`;
  if (!used.has(full) && !usedPrefixes.some((prefix) => full.startsWith(prefix))) {
    problems.push(`unused key ${full}`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\ni18n:check failed: ${problems.length} problem(s).`);
  process.exit(1);
}
const keyCount = [...source.values()].reduce((sum, keys) => sum + keys.size, 0);
console.log(`i18n:check passed: ${languages.join(', ')}; ${keyCount} keys per language.`);
