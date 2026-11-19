import { vi } from 'vitest';
import {
  type Account,
  type ApiToken,
  type Category,
  type Currency,
  type AuthSessionResponse,
  type ErrorCode,
  ERROR_STATUS,
  PROBLEM_CONTENT_TYPE,
  type Problem,
  type Profile,
  type UserRole,
  type UserSettings,
} from '@monevo/contracts';
import { setCsrfToken } from '../data/api';

// A stubbed `fetch` that plays the Monevo API for web unit tests. Each test describes the signed-in
// user; routes can be overridden per test.

export interface StubRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface StubResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly problem?: boolean;
}

export type StubHandler = (request: StubRequest) => StubResponse;

export interface ApiStubOptions {
  /** `null` means signed out. */
  readonly role?: UserRole | null;
  readonly onboardingRequired?: boolean;
  readonly routes?: Readonly<Record<string, StubHandler>>;
}

export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const CSRF_TOKEN = 'csrf-test-token';
const NOW = '2026-11-19T10:00:00.000Z';

export function ok(body: unknown, status = 200): StubResponse {
  return { status, body };
}

export function problem(code: ErrorCode, title: string = code): StubResponse {
  const status = ERROR_STATUS[code];
  const body: Problem = { type: 'about:blank', title, status, code, requestId: 'req-test' };
  return { status, body, problem: true };
}

export function tokenFixture(overrides: Partial<ApiToken> = {}): ApiToken {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Home Assistant',
    displayPrefix: 'mnv_pat_abcd',
    permissions: ['profile:read'],
    status: 'ACTIVE',
    createdAt: NOW,
    expiresAt: null,
    lastUsedAt: null,
    lastUsedIp: null,
    revokedAt: null,
    ...overrides,
  };
}

export const CURRENCIES: Currency[] = [
  { code: 'EUR', exponent: 2, name: 'Euro', active: true },
  { code: 'HRK', exponent: 2, name: 'Croatian Kuna', active: false },
  { code: 'JPY', exponent: 0, name: 'Japanese Yen', active: true },
  { code: 'PLN', exponent: 2, name: 'Polish Zloty', active: true },
  { code: 'USD', exponent: 2, name: 'US Dollar', active: true },
];

export function accountFixture(overrides: Partial<Account> = {}): Account {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Main bank',
    currency: 'PLN',
    kind: 'BANK',
    customKindLabel: null,
    icon: 'bank',
    color: 'blue',
    openingBalance: '1250.50',
    openingDate: '2026-11-01',
    includeInNetWorthWidget: true,
    sortOrder: 0,
    archivedAt: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function categoryFixture(overrides: Partial<Category> = {}): Category {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Food',
    type: 'EXPENSE',
    parentId: null,
    icon: 'shopping-cart',
    color: 'green',
    sortOrder: 0,
    archivedAt: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function stubApi(options: ApiStubOptions = {}) {
  const role = options.role === undefined ? 'USER' : options.role;
  const calls: StubRequest[] = [];
  let settings: UserSettings = {
    locale: 'en',
    timeZone: 'Europe/Warsaw',
    baseCurrency: 'PLN',
    weekStart: 'MONDAY',
    dateFormat: 'LOCALE',
    theme: 'SYSTEM',
    onboardingCompletedAt: options.onboardingRequired ? null : NOW,
    version: 1,
    updatedAt: NOW,
  };
  const profile: Profile | null =
    role === null
      ? null
      : { id: USER_ID, displayName: 'Ada', email: 'ada@example.test', role, createdAt: NOW };
  const session: AuthSessionResponse | null =
    profile === null
      ? null
      : {
          user: { id: USER_ID, displayName: 'Ada', email: 'ada@example.test', role: profile.role },
          csrfToken: CSRF_TOKEN,
          recentAuthUntil: null,
          onboardingRequired: options.onboardingRequired ?? false,
        };

  const defaults: Record<string, StubHandler> = {
    'GET /auth/config': () => ok({ providerName: 'Account Center' }),
    'GET /auth/session': () => (session ? ok(session) : problem('UNAUTHENTICATED')),
    'POST /auth/logout': () => ok({ endSessionUrl: null }),
    'GET /me': () => (profile ? ok(profile) : problem('UNAUTHENTICATED')),
    'GET /me/settings': () => ok(settings),
    'PATCH /me/settings': ({ body }) => {
      const { version: _version, completeOnboarding, ...update } = body as Record<string, unknown>;
      settings = {
        ...settings,
        ...(update as Partial<UserSettings>),
        ...(completeOnboarding ? { onboardingCompletedAt: NOW } : {}),
        version: settings.version + 1,
      };
      return ok(settings);
    },
    'GET /me/sessions': () => ok({ items: [] }),
    'GET /me/api-tokens': () => ok({ items: [] }),
    'GET /admin/users': () => ok({ items: [], nextCursor: null }),
    'GET /currencies': () => ok({ items: CURRENCIES }),
    'GET /accounts': () => ok({ items: [] }),
    'GET /categories': () => ok({ items: [] }),
    'GET /admin/settings': () =>
      ok({
        rates: { provider: { value: 'frankfurter', default: 'frankfurter', lockedByEnv: false } },
      }),
    'POST /me/base-currency-change': ({ body }) => {
      const { baseCurrency } = body as { baseCurrency: string };
      settings = { ...settings, baseCurrency, version: settings.version + 1 };
      return ok(settings);
    },
  };
  const routes = { ...defaults, ...options.routes };

  const fetchStub = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    const method = (init.method ?? 'GET').toUpperCase();
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const request: StubRequest = {
      method,
      path: `${path}${url.search}`,
      headers: { ...(init.headers as Record<string, string> | undefined) },
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    };
    calls.push(request);
    const handler = routes[`${method} ${path}`];
    const response = handler ? handler(request) : problem('NOT_FOUND');
    if (response.status === 204) return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(
      new Response(JSON.stringify(response.body ?? null), {
        status: response.status,
        headers: {
          'Content-Type': response.problem ? PROBLEM_CONTENT_TYPE : 'application/json',
        },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchStub);
  setCsrfToken(null);
  return { calls, fetch: fetchStub };
}
