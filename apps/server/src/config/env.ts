import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { parseBoolean, parseTrustProxy } from './parsers.js';

// Environment configuration. The canonical list of variables, defaults and rules is
// docs/infrastructure/configuration.md; a unit test fails when a key here is missing there.

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const DEFAULT_OIDC_SCOPES = 'openid profile email groups';

const NODE_ENVS = ['production', 'development', 'test'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/** Variables that also accept `<NAME>_FILE` (configuration.md, rule 3). */
export const SECRET_VARIABLES = [
  'APP_ENCRYPTION_KEY',
  'DATABASE_URL',
  'OIDC_CLIENT_SECRET',
] as const;

const booleanVar = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === '') return fallback;
      const parsed = parseBoolean(value);
      if (parsed === undefined) {
        ctx.addIssue({ code: 'custom', message: 'must be "true" or "false"' });
        return z.NEVER;
      }
      return parsed;
    });

const integerVar = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === '') return fallback;
      const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        ctx.addIssue({ code: 'custom', message: `must be an integer between ${min} and ${max}` });
        return z.NEVER;
      }
      return parsed;
    });

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

export const ENV_SCHEMA = z
  .object({
    APP_URL: z
      .string({ error: 'is required' })
      .min(1, 'is required')
      .refine(
        (value) => URL.canParse(value),
        'must be an absolute URL, e.g. https://money.example.com',
      )
      .transform((value) => new URL(value)),
    PORT: integerVar(3000, 1, 65535),
    NODE_ENV: z
      .enum(NODE_ENVS, { error: `must be one of ${NODE_ENVS.join(', ')}` })
      .optional()
      .transform((value) => value ?? 'production'),
    LOG_LEVEL: z
      .enum(LOG_LEVELS, { error: `must be one of ${LOG_LEVELS.join(', ')}` })
      .optional()
      .transform((value) => value ?? 'info'),
    APP_ENCRYPTION_KEY: z
      .string({ error: 'is required' })
      .min(1, 'is required')
      .transform((value, ctx) => {
        const key = /^[A-Za-z0-9+/]+={0,2}$/.test(value) ? Buffer.from(value, 'base64') : undefined;
        if (key?.length !== 32) {
          ctx.addIssue({
            code: 'custom',
            message: 'must be 32 random bytes encoded as base64 (e.g. `openssl rand -base64 32`)',
          });
          return z.NEVER;
        }
        return key;
      }),
    DATABASE_URL: z
      .string({ error: 'is required' })
      .min(1, 'is required')
      .refine(
        (value) => /^postgres(ql)?:\/\//.test(value) && URL.canParse(value),
        'must be a postgresql:// connection string',
      ),
    DATABASE_POOL_SIZE: integerVar(10, 1, 100),
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((value) =>
        parseTrustProxy(
          value === undefined || value === '' ? 'loopback, linklocal, uniquelocal' : value,
        ),
      ),
    INSECURE_COOKIES: booleanVar(false),
    CORS_ALLOWED_ORIGINS: z
      .string()
      .optional()
      .transform((value, ctx) => {
        const origins = (value ?? '')
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0);
        const invalid = origins.filter((origin) => !isOrigin(origin));
        if (invalid.length > 0) {
          ctx.addIssue({
            code: 'custom',
            message: `must be a comma-separated list of origins such as https://app.example.com (invalid: ${invalid.join(', ')})`,
          });
          return z.NEVER;
        }
        return origins;
      }),
    API_DOCS_ENABLED: booleanVar(true),
    HTTP_COMPRESSION: booleanVar(false),
    OIDC_ISSUER: z
      .string({ error: 'is required' })
      .min(1, 'is required')
      .refine(
        (value) => URL.canParse(value),
        'must be an absolute URL, e.g. https://accounts.example.com',
      )
      .transform((value) => new URL(value)),
    OIDC_CLIENT_ID: z.string({ error: 'is required' }).trim().min(1, 'is required'),
    OIDC_CLIENT_SECRET: z
      .string()
      .optional()
      .transform((value) => (value === undefined || value === '' ? undefined : value)),
    OIDC_SCOPES: z
      .string()
      .optional()
      .transform((value, ctx) => {
        const scopes = (value === undefined || value.trim() === '' ? DEFAULT_OIDC_SCOPES : value)
          .split(/\s+/)
          .filter((scope) => scope.length > 0);
        if (!scopes.includes('openid')) {
          ctx.addIssue({ code: 'custom', message: 'must include openid' });
          return z.NEVER;
        }
        return [...new Set(scopes)];
      }),
    OIDC_ADMIN_GROUP: z
      .string()
      .optional()
      .transform((value) =>
        value === undefined || value.trim() === '' ? undefined : value.trim(),
      ),
    OIDC_DISPLAY_NAME: z
      .string()
      .optional()
      .transform((value) =>
        value === undefined || value.trim() === '' ? 'Account Center' : value.trim(),
      )
      .refine((value) => value.length <= 60, 'must be at most 60 characters'),
    SESSION_IDLE_DAYS: integerVar(30, 1, 3650),
    SESSION_ABSOLUTE_DAYS: integerVar(90, 1, 3650),
  })
  .superRefine((env, ctx) => {
    if (
      env.APP_URL.protocol !== 'https:' &&
      !(env.APP_URL.protocol === 'http:' && env.INSECURE_COOKIES)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_URL'],
        message: 'must start with https:// (http:// is allowed only with INSECURE_COOKIES=true)',
      });
    }
    if (
      env.OIDC_ISSUER.protocol !== 'https:' &&
      !(env.OIDC_ISSUER.protocol === 'http:' && env.INSECURE_COOKIES)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_ISSUER'],
        message: 'must start with https:// (http:// is allowed only with INSECURE_COOKIES=true)',
      });
    }
    if (env.SESSION_ABSOLUTE_DAYS < env.SESSION_IDLE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_ABSOLUTE_DAYS'],
        message: 'must be greater than or equal to SESSION_IDLE_DAYS',
      });
    }
  });

export interface Config {
  readonly appUrl: URL;
  readonly port: number;
  readonly nodeEnv: NodeEnv;
  readonly logLevel: LogLevel;
  readonly encryptionKey: Buffer;
  readonly databaseUrl: string;
  readonly databasePoolSize: number;
  readonly trustProxy: boolean | number | string;
  readonly insecureCookies: boolean;
  readonly corsAllowedOrigins: readonly string[];
  readonly apiDocsEnabled: boolean;
  readonly httpCompression: boolean;
  readonly oidc: OidcConfig;
  readonly session: SessionConfig;
}

export interface OidcConfig {
  /** Issuer exactly as configured (string form, no normalization beyond URL parsing). */
  readonly issuer: string;
  readonly clientId: string;
  /** Undefined → public client (PKCE only). */
  readonly clientSecret: string | undefined;
  readonly scopes: readonly string[];
  readonly adminGroup: string | undefined;
  readonly displayName: string;
  /** `<APP_URL>/api/v1/auth/oidc/callback` */
  readonly redirectUri: string;
  /** `<APP_URL>/login` */
  readonly postLogoutRedirectUri: string;
}

export interface SessionConfig {
  readonly idleDays: number;
  readonly absoluteDays: number;
}

/** Startup configuration failure with one readable line per problem (never a stack trace). */
export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

type Env = Readonly<Record<string, string | undefined>>;
type ReadFile = (path: string) => string;

const readUtf8: ReadFile = (path) => readFileSync(path, 'utf8');

/** Resolves `<NAME>_FILE` variants into plain values. Setting both is an error. */
function resolveSecrets(
  env: Env,
  readFile: ReadFile,
  problems: string[],
): Record<string, string | undefined> {
  const resolved: Record<string, string | undefined> = { ...env };
  for (const name of SECRET_VARIABLES) {
    const filePath = env[`${name}_FILE`];
    if (filePath === undefined || filePath === '') continue;
    if (env[name] !== undefined && env[name] !== '') {
      problems.push(`${name}: set either ${name} or ${name}_FILE, not both`);
      continue;
    }
    try {
      resolved[name] = readFile(filePath).replace(/[\r\n]+$/, '');
    } catch (error) {
      const reason = error instanceof Error && 'code' in error ? String(error.code) : 'unreadable';
      problems.push(`${name}_FILE: cannot read ${filePath} (${reason})`);
    }
  }
  return resolved;
}

export function loadConfig(env: Env = process.env, readFile: ReadFile = readUtf8): Config {
  const problems: string[] = [];
  const resolved = resolveSecrets(env, readFile, problems);
  const result = ENV_SCHEMA.safeParse(resolved);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const name = String(issue.path[0] ?? 'environment');
      // A secret read from a file failed above; don't also report it as missing.
      if (
        problems.some(
          (problem) => problem.startsWith(`${name}_FILE:`) || problem.startsWith(`${name}:`),
        )
      )
        continue;
      problems.push(`${name}: ${issue.message}`);
    }
  }
  if (problems.length > 0 || !result.success) throw new ConfigError(problems);

  const data = result.data;
  return Object.freeze({
    appUrl: data.APP_URL,
    port: data.PORT,
    nodeEnv: data.NODE_ENV,
    logLevel: data.LOG_LEVEL,
    encryptionKey: data.APP_ENCRYPTION_KEY,
    databaseUrl: data.DATABASE_URL,
    databasePoolSize: data.DATABASE_POOL_SIZE,
    trustProxy: data.TRUST_PROXY,
    insecureCookies: data.INSECURE_COOKIES,
    corsAllowedOrigins: Object.freeze(data.CORS_ALLOWED_ORIGINS),
    apiDocsEnabled: data.API_DOCS_ENABLED,
    httpCompression: data.HTTP_COMPRESSION,
    oidc: Object.freeze({
      issuer: issuerString(data.OIDC_ISSUER),
      clientId: data.OIDC_CLIENT_ID,
      clientSecret: data.OIDC_CLIENT_SECRET,
      scopes: Object.freeze(data.OIDC_SCOPES),
      adminGroup: data.OIDC_ADMIN_GROUP,
      displayName: data.OIDC_DISPLAY_NAME,
      redirectUri: new URL('/api/v1/auth/oidc/callback', data.APP_URL).href,
      postLogoutRedirectUri: new URL('/login', data.APP_URL).href,
    }),
    session: Object.freeze({
      idleDays: data.SESSION_IDLE_DAYS,
      absoluteDays: data.SESSION_ABSOLUTE_DAYS,
    }),
  });
}

/** `https://ac.example.com/` → `https://ac.example.com` (URL adds a trailing slash to bare origins). */
function issuerString(url: URL): string {
  const href = url.href;
  return url.pathname === '/' && !url.search && href.endsWith('/') ? href.slice(0, -1) : href;
}
