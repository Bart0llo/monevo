import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from './document.js';

// `--write` regenerates apps/server/openapi.snapshot.json; `--check` fails when it is out of date.

const snapshotPath = fileURLToPath(new URL('../../openapi.snapshot.json', import.meta.url));
const generated = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
const mode = process.argv[2];

if (mode === '--write') {
  writeFileSync(snapshotPath, generated);
  console.log(`Wrote ${snapshotPath}`);
} else if (mode === '--check') {
  let committed = '';
  try {
    committed = readFileSync(snapshotPath, 'utf8');
  } catch {
    // Missing snapshot is reported below.
  }
  if (committed !== generated) {
    console.error('OpenAPI snapshot is out of date. Run `pnpm --filter @monevo/server openapi:generate` and review the diff.');
    process.exit(1);
  }
  console.log('OpenAPI snapshot is up to date.');
} else {
  console.error('Usage: snapshot.ts --write | --check');
  process.exit(2);
}
