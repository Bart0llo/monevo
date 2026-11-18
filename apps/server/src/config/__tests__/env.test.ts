import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfigError, ENV_SCHEMA, SECRET_VARIABLES, loadConfig } from '../env.js';

const KEY = Buffer.alloc(32, 7).toString('base64');
const BASE = {
  APP_URL: 'https://money.example.com',
  APP_ENCRYPTION_KEY: KEY,
  DATABASE_URL: 'postgresql://monevo:secret@db:5432/monevo',
} as const;

const noFiles = (path: string): string => {
  throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
};

function problemsOf(env: Record<string, string | undefined>, readFile = noFiles): string[] {
  try {
    loadConfig(env, readFile);
  } catch (error) {
    if (error instanceof ConfigError) return [...error.problems];
    throw error;
  }
  return [];
}

describe('loadConfig', () => {
  it('applies every default', () => {
    const config = loadConfig(BASE, noFiles);
    expect(config.appUrl.href).toBe('https://money.example.com/');
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('production');
    expect(config.logLevel).toBe('info');
    expect(config.encryptionKey).toEqual(Buffer.alloc(32, 7));
    expect(config.databaseUrl).toBe(BASE.DATABASE_URL);
    expect(config.databasePoolSize).toBe(10);
    expect(config.trustProxy).toBe('loopback, linklocal, uniquelocal');
    expect(config.insecureCookies).toBe(false);
    expect(config.corsAllowedOrigins).toEqual([]);
    expect(config.apiDocsEnabled).toBe(true);
  });

  it('treats empty strings as unset for optional variables', () => {
    const config = loadConfig({ ...BASE, PORT: '', LOG_LEVEL: undefined, API_DOCS_ENABLED: '' }, noFiles);
    expect(config.port).toBe(3000);
    expect(config.apiDocsEnabled).toBe(true);
  });

  it('parses explicit values', () => {
    const config = loadConfig(
      {
        ...BASE,
        PORT: '8080',
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        DATABASE_POOL_SIZE: '4',
        TRUST_PROXY: '1',
        INSECURE_COOKIES: 'true',
        APP_URL: 'http://localhost:5173',
        CORS_ALLOWED_ORIGINS: 'https://a.example.com, http://localhost:4000',
        API_DOCS_ENABLED: 'false',
      },
      noFiles,
    );
    expect(config).toMatchObject({
      port: 8080,
      nodeEnv: 'development',
      logLevel: 'debug',
      databasePoolSize: 4,
      trustProxy: 1,
      insecureCookies: true,
      corsAllowedOrigins: ['https://a.example.com', 'http://localhost:4000'],
      apiDocsEnabled: false,
    });
  });

  it('reports every missing required variable at once, by name', () => {
    const problems = problemsOf({});
    expect(problems).toHaveLength(3);
    expect(problems.join('\n')).toMatch(/APP_URL: is required/);
    expect(problems.join('\n')).toMatch(/APP_ENCRYPTION_KEY: is required/);
    expect(problems.join('\n')).toMatch(/DATABASE_URL: is required/);
  });

  it.each([
    ['APP_URL', 'not a url'],
    ['APP_URL', 'http://money.example.com'],
    ['PORT', '0'],
    ['PORT', '70000'],
    ['PORT', 'abc'],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['APP_ENCRYPTION_KEY', Buffer.alloc(16).toString('base64')],
    ['APP_ENCRYPTION_KEY', 'not base64 at all!'],
    ['DATABASE_URL', 'mysql://x@y/z'],
    ['DATABASE_POOL_SIZE', '0'],
    ['DATABASE_POOL_SIZE', '1.5'],
    ['INSECURE_COOKIES', 'yes'],
    ['API_DOCS_ENABLED', '1'],
    ['CORS_ALLOWED_ORIGINS', 'https://a.example.com/path'],
    ['CORS_ALLOWED_ORIGINS', '*'],
  ])('%s=%j produces a message naming the variable', (name, value) => {
    const problems = problemsOf({ ...BASE, [name]: value });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(new RegExp(`^${name}: `));
  });

  it('allows http:// APP_URL only with INSECURE_COOKIES=true', () => {
    expect(problemsOf({ ...BASE, APP_URL: 'http://localhost:3000' })[0]).toMatch(/INSECURE_COOKIES/);
    expect(problemsOf({ ...BASE, APP_URL: 'http://localhost:3000', INSECURE_COOKIES: 'true' })).toEqual([]);
  });

  it('never includes secret values in messages', () => {
    const message = problemsOf({ ...BASE, APP_ENCRYPTION_KEY: 'c2VjcmV0LXZhbHVl', DATABASE_URL: 'mysql://user:hunter2@h/d' }).join('\n');
    expect(message).not.toContain('c2VjcmV0LXZhbHVl');
    expect(message).not.toContain('hunter2');
  });

  describe('*_FILE secrets', () => {
    const files: Record<string, string> = {
      '/run/secrets/key': `${KEY}\n`,
      '/run/secrets/db': 'postgresql://monevo:from-file@db:5432/monevo\r\n',
    };
    const readFile = (path: string): string => files[path] ?? noFiles(path);

    it('reads values from files and trims trailing newlines', () => {
      const config = loadConfig(
        { APP_URL: BASE.APP_URL, APP_ENCRYPTION_KEY_FILE: '/run/secrets/key', DATABASE_URL_FILE: '/run/secrets/db' },
        readFile,
      );
      expect(config.encryptionKey).toEqual(Buffer.alloc(32, 7));
      expect(config.databaseUrl).toBe('postgresql://monevo:from-file@db:5432/monevo');
    });

    it.each(SECRET_VARIABLES)('fails when both %s and %s_FILE are set', (name) => {
      const problems = problemsOf({ ...BASE, [`${name}_FILE`]: `/run/secrets/x` }, readFile);
      expect(problems).toEqual([`${name}: set either ${name} or ${name}_FILE, not both`]);
    });

    it('reports an unreadable file once, naming the _FILE variable', () => {
      const problems = problemsOf({ APP_URL: BASE.APP_URL, APP_ENCRYPTION_KEY: KEY, DATABASE_URL_FILE: '/missing' }, readFile);
      expect(problems).toEqual(['DATABASE_URL_FILE: cannot read /missing (ENOENT)']);
    });
  });
});

describe('configuration.md', () => {
  // Every variable the code reads must be documented (configuration.md#5-testing).
  const doc = readFileSync(fileURLToPath(new URL('../../../../../docs/infrastructure/configuration.md', import.meta.url)), 'utf8');

  it.each(Object.keys(ENV_SCHEMA.shape))('documents %s', (name) => {
    expect(doc).toContain(`\`${name}\``);
  });

  it.each(SECRET_VARIABLES)('marks %s as a secret', (name) => {
    expect(doc).toContain(`\`${name}\` *(secret)*`);
  });
});
