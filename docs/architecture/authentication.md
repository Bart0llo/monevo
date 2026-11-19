# Authentication and Sessions

**[Accepted]**, see [ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md) (supersedes [ADR-0005](../decisions/ADR-0005-authentication-and-sessions.md)): **OIDC-only** authentication with the operator's Account Center (AC) as the single identity provider (IdP), on top of Monevo's own server-side sessions. Built in Stage 2. Monevo has no local passwords, registration, password reset, email verification or SMTP. This is the canonical document for the login flow and the session parameters. Covers R-AUTH-01..09. Personal API tokens for integrations are a separate credential type, canonical in [api-tokens.md](api-tokens.md) ([ADR-0017](../decisions/ADR-0017-personal-api-tokens.md)).

## 1. Account model

```
User:          id, displayName, email? (informational copy of the IdP claim, not unique, never used
               for identity), role (USER|ADMIN), status (ACTIVE|DEACTIVATED),
               storageQuotaBytes? (null = instance default), storageUsedBytes, lastLoginAt?, createdAt
UserIdentity:  id, userId, issuer, subject, createdAt, lastLoginAt?
               UNIQUE(issuer, subject); UNIQUE(userId, issuer)   -- one identity per user and issuer
Session:       see §4
```

A user is identified **only** by `(issuer, sub)` from a validated ID token. Monevo never looks users up, links them, or merges them by email address: AC lets users edit their email and does not verify it. There is no account linking and no local credential.

## 2. OIDC login

| Aspect | Rule |
|---|---|
| Provider | Exactly one OpenID Provider, configured by environment variables ([configuration.md](../infrastructure/configuration.md#oidc)): `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (empty = public client, PKCE only), `OIDC_SCOPES` (default `openid profile email groups`), `OIDC_ADMIN_GROUP`, `OIDC_DISPLAY_NAME` (login button label). There is no admin form. The operator registers Monevo in AC ([deployment.md](../infrastructure/deployment.md#registering-monevo-in-account-center)). |
| Library | **openid-client** v6 (certified Relying Party). No hand-rolled protocol or token validation. |
| Discovery | `discovery()` from `OIDC_ISSUER` (`/.well-known/openid-configuration`), cached in-process after the first success. A failed discovery is not cached; the next login retries. HTTP requests to the IdP time out after about 5 s. Plain `http` issuers are allowed only together with `INSECURE_COOKIES=true` (development and E2E). |
| Flow | Authorization Code + **PKCE S256** + `state` + `nonce`, `response_type=code`. The authorization response `iss` parameter (RFC 9207) is checked when the IdP sends it. |
| Client auth | `client_secret_basic` with `OIDC_CLIENT_SECRET` (confidential client, recommended), or none (public client) when the secret is empty. |
| Validation | The library validates the ID token signature against the JWKS (non-repudiation checks enabled; an unknown `kid` refetches the JWKS, so IdP key rotation works), `iss`, `aud`, `exp`, `iat`, `nonce`, and `state`. We additionally require `sub` and `auth_time`. |
| Redirect URIs | Callback `<APP_URL>/api/v1/auth/oidc/callback`; post-logout `<APP_URL>/login`. Both must be registered in AC byte for byte. |
| Transient state | `state`, `nonce`, `code_verifier`, `returnTo`, `intent`, the locale and time zone hints, and `startedAt` are kept in a short-lived (10 min) cookie `monevo_oidc` (`__Host-` prefix unless `INSECURE_COOKIES=true`; HttpOnly, SameSite=Lax, Path=/), encrypted with AES-256-GCM under a key derived from `APP_ENCRYPTION_KEY` with HKDF. The callback always clears it. |

### Endpoints

- `GET /api/v1/auth/config` (public) → `{ providerName }` for the login button.
- `GET /api/v1/auth/oidc/start?intent=login|reauth&returnTo=&locale=&timeZone=` → `302` to the IdP's authorization endpoint. `returnTo` must be a same-origin relative path (otherwise `/`). `locale` and `timeZone` are the browser's hints for provisioning. `intent=reauth` requires a session and adds `prompt=login`.
- `GET /api/v1/auth/oidc/callback` → `302` to `returnTo`, or to `/login?error=<code>` with one of `idp_unavailable` (discovery, network or token endpoint failure), `login_failed` (state, nonce, PKCE, signature or claim validation failed, or a missing/expired state cookie), `access_denied` (the IdP returned an error, e.g. the user is not in an allowed group or cancelled), `account_deactivated`, `reauth_mismatch`.

### Account resolution on callback

1. Find `UserIdentity(issuer, sub)`.
2. **Not found → provision** in one transaction (serialized with a PostgreSQL advisory lock): create the user (`displayName` from `name`, else `preferred_username`, else "User", trimmed to 100 characters; `email` from the claim or null), the identity row, and `user_settings` (locale and time zone from the start hints if valid, else `en` and `UTC`; base currency `EUR`; week start `MONDAY`; onboarding not completed, so the web app runs onboarding next). The role follows §7.
3. User `DEACTIVATED` → no session, `account_deactivated`.
4. Every login updates `email` from the claim, `users.lastLoginAt`, `user_identities.lastLoginAt`, and the role when `OIDC_ADMIN_GROUP` is set (§7).
5. A valid Monevo session cookie sent with the callback is revoked (`REPLACED`) and a new session is created (rotation). The session stores the raw ID token as the logout hint (`idTokenHint`), the IdP refresh token encrypted with `APP_ENCRYPTION_KEY` (`idpRefreshToken`), `idpCheckedAt = now`, and `reauthenticatedAt = auth_time`.

### Logout

`POST /api/v1/auth/logout` (CSRF) revokes the current session (`LOGOUT`), clears the cookie, and returns `200 { endSessionUrl }`: the IdP's `end_session_endpoint` with `id_token_hint`, `client_id` and `post_logout_redirect_uri=<APP_URL>/login` (RP-Initiated Logout 1.0), or `null` when the IdP has none. The web app navigates there, which also ends the AC session; AC logs out without a confirmation page when the hint is valid.

### Account Center specifics

- `sub` is AC's stable user ID. The `groups` claim lists group names and is sent only when the AC application has **exposed groups** configured; otherwise AC silently drops the `groups` scope.
- Refresh tokens are opaque, sliding 30 days, **rotated on every use**; reusing an old one revokes the whole token family, so Monevo never refreshes one session concurrently.
- AC grants are bound to the AC browser session: an AC logout, session revocation, password change, disable, or a new sign-in over an existing AC cookie (`prompt=login`) revokes the old grants, after which a refresh fails with `invalid_grant`.
- AC has no back-channel or front-channel logout and no revocation or introspection endpoint; Monevo learns about IdP-side changes through revalidation (§3). AC restricts access per application with allowed groups, so Monevo has no allowed-group setting of its own.
- The discovery document answers `503` until an AC admin generates a signing key; Monevo then reports `idp_unavailable`.
- After an AC signing-key rotation, the OIDC client refetches the JWKS for an unknown `kid` only when its cached copy is at least 60 seconds old, so a sign-in within that minute can fail with `login_failed` and succeeds on retry.

## 3. IdP revalidation

On a session-authenticated request, if the session has an `idpRefreshToken` and `idpCheckedAt` is older than **15 minutes**, the server runs a refresh token grant before handling the request. Refreshes are serialized per session with an in-process mutex (one container), because AC revokes the token family on reuse.

| Result | Effect |
|---|---|
| Success | Store the rotated refresh token and the new ID token hint, update the role when `OIDC_ADMIN_GROUP` is set, set `idpCheckedAt = now`. |
| OAuth error (`invalid_grant` and similar) | Revoke the session (`IDP_REVOKED`) → `401 UNAUTHENTICATED`. |
| Network error, timeout, or 5xx | Keep the session (fail-open), log a warning, retry this session after 1 minute (in-memory backoff). |
| No refresh token was issued | No revalidation; the session lives until its own expiry. |

An IdP-side logout, disable or group change therefore reaches Monevo within about 15 minutes of the next request, or later while the IdP is unreachable ([security.md](security.md#threat-model)).

## 4. Sessions

**Opaque, server-side sessions** (not JWT, and not the IdP's tokens): instant revocation, a simple device list, and no token-validation primitives to get wrong. The browser never receives IdP tokens.

```
Session: id (UUID), userId, tokenHash (SHA-256 of the 32-byte random token, unique),
         createdAt, lastSeenAt, idleExpiresAt, absoluteExpiresAt,
         userAgent, deviceLabel (parsed "Firefox 140 on Linux"), ipLast (see privacy),
         csrfSecret, reauthenticatedAt?, idTokenHint?, idpRefreshToken? (encrypted), idpCheckedAt?,
         revokedAt?, revokedReason?
```

| Parameter | Default | Env |
|---|---|---|
| Idle timeout | 30 days | `SESSION_IDLE_DAYS` |
| Absolute lifetime | 90 days | `SESSION_ABSOLUTE_DAYS` (≥ idle) |
| `lastSeenAt` write throttle | 5 min | n/a |
| IdP revalidation interval | 15 min (1 min retry after a network failure) | n/a |
| Recent-authentication window (sensitive actions) | 15 min | n/a |
| Max sessions per user | 50 (oldest evicted, `EVICTED`) | n/a |

**Renewal (sliding):** each authenticated request extends `idleExpiresAt = now + idle` (throttled with `lastSeenAt`), never past `absoluteExpiresAt`. At absolute expiry the user signs in again; the IdP usually re-authenticates them silently while its own session is alive.

**Token transport:** cookie `__Host-monevo_session` with `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<absolute>`. With `INSECURE_COOKIES=true` (local HTTP testing only) the cookie is `monevo_session` without `Secure` and without the prefix. Bearer authentication is used only for personal API tokens (`Authorization: Bearer mnv_pat_…`, [api-tokens.md](api-tokens.md)); native-client sessions are deferred with the Android client.

**Rotation:** a new session token is issued on every login, and a session cookie present at login is revoked (`REPLACED`). Session fixation is impossible because tokens are only ever created server-side after authentication.

**Revocation reasons:** `LOGOUT` (`POST /auth/logout`), `USER_REVOKED` (`DELETE /me/sessions/:id`, `POST /me/sessions/revoke-others`), `DEACTIVATED` (admin deactivation revokes all sessions and all personal API tokens), `RESTORE` (backup restore), `EVICTED` (session limit), `IDP_REVOKED` (revalidation failed), `REPLACED` (rotation at login). A revoked session's sockets are disconnected (`session:revoked`). Revocation takes effect on the very next request because every request looks up the session (an indexed lookup by `tokenHash`, which is cheap at this scale).

**Device info shown:** device label, created, last active, approximate location: **none** (no GeoIP, to avoid an external dependency and for privacy). The IP address is shown (last seen) and can be hidden by an instance setting. The `sessions.purge` job deletes sessions 30 days after expiry or revocation.

### Recent authentication

Sensitive actions require that the current session re-authenticated within the last **15 minutes**: creating a personal API token, and deactivating a user or changing a role in the admin panel ([administration.md](administration.md#2-access-control)). Otherwise the API answers `403 REAUTH_REQUIRED`.

Re-authentication is a fresh sign-in at the IdP: `GET /auth/oidc/start?intent=reauth&returnTo=…` sends `prompt=login`. The callback must return the same `iss` + `sub` as the current session (otherwise `reauth_mismatch`, and the session is unchanged), and `auth_time` must not be older than the start of the flow (5 s clock skew allowed). It then sets the current session's `reauthenticatedAt = now` and replaces its refresh token and ID token hint, because AC ends the old AC session's grants on `prompt=login`. `GET /auth/session` returns `recentAuthUntil`, so the web app offers "Confirm identity" before opening a dialog whose request would fail.

## 5. CSRF

- Cookie-authenticated **state-changing** requests (`POST/PUT/PATCH/DELETE`) must send the header `X-CSRF-Token` equal to the session's CSRF token, which is obtained from `GET /api/v1/auth/session` (synchronizer token pattern). `SameSite=Lax` is a second layer. A mismatch → `403 CSRF_INVALID`.
- Bearer-authenticated requests (personal API tokens) are exempt (not ambient credentials).
- The OIDC start and callback are top-level `GET` navigations protected by `state`, `nonce` and PKCE bound to the encrypted state cookie.
- Socket.IO handshake: the `Origin` is checked against `APP_URL`.

## 6. Request authentication pipeline

```
request → parse cookie/bearer
  → bearer starts with "mnv_pat_" → personal API token path ([api-tokens.md](api-tokens.md#3-authentication))
  → other bearer → 401 UNAUTHENTICATED
  → otherwise: hash cookie token → SELECT session JOIN user WHERE tokenHash = $1
  → reject if revoked / expired / user DEACTIVATED
  → IdP revalidation if due (§3) → touch (throttled)
  → req.auth = { userId, role, credential: { type: SESSION, sessionId } }
  → CSRF check (unsafe method) → route
```
`req.auth.userId` is the **only** source of the acting user, whichever credential authenticated the request (see [authorization-and-data-isolation.md](authorization-and-data-isolation.md)).

## 7. Admin bootstrap

- **`OIDC_ADMIN_GROUP` set:** the role is ADMIN exactly when the `groups` claim contains that group name, synced at every login and revalidation. A missing `groups` claim means USER and logs a warning (the group is probably not exposed to the Monevo application in AC). Roles cannot be changed in Monevo (`409 ROLE_MANAGED_BY_IDP`, and the CLI refuses).
- **`OIDC_ADMIN_GROUP` unset:** the first provisioned user becomes ADMIN. Later roles change in the admin UI or with the CLI `set-role` ([administration.md](administration.md#users-r-adm-01-r-auth-04)).
- An admin cannot deactivate themselves, and the last active admin cannot be deactivated or demoted (`409 LAST_ADMIN`).
- Who may use Monevo at all is decided in the IdP (AC allowed groups for the application). Invite links are not needed.

## 8. API surface (summary)

`/api/v1/auth/*`: `config` (public: provider name), `oidc/start`, `oidc/callback`, `session` (GET current user, CSRF token, `recentAuthUntil`, `onboardingRequired`), `logout`.
`/api/v1/me/*`: profile (`GET/PATCH /me`, display name only; the email is read-only and managed in the IdP), `settings` (`GET/PATCH`), `sessions` (list, `DELETE /:id`, `revoke-others`), `api-tokens` ([api-tokens.md](api-tokens.md#5-token-management)).
