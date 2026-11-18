# ADR-0005: Authentication and sessions

- **Status:** Proposed (extended by [ADR-0017](ADR-0017-personal-api-tokens.md))
- **Date:** 2026-11-18

## Context

Requirements: local email/password accounts, one configurable OIDC provider, account linking, session list and revocation, secure expiry and renewal, no custom crypto or auth primitives (R-AUTH-*, R-SEC-03). Native clients will need non-cookie auth later.

## Decision

- **Opaque server-side sessions**: random 256-bit tokens, only the SHA-256 hash stored. Web: cookie `__Host-monevo_session` (HttpOnly, Secure, SameSite=Lax) with a CSRF synchronizer token header `X-CSRF-Token`. Native: the same token as `Authorization: Bearer`.
- Idle timeout 30 days, absolute 90 days, sliding renewal; instant revocation.
- Passwords with argon2id (`argon2`); OIDC with `openid-client` (Authorization Code + PKCE, state, nonce); OIDC client secret encrypted with `APP_ENCRYPTION_KEY`.
- An **own thin layer** over these vetted primitives (no custom crypto or protocol code).

Details: [authentication.md](../architecture/authentication.md). The implementation approach is [OQ-06](../planning/open-questions.md#oq-06-authentication-implementation).

## Alternatives considered

- **JWT access + refresh tokens:** revocation is hard and token theft lasts until expiry.
- **better-auth:** feature-rich, but its schema and session model must fit Prisma, composite-key isolation, and Bearer tokens; kept as the main alternative until OQ-06 is decided.
- **Lucia:** deprecated.
- **Passport.js:** dated strategy model; still needs session handling.

## Consequences

- Every authenticated request reads the session table (cheap at this scale; an in-memory LRU can cache).
- The team owns the session code and must test it thoroughly (expiry, rotation, CSRF, revocation).

## Status

Proposed. Confirm before the stage that first depends on it (see [open-questions.md](../planning/open-questions.md)); until then it is the default.
