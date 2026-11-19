// Test-only mock OpenID Provider standing in for Account Center (development-setup.md,
// testing-strategy.md). Zero dependencies: node:http + node:crypto. NEVER use it in production.
//
// Implements the subset Monevo relies on (authentication.md#account-center-specifics):
// discovery, JWKS (RS256 + kid), Authorization Code + PKCE S256 with required `state`, `iss` in the
// authorization response, a confidential or public token endpoint, refresh tokens rotated on every
// use with reuse detection (reuse revokes the family), userinfo and RP-Initiated Logout.
//
// The /authorize page is a form that accepts any username, name, email and groups; the username is
// the `sub`, so each distinct username is a distinct identity.
//
// Test hooks: POST /_test/revoke?sub=<sub> (revoke every grant of a subject), POST /_test/down
// (toggle: every OIDC endpoint answers 503; `?down=true|false` sets it), POST /_test/rotate-keys.

import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const CODE_TTL_MS = 60_000;
const ID_TOKEN_TTL_S = 600;
const ACCESS_TOKEN_TTL_S = 3600;
const MAX_BODY_BYTES = 64 * 1024;

const base64url = (input) => Buffer.from(input).toString('base64url');
const randomId = () => randomBytes(32).toString('base64url');
const nowSeconds = () => Math.floor(Date.now() / 1000);

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

function generateSigningKey() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = randomUUID();
  return {
    kid,
    privateKey,
    jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' },
  };
}

function signJwt(key, payload) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: key.kid }));
  const body = base64url(JSON.stringify(payload));
  const signature = sign('sha256', Buffer.from(`${header}.${body}`), key.privateKey);
  return `${header}.${body}.${signature.toString('base64url')}`;
}

function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(html);
}

function redirect(res, location) {
  res.writeHead(302, { location, 'cache-control': 'no-store' });
  res.end();
}

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem}
label{display:block;margin:.75rem 0 .25rem}input{width:100%;padding:.4rem;box-sizing:border-box}
.actions{display:flex;gap:.5rem;margin-top:1.25rem}button{padding:.5rem 1rem}</style></head>
<body>${body}</body></html>`;
}

/**
 * @param {import('./server.d.mts').MockIdpOptions} [options]
 * @returns {Promise<import('./server.d.mts').MockIdp>}
 */
export async function startMockIdp(options = {}) {
  const clients = new Map((options.clients ?? []).map((client) => [client.clientId, client]));
  let issuer = options.issuer?.replace(/\/$/, '');
  let keys = [generateSigningKey()];
  let down = false;
  /** In-process only: 'bad-signature' | 'wrong-nonce' | null (negative RP tests). */
  let misbehavior = null;
  const rogueKey = generateSigningKey();

  /** code -> grant */
  const codes = new Map();
  /** refresh token -> { familyId, used } */
  const refreshTokens = new Map();
  /** familyId -> { sub, clientId, scope, claims, authTime, revoked } */
  const families = new Map();
  /** access token -> { claims, expiresAt } */
  const accessTokens = new Map();

  const discovery = () => ({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/jwks`,
    end_session_endpoint: `${issuer}/logout`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    scopes_supported: ['openid', 'profile', 'email', 'groups', 'offline_access'],
    claims_supported: [
      'sub',
      'name',
      'preferred_username',
      'email',
      'groups',
      'auth_time',
      'amr',
      'nonce',
    ],
    authorization_response_iss_parameter_supported: true,
  });

  function userClaims(grant) {
    const scopes = new Set(grant.scope.split(' '));
    const claims = { sub: grant.sub };
    if (scopes.has('profile')) {
      if (grant.claims.name) claims.name = grant.claims.name;
      claims.preferred_username = grant.claims.username;
    }
    if (scopes.has('email') && grant.claims.email) claims.email = grant.claims.email;
    if (scopes.has('groups')) claims.groups = grant.claims.groups;
    return claims;
  }

  function issueTokens(grant, familyId, nonce) {
    const iat = nowSeconds();
    // A rogue key keeps the kid of the current key, so only the signature is wrong.
    const signingKey =
      misbehavior === 'bad-signature' ? { ...rogueKey, kid: keys[0].kid } : keys[0];
    const idNonce = nonce && misbehavior === 'wrong-nonce' ? randomId() : nonce;
    const idToken = signJwt(signingKey, {
      iss: issuer,
      aud: grant.clientId,
      iat,
      exp: iat + ID_TOKEN_TTL_S,
      auth_time: grant.authTime,
      amr: ['pwd'],
      ...(idNonce ? { nonce: idNonce } : {}),
      ...userClaims(grant),
    });
    const accessToken = randomId();
    accessTokens.set(accessToken, {
      claims: userClaims(grant),
      expiresAt: Date.now() + ACCESS_TOKEN_TTL_S * 1000,
    });
    const refreshToken = randomId();
    refreshTokens.set(refreshToken, { familyId, used: false });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_S,
      scope: grant.scope,
      id_token: idToken,
      refresh_token: refreshToken,
    };
  }

  function revokeFamily(familyId) {
    const family = families.get(familyId);
    if (family) family.revoked = true;
  }

  function revokeSubject(sub) {
    let count = 0;
    for (const family of families.values()) {
      if (family.sub === sub && !family.revoked) {
        family.revoked = true;
        count += 1;
      }
    }
    return count;
  }

  /** Returns the client, or a { error } object (client authentication, RFC 6749 §2.3). */
  function authenticateClient(req, body) {
    let clientId = body.get('client_id') ?? undefined;
    let secret = body.get('client_secret') ?? undefined;
    const header = req.headers.authorization;
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      clientId = decodeURIComponent(decoded.slice(0, separator));
      secret = decodeURIComponent(decoded.slice(separator + 1));
    }
    const client = clientId === undefined ? undefined : clients.get(clientId);
    if (!client) return { error: 'invalid_client' };
    if (client.clientSecret && secret !== client.clientSecret) return { error: 'invalid_client' };
    return { client };
  }

  function authorizeRequest(params) {
    const client = clients.get(params.get('client_id') ?? '');
    const redirectUri = params.get('redirect_uri') ?? '';
    if (!client || !client.redirectUris.includes(redirectUri)) {
      return { fatal: 'Unknown client_id or unregistered redirect_uri.' };
    }
    const fail = (error) => {
      const target = new URL(redirectUri);
      target.searchParams.set('error', error);
      const state = params.get('state');
      if (state) target.searchParams.set('state', state);
      target.searchParams.set('iss', issuer);
      return { redirect: target.href };
    };
    if (params.get('response_type') !== 'code') return fail('unsupported_response_type');
    if (!params.get('state')) return fail('invalid_request');
    if (params.get('code_challenge_method') !== 'S256' || !params.get('code_challenge')) {
      return fail('invalid_request');
    }
    const scope = params.get('scope') ?? '';
    if (!scope.split(' ').includes('openid')) return fail('invalid_scope');
    return { client, redirectUri, scope, fail };
  }

  const FORWARDED = [
    'client_id',
    'redirect_uri',
    'response_type',
    'scope',
    'state',
    'nonce',
    'code_challenge',
    'code_challenge_method',
    'prompt',
  ];

  function loginPage(params) {
    const hidden = FORWARDED.filter((name) => params.get(name) !== null)
      .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(params.get(name))}">`)
      .join('');
    return page(
      'Mock IdP sign-in',
      `<h1>Mock IdP</h1><p>Test-only identity provider. Any values are accepted.</p>
<form method="post" action="${escapeHtml(issuer)}/authorize">${hidden}
<label for="username">Username</label><input id="username" name="username" required autocomplete="off">
<label for="name">Name</label><input id="name" name="name" autocomplete="off">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="off">
<label for="groups">Groups (comma-separated)</label><input id="groups" name="groups" autocomplete="off">
<div class="actions"><button type="submit" name="decision" value="allow">Sign in</button>
<button type="submit" name="decision" value="deny">Deny</button></div></form>`,
    );
  }

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://mock-idp.invalid');
    const path = url.pathname;

    if (path.startsWith('/_test/')) {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
      if (path === '/_test/revoke') {
        const sub = url.searchParams.get('sub');
        if (!sub) return sendJson(res, 400, { error: 'sub is required' });
        return sendJson(res, 200, { revoked: revokeSubject(sub) });
      }
      if (path === '/_test/down') {
        const value = url.searchParams.get('down');
        down = value === null ? !down : value === 'true';
        return sendJson(res, 200, { down });
      }
      if (path === '/_test/rotate-keys') {
        keys = [generateSigningKey(), keys[0]];
        return sendJson(res, 200, { kid: keys[0].kid });
      }
      return sendJson(res, 404, { error: 'not_found' });
    }

    if (down) return sendJson(res, 503, { error: 'temporarily_unavailable' });

    if (path === '/.well-known/openid-configuration' && req.method === 'GET') {
      return sendJson(res, 200, discovery(), { 'cache-control': 'public, max-age=60' });
    }
    if (path === '/jwks' && req.method === 'GET') {
      return sendJson(res, 200, { keys: keys.map((key) => key.jwk) });
    }

    if (path === '/authorize' && req.method === 'GET') {
      const request = authorizeRequest(url.searchParams);
      if (request.fatal) return sendHtml(res, 400, page('Error', `<p>${request.fatal}</p>`));
      if (request.redirect) return redirect(res, request.redirect);
      // The mock keeps no browser session, so it can never satisfy prompt=none.
      if (url.searchParams.get('prompt') === 'none') {
        return redirect(res, request.fail('login_required').redirect);
      }
      return sendHtml(res, 200, loginPage(url.searchParams));
    }

    if (path === '/authorize' && req.method === 'POST') {
      const body = await readBody(req);
      const request = authorizeRequest(body);
      if (request.fatal) return sendHtml(res, 400, page('Error', `<p>${request.fatal}</p>`));
      if (request.redirect) return redirect(res, request.redirect);
      if (body.get('decision') === 'deny') {
        return redirect(res, request.fail('access_denied').redirect);
      }
      const username = (body.get('username') ?? '').trim();
      if (!username) return sendHtml(res, 400, loginPage(body));
      const code = randomId();
      codes.set(code, {
        clientId: request.client.clientId,
        redirectUri: request.redirectUri,
        scope: request.scope,
        nonce: body.get('nonce') || undefined,
        codeChallenge: body.get('code_challenge'),
        sub: username,
        authTime: nowSeconds(),
        claims: {
          username,
          name: (body.get('name') ?? '').trim() || undefined,
          email: (body.get('email') ?? '').trim() || undefined,
          groups: splitList(body.get('groups')),
        },
        expiresAt: Date.now() + CODE_TTL_MS,
      });
      const target = new URL(request.redirectUri);
      target.searchParams.set('code', code);
      target.searchParams.set('state', body.get('state') ?? '');
      target.searchParams.set('iss', issuer);
      return redirect(res, target.href);
    }

    if (path === '/token' && req.method === 'POST') {
      const body = await readBody(req);
      const auth = authenticateClient(req, body);
      if (auth.error) return sendJson(res, 401, { error: auth.error });
      const { client } = auth;
      const grantType = body.get('grant_type');

      if (grantType === 'authorization_code') {
        const code = body.get('code') ?? '';
        const grant = codes.get(code);
        codes.delete(code);
        if (
          !grant ||
          grant.expiresAt < Date.now() ||
          grant.clientId !== client.clientId ||
          grant.redirectUri !== body.get('redirect_uri')
        ) {
          return sendJson(res, 400, { error: 'invalid_grant' });
        }
        const verifier = body.get('code_verifier') ?? '';
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        if (!verifier || challenge !== grant.codeChallenge) {
          return sendJson(res, 400, { error: 'invalid_grant', error_description: 'PKCE failed' });
        }
        const familyId = randomId();
        families.set(familyId, {
          sub: grant.sub,
          clientId: grant.clientId,
          scope: grant.scope,
          claims: grant.claims,
          authTime: grant.authTime,
          revoked: false,
        });
        return sendJson(res, 200, issueTokens({ ...grant }, familyId, grant.nonce));
      }

      if (grantType === 'refresh_token') {
        const token = refreshTokens.get(body.get('refresh_token') ?? '');
        const family = token ? families.get(token.familyId) : undefined;
        if (!token || !family || family.clientId !== client.clientId) {
          return sendJson(res, 400, { error: 'invalid_grant' });
        }
        if (token.used) {
          // Reuse of a rotated token revokes the whole family (like Account Center).
          revokeFamily(token.familyId);
          return sendJson(res, 400, { error: 'invalid_grant', error_description: 'token reused' });
        }
        if (family.revoked) return sendJson(res, 400, { error: 'invalid_grant' });
        token.used = true;
        return sendJson(res, 200, issueTokens({ ...family }, token.familyId, undefined));
      }

      return sendJson(res, 400, { error: 'unsupported_grant_type' });
    }

    if (path === '/userinfo' && (req.method === 'GET' || req.method === 'POST')) {
      const header = req.headers.authorization ?? '';
      const entry = header.startsWith('Bearer ') ? accessTokens.get(header.slice(7)) : undefined;
      if (!entry || entry.expiresAt < Date.now()) {
        return sendJson(
          res,
          401,
          { error: 'invalid_token' },
          {
            'www-authenticate': 'Bearer error="invalid_token"',
          },
        );
      }
      return sendJson(res, 200, entry.claims);
    }

    if (path === '/logout' && req.method === 'GET') {
      const target = url.searchParams.get('post_logout_redirect_uri');
      const client = clients.get(url.searchParams.get('client_id') ?? '');
      if (target && client?.postLogoutRedirectUris?.includes(target)) {
        const location = new URL(target);
        const state = url.searchParams.get('state');
        if (state) location.searchParams.set('state', state);
        return redirect(res, location.href);
      }
      return sendHtml(res, 200, page('Signed out', '<h1>Signed out of the mock IdP</h1>'));
    }

    return sendJson(res, 404, { error: 'not_found' });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (!res.headersSent)
        sendJson(res, 500, { error: 'server_error', error_description: String(error) });
      else res.destroy();
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host, () => {
      server.off('error', reject);
      resolve(undefined);
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : (options.port ?? 0);
  issuer ??= `http://localhost:${port}`;

  return {
    issuer,
    port,
    revoke: revokeSubject,
    setDown: (value) => {
      down = value;
    },
    rotateKeys: () => {
      keys = [generateSigningKey(), keys[0]];
    },
    misbehave: (mode) => {
      misbehavior = mode;
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve(undefined)));
      }),
  };
}

function clientsFromEnv(env) {
  const clientId = env.MOCK_IDP_CLIENT_ID;
  if (!clientId) return [];
  return [
    {
      clientId,
      clientSecret: env.MOCK_IDP_CLIENT_SECRET || undefined,
      redirectUris: splitList(env.MOCK_IDP_REDIRECT_URIS),
      postLogoutRedirectUris: splitList(env.MOCK_IDP_POST_LOGOUT_REDIRECT_URIS),
    },
  ];
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.MOCK_IDP_PORT ?? 9400);
  const idp = await startMockIdp({
    port,
    issuer: process.env.MOCK_IDP_ISSUER ?? `http://localhost:${port}`,
    clients: clientsFromEnv(process.env),
  });
  process.stdout.write(`mock-idp listening on port ${idp.port}, issuer ${idp.issuer}\n`);
  const stop = () => {
    void idp.close().finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
