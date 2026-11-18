#!/usr/bin/env node
// `pnpm docs:check`: every relative link in docs/ and the root Markdown files points at an existing
// file, and every #anchor exists in its target (GitHub heading slugs or explicit <a id="…">).
// No dependencies on purpose (dependencies.md#workspace-tooling).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_FILES = ['CLAUDE.md', 'README.md'];

function markdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(path));
    else if (entry.name.endsWith('.md')) out.push(path);
  }
  return out;
}

/** Blanks fenced code blocks and inline code so links inside them are ignored. Keeps line numbers. */
function stripCode(text) {
  const lines = text.split('\n');
  let fence = null;
  const out = lines.map((line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (fence === null) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      return '';
    }
    return fence === null ? line : '';
  });
  return out.join('\n').replace(/(`+)[^`\n]*?\1/g, (m) => ' '.repeat(m.length));
}

/** GitHub-style heading slug. */
function slugify(heading) {
  const text = heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images → text
    .replace(/<[^>]+>/g, '') // inline HTML
    .replace(/[`*_~]/g, (c) => (c === '_' ? '_' : ''))
    .trim()
    .toLowerCase();
  return text.replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

const anchorCache = new Map();
function anchorsOf(file) {
  let anchors = anchorCache.get(file);
  if (anchors) return anchors;
  anchors = new Set();
  const counts = new Map();
  const text = readFileSync(file, 'utf8');
  const code = stripCode(text);
  for (const line of code.split('\n')) {
    const heading = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const base = slugify(heading[1]);
      const n = counts.get(base) ?? 0;
      counts.set(base, n + 1);
      anchors.add(n === 0 ? base : `${base}-${n}`);
    }
  }
  for (const match of text.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(match[1]);
  anchorCache.set(file, anchors);
  return anchors;
}

const files = [
  ...markdownFiles(join(ROOT, 'docs')),
  ...ROOT_FILES.map((name) => join(ROOT, name)).filter((path) => existsSync(path)),
];
const problems = [];
let checked = 0;

for (const file of files) {
  const lines = stripCode(readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, index) => {
    // Inline links and images: [text](target "title"). Reference definitions: [id]: target
    const targets = [
      ...[...line.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]),
      ...[...line.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/g)].map((m) => m[1]),
    ];
    for (const target of targets) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue; // external
      checked++;
      const where = `${relative(ROOT, file)}:${index + 1}`;
      const [rawPath, anchor] = target.split('#');
      const path = decodeURIComponent(rawPath ?? '');
      const destination = path === '' ? file : resolve(dirname(file), path);
      if (!existsSync(destination)) {
        problems.push(`${where}: missing file ${target}`);
        continue;
      }
      if (anchor === undefined || anchor === '') continue;
      if (statSync(destination).isDirectory() || !destination.endsWith('.md')) {
        problems.push(`${where}: anchor on a non-Markdown target ${target}`);
        continue;
      }
      if (!anchorsOf(destination).has(decodeURIComponent(anchor))) {
        problems.push(`${where}: missing anchor ${target}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\ndocs:check failed: ${problems.length} broken link(s) in ${files.length} files.`);
  process.exit(1);
}
console.log(`docs:check passed: ${checked} relative links in ${files.length} files.`);
