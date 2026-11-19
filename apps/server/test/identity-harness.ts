import { randomBytes } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { type MockIdp, startMockIdp } from '@monevo/mock-idp';
import { createApp } from '../src/app.js';
import type { IdentityRateLimits } from '../src/http/rate-limit.js';
import type { IdentityConfig } from '../src/identity.js';
import type { Clock } from '../src/infra/clock.js';
import { createOidcClient } from '../src/infra/oidc.js';
import { createPrismaClient, type PrismaClient } from '../src/infra/prisma.js';
import { createReadinessChecker } from '../src/modules/health/index.js';
import { captureLogger } from '../src/test-support/logger.js';
import { createTestDatabase, type TestDatabase } from './database.js';

// Integration harness for the identity modules: a migrated test database, the in-process mock
// OpenID Provider (tools/mock-idp) and the real app with a controllable clock
// (testing-strategy.md#4-test-data-and-environment).

export const APP_URL = 'http://localhost:3999';
export const CLIENT_ID = 'monevo-test';
export const CLIENT_SECRET = 'monevo-test-secret';

export interface MutableClock extends Clock {
  advance(ms: number): void;
  set(instant: Date): void;
}

export function mutableClock(start = Date.now()): MutableClock {
  let current = start;
  return {
    now: () => new Date(current),
    advance: (ms) => {
      current += ms;
    },
    set: (instant) => {
      current = instant.getTime();
    },
  };
}

export interface HarnessOptions {
  readonly adminGroup?: string;
  readonly publicClient?: boolean;
  /** Rate-limit overrides; defaults are raised so tests don't trip them. */
  readonly limits?: Partial<IdentityRateLimits>;
}

export interface Harness {
  readonly app: Express;
  readonly prisma: PrismaClient;
  readonly idp: MockIdp;
  readonly clock: MutableClock;
  readonly db: TestDatabase;
  readonly config: IdentityConfig;
  logLines(): Record<string, unknown>[];
  close(): Promise<void>;
}

const RELAXED = { limit: 10_000, windowMs: 60_000 };

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const db = await createTestDatabase();
  const idp = await startMockIdp({
    host: '127.0.0.1',
    clients: [
      {
        clientId: CLIENT_ID,
        ...(options.publicClient ? {} : { clientSecret: CLIENT_SECRET }),
        redirectUris: [`${APP_URL}/api/v1/auth/oidc/callback`],
        postLogoutRedirectUris: [`${APP_URL}/login`],
      },
    ],
  });
  const prisma = createPrismaClient({ databaseUrl: db.url, poolSize: 5 });
  const clock = mutableClock();
  const { logger, lines } = captureLogger();
  const config: IdentityConfig = {
    appUrl: new URL(APP_URL),
    insecureCookies: true,
    encryptionKey: randomBytes(32),
    oidc: {
      issuer: idp.issuer,
      clientId: CLIENT_ID,
      clientSecret: options.publicClient ? undefined : CLIENT_SECRET,
      scopes: ['openid', 'profile', 'email', 'groups'],
      adminGroup: options.adminGroup,
      displayName: 'Mock IdP',
      redirectUri: `${APP_URL}/api/v1/auth/oidc/callback`,
      postLogoutRedirectUri: `${APP_URL}/login`,
    },
    session: { idleDays: 30, absoluteDays: 90 },
  };
  const readiness = createReadinessChecker({
    ping: () => Promise.resolve(),
    pendingMigrations: () => Promise.resolve([]),
    lifecycle: { shuttingDown: false },
    logger,
  });
  const app = createApp({
    config: {
      appUrl: config.appUrl,
      trustProxy: false,
      corsAllowedOrigins: [],
      apiDocsEnabled: true,
      httpCompression: false,
    },
    logger,
    readiness,
    identity: {
      prisma,
      oidc: createOidcClient(config.oidc),
      clock,
      config,
      limits: { oidc: RELAXED, user: RELAXED, invalidCredential: RELAXED, ...options.limits },
    },
  });
  return {
    app,
    prisma,
    idp,
    clock,
    db,
    config,
    logLines: lines,
    close: async () => {
      await prisma.$disconnect();
      await idp.close();
      await db.drop();
    },
  };
}

export type Agent = ReturnType<typeof request.agent>;

export interface IdpUser {
  readonly username: string;
  readonly name?: string;
  readonly email?: string;
  readonly groups?: readonly string[];
}

export interface StartQuery {
  readonly intent?: 'login' | 'reauth';
  readonly returnTo?: string;
  readonly locale?: string;
  readonly timeZone?: string;
}

/** `/auth/oidc/start` → IdP authorization endpoint; returns the IdP URL. */
export async function startFlow(agent: Agent, query: StartQuery = {}): Promise<URL> {
  const res = await agent.get('/api/v1/auth/oidc/start').query(query).expect(302);
  return new URL(String(res.headers['location']));
}

/** Submits the mock IdP form; returns the redirect back to Monevo (path + query). */
export async function submitIdpForm(
  authorizeUrl: URL,
  user: IdpUser,
  decision: 'allow' | 'deny' = 'allow',
): Promise<string> {
  const page = await fetch(authorizeUrl);
  if (page.status !== 200) throw new Error(`mock IdP /authorize returned ${page.status}`);
  const form = new URLSearchParams(authorizeUrl.searchParams);
  form.set('username', user.username);
  form.set('name', user.name ?? '');
  form.set('email', user.email ?? '');
  form.set('groups', (user.groups ?? []).join(','));
  form.set('decision', decision);
  const res = await fetch(new URL('/authorize', authorizeUrl), {
    method: 'POST',
    body: form,
    redirect: 'manual',
  });
  const location = res.headers.get('location');
  if (res.status !== 302 || !location) throw new Error(`mock IdP POST returned ${res.status}`);
  const target = new URL(location);
  return `${target.pathname}${target.search}`;
}

/** Full sign-in; returns the final redirect location. */
export async function signIn(agent: Agent, user: IdpUser, query: StartQuery = {}): Promise<string> {
  const authorizeUrl = await startFlow(agent, query);
  const callback = await submitIdpForm(authorizeUrl, user);
  const res = await agent.get(callback).expect(302);
  return String(res.headers['location']);
}

export interface SessionInfo {
  readonly user: { id: string; displayName: string; email: string | null; role: string };
  readonly csrfToken: string;
  readonly recentAuthUntil: string | null;
  readonly onboardingRequired: boolean;
}

export async function sessionOf(agent: Agent): Promise<SessionInfo> {
  const res = await agent.get('/api/v1/auth/session').expect(200);
  return res.body as SessionInfo;
}

/** A signed-in agent with its CSRF token. */
export async function signedIn(
  app: Express,
  user: IdpUser,
  query: StartQuery = {},
): Promise<{ agent: Agent; session: SessionInfo }> {
  const agent = request.agent(app);
  await signIn(agent, user, query);
  return { agent, session: await sessionOf(agent) };
}
