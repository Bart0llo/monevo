import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../document.js';

describe('OpenAPI document', () => {
  const document = buildOpenApiDocument();

  it('is OpenAPI 3.1 with the v1 base path', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.servers).toEqual([{ url: '/api/v1' }]);
  });

  it('marks public operations with an empty security requirement', () => {
    for (const path of ['/health', '/health/ready']) {
      expect(document.paths?.[path]?.get?.security).toEqual([]);
    }
  });

  it('includes the Problem schema', () => {
    expect(document.components?.schemas?.['Problem']).toBeDefined();
  });

  it('matches the committed snapshot', () => {
    const snapshot = readFileSync(fileURLToPath(new URL('../../../openapi.snapshot.json', import.meta.url)), 'utf8');
    expect(JSON.parse(snapshot)).toEqual(JSON.parse(JSON.stringify(document)));
  });
});
