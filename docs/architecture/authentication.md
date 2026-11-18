# Authentication and Sessions

**[Proposed]**, see [ADR-0005](../decisions/ADR-0005-authentication-and-sessions.md). Confirm the implementation approach (own thin layer vs. better-auth) before Stage 2. This is the canonical document for session parameters. Covers R-AUTH-01..09. Personal API tokens for integrations are a separate credential type, canonical in [api-tokens.md](api-tokens.md) ([ADR-0017](../decisions/ADR-0017-personal-api-tokens.md)).

## 1. Account model

```
User:          id, email (citext, unique), emailVerifiedAt?, displayName, role (USER|ADMIN),
               status (ACTIVE|DEACTIVATED), passwordHash? (null = no local credential),
               passwordChangedAt?, storageQuotaBytes? (null = instance default), storageUsedBytes,
               lastLoginAt?, createdAt
UserIdentity:  id, userId, issuer, subject, emailAtLink?, linkedAt, lastUsedAt
               UNIQUE(issuer, subject); UNIQUE(userId, issuer)   -- one identity per provider per user
AuthToken:     id, userId, purpose (EMAIL_VERIFY|PASSWORD_RESET|EMAIL_CHANGE|OIDC_LINK),
               tokenHash, payload (e.g. new email), expiresAt, usedAt?
Session:       see §4
```

One user can have a password, an OIDC identity, or both. Login method does not create separate accounts.

## 2. Local authentication

| Aspect | Rule |
|---|---|
| Hashing | **argon2id** via `argon2`, OWASP parameters (m=19 MiB, t=2, p=1 minimum; tune to ~250 ms on target hardware). The parameters are stored in the hash string, so rehash on login if they are outdated. |
| Password policy | Min 12 characters, max 256, no composition rules. Reject the top-10k common passwords (bundled list) and passwords equal to the email. (NIST SP 800-63B.) |
| Registration | `POST /auth/register` (email, password, displayName, locale, timeZone, baseCurrency). Allowed only when `registrationMode = OPEN` (admin setting; `DISABLED` by default after bootstrap; see §7). It creates the user and sends a verification email. |
| Email verification | A random 32-byte token (base64url) stored **hashed** (SHA-256), 24 h validity, single use. Unverified users can log in **[Proposed]** but see a banner. Password reset requires a verified email. |
| Login | `POST /auth/login` (email, password). Constant-time behaviour: hash a dummy when the user doesn't exist. Generic error `INVALID_CREDENTIALS`. Deactivated → `ACCOUNT_DEACTIVATED` (only after a correct password, to avoid account enumeration). |
| Password reset | `POST /auth/password-reset/request` (always 202) → emailed token (1 h, single use) → `POST /auth/password-reset/confirm` → sets the password, **revokes all sessions**, and sends no further email. |
| Password change | Requires the current password (or a recent login within 10 min for OIDC-only users setting a first password). It revokes all other sessions. |
| Email change | `POST /me/email-change` → token to the **new** address → confirm → email updated, `emailVerifiedAt` set. Requires the current password or recent re-authentication. |
| Brute force | Rate limits (see [security.md](security.md#rate-limiting)), plus progressive delay per account after 5 failures within 15 min (lockout up to 15 min, never permanent). |
| Without SMTP | If SMTP is not configured: verification is skipped (emails are treated as unverified-but-allowed), and password reset works only via an **admin-generated reset link** (`/admin/users/:id/password-reset-link`, 1 h, shown once to the admin, no access to data). See [OQ-03](../planning/open-questions.md#oq-03-smtp-for-authentication-emails). |

## 3. OIDC

| Aspect | Rule |
|---|---|
| Library | **openid-client** (certified RP). No hand-rolled token validation. |
| Flow | Authorization Code + **PKCE** (S256) + `state` + `nonce`, `response_type=code`. Scopes `openid email profile`. |
| Discovery | From `issuer` via `.well-known/openid-configuration`. The JWKS is cached by the library. |
| Client auth | `client_secret_basic` (default) or `client_secret_post`, or a public client with PKCE only. |
| Validation | The library validates the ID token signature, `iss`, `aud`, `exp`, `iat`, and `nonce`. We additionally require `sub`. |
| Endpoints | `GET /api/v1/auth/oidc/start?mode=login|link&returnTo=` → redirect. `GET /api/v1/auth/oidc/callback` → session. `returnTo` is validated against same-origin relative paths only. |
| Transient state | `state`, `nonce`, and `code_verifier` are stored in a short-lived (10 min), signed, HttpOnly cookie `monevo_oidc` (encrypted with the app key). |
| Configuration | Admin panel **or** environment. Fields: display name, issuer URL, client ID, client secret, scopes, `allowAutoProvision` (create a user on first OIDC login, default off), `allowEmailLinking` (default off). The secret is encrypted at rest (AES-256-GCM via Node `crypto` with `APP_ENCRYPTION_KEY`). If `OIDC_*` env vars are set, they take precedence and the UI is read-only. |
| Logout | Local session logout. RP-initiated logout (`end_session_endpoint`) is offered if the provider supports it **[Proposed]**. |

### Account resolution on OIDC callback
1. Find `UserIdentity(issuer, sub)` → user found → if ACTIVE, create a session.
2. Not found and `mode = link` (a user is already logged in and started linking) → create the identity for the current user. Reject if this `(issuer, sub)` is linked elsewhere.
3. Not found, `mode = login`:
   - `allowEmailLinking` on, the ID token has `email_verified = true`, and a local user with that email exists → link and log in. *(Off by default, because trusting IdP email verification is an account-takeover risk if the IdP is misconfigured.)*
   - Else, `allowAutoProvision` on and registration permitted → create a user (no password, email from the token, `emailVerifiedAt` set if `email_verified`), then run onboarding.
   - Else → error page "No account linked to this identity. Log in with your password and link it in settings."
4. Unlinking: allowed only if the user still has a password (so they cannot lock themselves out).

### Changing the provider
Identities are keyed by `issuer`. After the admin switches to a provider with a different issuer, old identities simply no longer match (they are kept for audit and can be cleaned up from the admin panel). Users re-link by logging in with their password, or via verified-email linking if the admin enables it. OIDC-only users without a password need the admin reset link (or email reset) to set one first. The admin UI warns about this before saving a new issuer, showing how many users are OIDC-only.

## 4. Sessions

**Opaque, server-side sessions** (not JWT): instant revocation, a simple device list, and no token-validation primitives to get wrong.

```
Session: id (UUID), userId, tokenHash (SHA-256 of the 32-byte random token, unique),
         clientType (WEB|NATIVE), authMethod (PASSWORD|OIDC),
         createdAt, lastSeenAt, idleExpiresAt, absoluteExpiresAt,
         userAgent, deviceLabel (parsed "Firefox 140 on Linux" or user-renamed), ipLast (see privacy),
         csrfSecret (WEB only), revokedAt?, revokedReason?
```

| Parameter | Default | Env |
|---|---|---|
| Idle timeout | 30 days | `SESSION_IDLE_DAYS` |
| Absolute lifetime | 90 days | `SESSION_ABSOLUTE_DAYS` |
| `lastSeenAt` write throttle | 5 min | n/a |
| Admin re-auth window (sensitive admin actions) | 15 min | n/a |
| Max sessions per user | 50 (oldest idle evicted) | n/a |

**Renewal (sliding):** each authenticated request extends `idleExpiresAt = now + idle` (throttled with `lastSeenAt`), never past `absoluteExpiresAt`. There is no separate refresh token for the web: the cookie is the session. At absolute expiry the user logs in again (OIDC users are usually re-authenticated silently by the IdP).

**Token transport:**
- Web: cookie `monevo_session` with `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<absolute>`. `__Host-` prefix when served over HTTPS at the root (default). `Secure` can only be disabled by an explicit `INSECURE_COOKIES=true` for local HTTP testing.
- Native (future Android) / scripts: `POST /auth/login` with `clientType: "NATIVE"` returns `{ token }` once, sent as `Authorization: Bearer <token>`. Same session table, same revocation, same listing. Integrations use personal API tokens instead (`Authorization: Bearer mnv_pat_…`, scoped permissions, no session; see [api-tokens.md](api-tokens.md)).

**Rotation:** a new session token is issued on login, and the session is recreated after a password change and after OIDC linking. Session fixation is impossible because tokens are only ever created server-side after authentication.

**Revocation:** `DELETE /me/sessions/:id` (any of the user's own sessions), `POST /me/sessions/revoke-others`, `POST /auth/logout` (current). Deactivation by admin revokes all sessions (and all personal API tokens). A revoked session's sockets are disconnected (`session:revoked`). Revocation takes effect on the very next request because every request looks up the session (an indexed lookup by `tokenHash`, which is cheap at this scale).

**Device info shown:** device label, client type, auth method, created, last active, approximate location: **none** (no GeoIP, to avoid an external dependency and for privacy). The IP address is shown (last seen) and can be hidden by an instance setting. Sessions are purged 30 days after expiry or revocation.

## 5. CSRF

- Cookie-authenticated **state-changing** requests (`POST/PUT/PATCH/DELETE`) must send the header `X-CSRF-Token` equal to the session's CSRF token, which is obtained from `GET /api/v1/auth/session` (synchronizer token pattern). `SameSite=Lax` is a second layer.
- Bearer-authenticated requests are exempt (not ambient credentials).
- Login, registration, and password-reset endpoints (no session yet) rely on SameSite + `Origin` header verification against `APP_URL`.
- Socket.IO handshake: the `Origin` is checked against `APP_URL`.

## 6. Request authentication pipeline

```
request → parse cookie/bearer
  → bearer starts with "mnv_pat_" → personal API token path ([api-tokens.md](api-tokens.md#3-authentication))
  → otherwise: hash token → SELECT session JOIN user WHERE tokenHash = $1
  → reject if revoked / expired / user DEACTIVATED → touch (throttled)
  → req.auth = { userId, role, credential: { type: SESSION, sessionId, clientType } }
  → CSRF check (cookie + unsafe method) → route
```
`req.auth.userId` is the **only** source of the acting user, whichever credential authenticated the request (see [authorization-and-data-isolation.md](authorization-and-data-isolation.md)).

## 7. Admin bootstrap

- On first start with no users, registration is open **for the first user only**, who becomes ADMIN. Alternatively the operator runs `docker compose exec app node dist/cli.js create-admin --email …` (recommended for public instances; `BOOTSTRAP_ADMIN_EMAIL` limits first-user registration to that email).
- After bootstrap, `registrationMode` defaults to `DISABLED`. The admin can switch to `OPEN`. Invite links are **[Deferred]**.
- An admin cannot deactivate or demote themselves if they are the last active admin.

## 8. API surface (summary)

`/api/v1/auth/*`: `register`, `login`, `logout`, `session` (GET current + CSRF token), `password-reset/request|confirm`, `email/verify`, `oidc/start`, `oidc/callback`, `config` (public: registration mode, OIDC button label, instance branding).
`/api/v1/me/*`: profile, `email-change`, `password`, `sessions`, `identities` (list, unlink), `oidc/link` (starts the link flow), `api-tokens` ([api-tokens.md](api-tokens.md#5-token-management)).
