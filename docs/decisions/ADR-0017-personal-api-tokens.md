# ADR-0017: Personal API tokens

- **Status:** Proposed
- **Date:** 2026-11-18

## Context

The user moved personal API tokens from the deferred list into the initial scope (R-TOK-01..09). Users need to connect external integrations to their own data through the REST API with credentials that are scoped, revocable, optionally expiring, and separate from interactive sessions. [ADR-0005](ADR-0005-authentication-and-sessions.md) covers sessions only and marked API tokens as deferred. Constraints: no custom cryptography (R-SEC-03), strict per-user isolation ([ADR-0006](ADR-0006-user-data-isolation.md)), no admin access via the API for tokens, and no last-write-wins on financial fields (R-OFF-06).

## Decision

- **Opaque random tokens**, not JWTs: `mnv_pat_` + 32 bytes from `crypto.randomBytes` as base64url. Only the SHA-256 hash is stored, the full token is shown once, and every request looks the token up, so revocation is immediate. This is the same vetted scheme as sessions.
- **Sent as `Authorization: Bearer`**, routed by the `mnv_pat_` prefix. Tokens are an additional authentication method for `/api/v1` and do not replace local login, OIDC, or sessions.
- **Fine-grained permissions** `<resource>:<operation>`, selected by the user from a predefined catalogue, defined per resource according to its real operations (`read`, `create`, `update`, `delete`), each granted independently, fixed at creation. Operations that write another resource type also require that resource's permission.
- **Hard exclusions:** tokens never reach admin, auth, session, password, identity, token-management, sync, or realtime endpoints, and always act with the effective role `USER`.
- **Amends [ADR-0006](ADR-0006-user-data-isolation.md):** the acting user ID comes only from the authenticated credential, a session or a personal API token (previously "only from the session"). Everything else in ADR-0006 applies unchanged to token-authenticated requests.
- **Owner-bounded:** a token acts as exactly one user; all ownership checks, invariants, quotas, and rate limits apply; deactivation and backup restore revoke all tokens.
- **Audit:** token-made transaction changes record `credentialType = API_TOKEN`, the token ID, and a copy of its name.
- Token `PATCH`/`DELETE` on versioned resources require `If-Match`.

Details: [api-tokens.md](../architecture/api-tokens.md). The permission catalogue and lifecycle defaults are [OQ-22](../planning/open-questions.md#oq-22-api-token-permission-catalogue-and-lifecycle).

## Alternatives considered

- **Reuse native sessions** (`clientType: NATIVE` login) for integrations: no per-integration permissions, tied to the password and session lifetimes, and it gives full account access including session management.
- **JWT access tokens:** revocation needs a denylist anyway, and a stateless token cannot reflect revocation or deactivation instantly.
- **OAuth 2.0 authorization server** (client registration, consent, refresh tokens): far more surface than personal self-hosted integrations need. It stays possible later for third-party apps.
- **argon2 for token hashes:** unnecessary for 256-bit random secrets and would add hundreds of milliseconds to every API request.
- **Coarse read/write scopes for the whole account:** too broad for a finance app; a reporting script should not be able to delete transactions.

## Consequences

- The auth pipeline has two credential types; `RequestContext` carries the credential, and services see the same `userId` either way.
- Every new route must declare its token permissions or be listed as never available; the permission suite fails otherwise.
- Integrations must handle `If-Match` and poll instead of using realtime.
- A restore or deactivation breaks integrations until the user creates new tokens.

## Status

Proposed. Confirm before Stage 2 together with [OQ-22](../planning/open-questions.md#oq-22-api-token-permission-catalogue-and-lifecycle). The scope itself (R-TOK-01..09) is accepted.
