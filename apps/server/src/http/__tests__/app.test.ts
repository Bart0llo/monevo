import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ProblemSchema } from '@monevo/contracts';
import { type AppConfig, createApp } from '../../app.js';
import type { ReadinessResult } from '../../modules/health/index.js';
import { captureLogger } from '../../test-support/logger.js';

const CONFIG: AppConfig = {
  appUrl: new URL('https://money.example.com'),
  trustProxy: 'loopback',
  corsAllowedOrigins: [],
  apiDocsEnabled: true,
  httpCompression: false,
};
const READY: ReadinessResult = { database: true, migrations: true, lifecycle: true };

function makeApp(
  options: { readiness?: ReadinessResult; config?: Partial<AppConfig>; webRoot?: string } = {},
) {
  const { logger, lines } = captureLogger();
  const app = createApp({
    config: { ...CONFIG, ...options.config },
    logger,
    readiness: { check: () => Promise.resolve(options.readiness ?? READY) },
    ...(options.webRoot === undefined ? {} : { webRoot: options.webRoot }),
  });
  return { app, lines };
}

function makeWebRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'monevo-web-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Monevo</title>');
  writeFileSync(join(root, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(join(root, 'sw.js'), '// sw');
  writeFileSync(join(root, 'manifest.webmanifest'), '{}');
  return root;
}

describe('health', () => {
  it('liveness returns ok', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('readiness returns ok when every check passes', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/v1/health/ready').expect(200)).body).toEqual({
      status: 'ok',
    });
  });

  it('readiness returns 503 listing only failing checks', async () => {
    const { app } = makeApp({ readiness: { database: false, migrations: true, lifecycle: false } });
    const res = await request(app).get('/api/v1/health/ready').expect(503);
    expect(res.body).toEqual({
      status: 'unavailable',
      checks: { database: 'fail', lifecycle: 'fail' },
    });
  });

  it('logs health requests at debug and other requests at info, without query strings', async () => {
    const { app, lines } = makeApp();
    await request(app).get('/api/v1/health?probe=secret');
    await request(app).get('/api/v1/nope?q=secret');
    const access = lines().filter((line) => line['msg'] === 'request');
    expect(access[0]).toMatchObject({
      level: 'debug',
      method: 'GET',
      route: '/api/v1/health',
      status: 200,
    });
    expect(access[1]).toMatchObject({ level: 'info', status: 404 });
    expect(typeof access[0]?.['durationMs']).toBe('number');
    expect(JSON.stringify(access)).not.toContain('secret');
  });
});

describe('request id', () => {
  it('generates a UUIDv7 when none is sent', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('echoes a valid incoming id and replaces an invalid one', async () => {
    const { app } = makeApp();
    expect(
      (await request(app).get('/api/v1/health').set('X-Request-Id', 'proxy-req-0001')).headers[
        'x-request-id'
      ],
    ).toBe('proxy-req-0001');
    const bad = await request(app).get('/api/v1/health').set('X-Request-Id', 'bad id <script>');
    expect(bad.headers['x-request-id']).not.toBe('bad id <script>');
  });
});

describe('problem+json', () => {
  it('unknown API paths return a 404 problem, never the SPA', async () => {
    const { app } = makeApp({ webRoot: makeWebRoot() });
    const res = await request(app)
      .get('/api/v1/does-not-exist')
      .set('Accept', 'text/html')
      .expect(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    const body = ProblemSchema.parse(res.body);
    expect(body).toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      type: 'https://monevo.app/problems/not-found',
    });
    expect(body.requestId).toBe(res.headers['x-request-id']);
    await request(app).get('/api').expect(404);
  });

  it('malformed JSON returns 400 MALFORMED_REQUEST', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_REQUEST');
  });

  it('bodies over 1 MB return 413 PAYLOAD_TOO_LARGE', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ a: 'x'.repeat(1_100_000) }));
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('unsupported charsets return 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json; charset=latin-9')
      .send('{}');
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

describe('security headers and CORS', () => {
  it('sets CSP and the other security headers', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/health');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('omits HSTS for http:// APP_URL', async () => {
    const { app } = makeApp({ config: { appUrl: new URL('http://localhost:3100') } });
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(String(res.headers['content-security-policy'])).not.toContain(
      'upgrade-insecure-requests',
    );
  });

  it('sends no CORS headers by default', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows listed origins without credentials and answers preflights', async () => {
    const { app } = makeApp({ config: { corsAllowedOrigins: ['https://app.example.com'] } });
    const ok = await request(app).get('/api/v1/health').set('Origin', 'https://app.example.com');
    expect(ok.headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect(ok.headers['access-control-allow-credentials']).toBeUndefined();
    const other = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example.com');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(preflight.headers['access-control-allow-methods']).toContain('PATCH');
  });
});

describe('OpenAPI', () => {
  it('serves the document and Swagger UI when enabled', async () => {
    const { app } = makeApp();
    const doc = await request(app).get('/api/v1/openapi.json').expect(200);
    expect(doc.body.openapi).toBe('3.1.0');
    expect(Object.keys(doc.body.paths)).toEqual(
      expect.arrayContaining([
        '/health',
        '/health/ready',
        '/auth/session',
        '/me',
        '/me/api-tokens',
        '/admin/users',
      ]),
    );
    expect(Object.keys(doc.body.components.securitySchemes)).toEqual(
      expect.arrayContaining(['cookieAuth', 'apiToken']),
    );
    const ui = await request(app).get('/api/v1/docs/').expect(200);
    expect(ui.text).toContain('swagger-ui');
    expect(ui.text).not.toMatch(/<script>(?!\s*<\/script>)/);
  });

  it('serves neither when API_DOCS_ENABLED=false', async () => {
    const { app } = makeApp({ config: { apiDocsEnabled: false } });
    await request(app).get('/api/v1/openapi.json').expect(404);
    await request(app).get('/api/v1/docs/').expect(404);
  });
});

describe('HTTP_COMPRESSION', () => {
  it('leaves responses uncompressed by default', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get('/api/v1/openapi.json')
      .set('Accept-Encoding', 'gzip')
      .expect(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('compresses responses when enabled', async () => {
    const { app } = makeApp({ config: { httpCompression: true } });
    const res = await request(app)
      .get('/api/v1/openapi.json')
      .set('Accept-Encoding', 'gzip')
      .expect(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.body.openapi).toBe('3.1.0');
  });
});

describe('static web app', () => {
  it('serves hashed assets as immutable and the shell files as no-cache', async () => {
    const { app } = makeApp({ webRoot: makeWebRoot() });
    const asset = await request(app).get('/assets/index-abc123.js').expect(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    for (const path of ['/sw.js', '/manifest.webmanifest']) {
      expect((await request(app).get(path).expect(200)).headers['cache-control']).toBe('no-cache');
    }
  });

  it('falls back to index.html for HTML navigations outside /api', async () => {
    const { app } = makeApp({ webRoot: makeWebRoot() });
    const res = await request(app).get('/transactions/123').set('Accept', 'text/html').expect(200);
    expect(res.text).toContain('<title>Monevo</title>');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect((await request(app).get('/').set('Accept', 'text/html').expect(200)).text).toContain(
      'Monevo',
    );
  });

  it('does not fall back for non-HTML requests or non-GET methods', async () => {
    const { app } = makeApp({ webRoot: makeWebRoot() });
    await request(app).get('/missing.png').set('Accept', 'image/png').expect(404);
    await request(app).post('/transactions').set('Accept', 'text/html').expect(404);
  });

  it('skips static hosting when the web build is missing', async () => {
    const { app } = makeApp({ webRoot: join(tmpdir(), 'monevo-no-such-dir') });
    await request(app).get('/').set('Accept', 'text/html').expect(404);
  });
});
