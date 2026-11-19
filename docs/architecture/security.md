# Security

A checklist-oriented summary of security controls. Details live in the linked documents. Covers R-SEC-01..03, the security parts of R-TOK-05..08, and parts of R-ATT-04.

## Threat model

| Asset | Threats considered | Primary controls |
|---|---|---|
| Users' financial data | Cross-user access (IDOR), XSS exfiltration, stolen session, SQL injection | Isolation layers, CSP, HttpOnly cookies, Prisma parameterization |
| Credentials | Brute force, credential stuffing, password database leak | No local credentials: passwords, MFA and recovery live in the identity provider ([ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md)) |
| Sign-in (OIDC) | Authorization code interception or injection, login CSRF, ID token forgery, mix-up, account takeover by email | PKCE S256, `state` and `nonce` in an encrypted short-lived cookie, ID token signature verified against the JWKS with `iss`/`aud`/`exp` checks, `iss` response parameter, users keyed by `iss` + `sub` and never by email, certified `openid-client` |
| IdP-side revocation | A user disabled or logged out in Account Center keeps using Monevo | Refresh-grant revalidation at most every 15 min revokes the session on `invalid_grant`. Gap: no back-channel logout, so revocation reaches Monevo with a delay of up to 15 min, and later while the IdP is unreachable (fail-open, so an IdP outage does not lock everyone out); admins can deactivate users in Monevo directly |
| Sessions | Theft, fixation, CSRF | Opaque hashed tokens, Secure/HttpOnly/SameSite, CSRF tokens, revocation |
| Personal API tokens | Leak from an integration, over-broad access, privilege escalation | Shown once, hash-only storage, per-resource permissions, no admin/auth/session access, optional expiry, instant revocation, last-used metadata, audit attribution |
| Attachments | Malicious uploads (stored XSS, polyglots), path traversal, quota abuse | Server-generated keys, sniffing, `Content-Disposition: attachment`, sandbox CSP, quotas |
| Instance | Exposed DB, leaked secrets, container escape | Database reachable only from the Monevo host and over TLS off-host ([postgresql.md](../infrastructure/postgresql.md)), secrets via env/files, non-root container |
| Backups | Leak of a full-data archive | Admin-only, optional encryption, storage outside the web root |

**Trust boundary:** the server operator (shell, Docker, DB access) is trusted. Application admins are trusted with operations, **not** with data, through the application. Protection against a malicious operator is out of scope (it would require end-to-end encryption, which is incompatible with server-side reports and forecasting). See [OQ-04](../planning/open-questions.md#oq-04-admin-backup-access-vs-financial-privacy).

## Controls

### Authentication and sessions
See [authentication.md](authentication.md): OIDC-only sign-in via openid-client (Authorization Code + PKCE S256, state, nonce, JWKS-verified ID tokens), opaque server-side sessions, sliding and absolute expiry, revocation, IdP revalidation, re-authentication with `prompt=login` for sensitive actions, CSRF synchronizer tokens, IdP refresh tokens encrypted at rest and never sent to the browser, no custom crypto or JWT handling.

### Personal API tokens
See [api-tokens.md](api-tokens.md): 256-bit CSPRNG tokens with a recognisable `mnv_pat_` prefix, shown once, stored as SHA-256 only and never returned; permissions per resource, checked on the backend before resource lookup; never valid for admin, auth, session, token-management, sync, or realtime endpoints; effective role always `USER`; revoked on user deactivation and backup restore; token-made changes attributed in transaction history.

### Authorization
See [authorization-and-data-isolation.md](authorization-and-data-isolation.md): session-derived `userId`, scoped repositories, composite FKs, 404 on foreign IDs, automated isolation suite, admin/data separation.

### Input validation
- All request bodies, params, and queries are validated with **Zod** schemas from `@monevo/contracts` (`.strict()` objects, bounded strings and arrays, decimal-string regex with range checks, enums, UUID formats, ISO dates).
- Body size limit: 1 MB JSON (sync push 5 MB). Uploads are handled separately by streaming limits.
- Server-side re-validation of everything, even when the client validated with the same schema.

### Output and XSS
- React escapes by default. `dangerouslySetInnerHTML` is forbidden (lint rule). User text (descriptions, category names) is rendered as text only. There is no Markdown rendering of user content in v1.
- **CSP** (helmet): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` (Mantine ships static CSS but sets inline `style` attributes and CSS variables, so `'unsafe-inline'` is allowed for styles only, never for scripts), `img-src 'self' data: blob:; connect-src 'self'` (+ `wss:` same origin), `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` (+ OIDC issuer for redirects as needed).
- Other headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Strict-Transport-Security` (when `APP_URL` is https), `Permissions-Policy` minimal, `Cross-Origin-Opener-Policy: same-origin`.

### CORS
Same-origin deployment, so CORS is **disabled** by default (no `Access-Control-Allow-Origin`). `CORS_ALLOWED_ORIGINS` exists for future external web clients. Native apps don't need CORS. Credentials are never allowed with wildcards.

### Rate limiting
`express-rate-limit`, keyed by IP (respecting `TRUST_PROXY`) and, after authentication, by user:

| Scope | Limit |
|---|---|
| OIDC start and callback (`/auth/oidc/*`) | 30/min per IP |
| Authenticated API (sessions and API tokens together) | 600/min per user |
| Invalid API token attempts | 30/min per IP |
| Sync push | 60/min per user |
| Uploads | 30/min per user |
| Rate provider fetches triggered by a user | 60/hour per user (shared cache prevents repeats) |

Responses use `429` with a `RATE_LIMITED` problem body and a `Retry-After` header.

The counters use the **in-memory store** of `express-rate-limit` ([OQ-06](../planning/open-questions.md#oq-06-authentication-implementation)): Monevo runs as one container, so no shared store is needed. Counters reset when the container restarts, which is acceptable because the limits slow abuse down rather than enforce quotas, and passwords are never guessed against Monevo (they live in the IdP). A multi-instance deployment would need a shared store.

### Uploads and downloads
See [file-storage.md](file-storage.md#security): streaming size limits, quota reservation, magic-byte detection, server-generated storage keys (no user path components), sanitized display filenames, authorized downloads, `Content-Disposition: attachment` except for an allowlist of previewable types served with `Content-Security-Policy: sandbox` and `nosniff`. SVG and HTML are never served inline.

### Database
- Prisma parameterized queries. Raw SQL only via tagged template `prisma.$queryRaw` (parameterized). `$queryRawUnsafe` is forbidden (lint).
- The application connects to the external PostgreSQL as a dedicated non-superuser role that owns the database (migrations run as the same role). The operator restricts database access to the Monevo host and uses TLS (`sslmode=verify-full`) when the connection leaves the host or a trusted private network ([postgresql.md](../infrastructure/postgresql.md#tls)).

### Secrets
- From the environment or `*_FILE` variants (Docker secrets) (see [configuration.md](../infrastructure/configuration.md)).
- `APP_ENCRYPTION_KEY` (32 bytes, base64) encrypts secrets stored in the database (IdP refresh tokens on sessions, auto-generated VAPID private key) and, through an HKDF-derived key, the OIDC state cookie with AES-256-GCM (Node `crypto`, random 96-bit IV, key version prefix to allow rotation).
- Secrets are never logged (pino redaction paths), never returned by APIs (write-only fields show "set" or "not set"), and never included in user exports.

### Logging hygiene
No request bodies for financial or auth endpoints, no tokens (session, API, ID or refresh tokens) or token hashes, no authorization codes, no cookies, no CSRF tokens, no client secrets. Financial amounts and descriptions are not logged. IDs and error codes are. See [monitoring-and-logging.md](../infrastructure/monitoring-and-logging.md).

### Docker
Non-root user (`node`, uid 1000), read-only root filesystem with writable `/data` volumes and `/tmp` tmpfs, `no-new-privileges`, all capabilities dropped (none needed), pinned base image digests updated deliberately, minimal runtime image (no build tools), a healthcheck. See [docker-compose.md](../infrastructure/docker-compose.md).

### Backups
Admin-only access with re-auth for download and restore, stored outside any static path, optional encryption at rest **[Proposed]** (see [backups-and-restoration.md](../infrastructure/backups-and-restoration.md#encryption)), and restores verified against manifest checksums.

### Dependencies
Lockfile committed. `pnpm audit --prod` before releases (non-blocking for low severity; [testing-strategy.md](../development/testing-strategy.md#5-local-validation)). Renovate or Dependabot **[Proposed]**. A minimal dependency policy (see [dependencies.md](../planning/dependencies.md)).

### Privacy
No telemetry and no third-party calls except the configured OIDC identity provider, rate provider, and push services (endpoint chosen by the browser). Monevo sends no email. No GeoIP. Push payloads contain minimal text (configurable to "generic text only", so amounts never transit push services).
