# ADR-0020: OIDC-only authentication with Account Center

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

[ADR-0005](ADR-0005-authentication-and-sessions.md) planned local email/password accounts (argon2id, registration, password reset, email verification, optional SMTP, admin reset links) in Stage 2 and one optional OIDC provider in Stage 14. The operator already runs Account Center (AC), an OpenID Provider that owns the users, groups, passwords, MFA and account recovery for their self-hosted applications. Keeping a second credential store in Monevo duplicates that work, adds attack surface (password storage, reset flows, email delivery) and needs SMTP. On 2026-11-19 the user decided to switch to OIDC-only authentication.

Account Center (reviewed at v0.13.0) offers: discovery and JWKS, Authorization Code with PKCE S256 only, `state` required, `nonce`, `prompt=login`, RS256 ID tokens with `kid` rotation, a stable `sub`, the `groups` claim (only for exposed groups), rotating refresh tokens with reuse detection, RP-Initiated Logout 1.0, and per-application access by group. It has no back-channel or front-channel logout and no revocation or introspection endpoint, the `email` claim is not verified, and clients are registered manually.

## Decision

- **OIDC is the only interactive authentication.** Monevo has no local passwords, registration, password reset, email verification, admin reset links or SMTP. Exactly one identity provider is configured through environment variables (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_SCOPES`, `OIDC_ADMIN_GROUP`, `OIDC_DISPLAY_NAME`); there is no admin form for it. Account Center is the supported provider; any standards-compliant OP with the same features works.
- **Library:** `openid-client` v6 (certified Relying Party): discovery, Authorization Code + PKCE S256 + `state` + `nonce`, ID-token signature verification against the JWKS, refresh token grant, end-session URL. No hand-rolled protocol or token validation.
- **Identity:** a user is keyed by `(issuer, sub)` in `user_identities`. The first successful login provisions the user automatically. Users are **never** identified or linked by email; the email claim is stored as informational, nullable and not unique. No account linking, one identity per user.
- **Roles:** with `OIDC_ADMIN_GROUP` set, the role follows membership of that group in the `groups` claim at each login and revalidation, and roles cannot be changed in Monevo. Without it, the first provisioned user becomes ADMIN and roles are managed in the admin UI or CLI. Access to Monevo as a whole is restricted in the IdP (AC allowed groups).
- **Monevo keeps its own sessions** (restated from ADR-0005, unchanged): opaque server-side sessions with a random 256-bit token, only the SHA-256 hash stored; cookie `__Host-monevo_session` (HttpOnly, Secure, SameSite=Lax); CSRF synchronizer token in `X-CSRF-Token`; idle 30 days, absolute 90 days, sliding renewal; instant revocation; a device list with per-session revocation; in-memory `express-rate-limit`. Bearer authentication is used only for personal API tokens ([ADR-0017](ADR-0017-personal-api-tokens.md)); native-client sessions are deferred with the Android client.
- **IdP revalidation:** the session stores the IdP refresh token (encrypted with `APP_ENCRYPTION_KEY`) and the last ID token (as the logout hint). At most every 15 minutes a session-authenticated request runs a refresh grant, serialized per session. An OAuth error revokes the Monevo session; a network failure keeps it (fail-open, retried later). This is how a logout, disable or group change in the IdP reaches Monevo, because AC has no back-channel logout.
- **Recent authentication** for sensitive actions (API token creation, admin deactivation and role change) is a re-login at the IdP with `prompt=login`; the callback must return the same `iss` + `sub` and a fresh `auth_time`.
- **Logout** revokes the Monevo session and returns the IdP's `end_session_endpoint` URL (RP-Initiated Logout with `id_token_hint`), which the web app opens.
- **Supersedes [ADR-0005](ADR-0005-authentication-and-sessions.md)** and **amends [ADR-0017](ADR-0017-personal-api-tokens.md)**: the password-reset revocation of personal API tokens no longer applies (there are no passwords); revocation on deactivation and restore stays.
- OIDC moves into Stage 2; Stage 14 is removed.

Details: [authentication.md](../architecture/authentication.md). [OQ-06](../planning/open-questions.md#oq-06-authentication-implementation) and [OQ-03](../planning/open-questions.md#oq-03-smtp-for-authentication-emails) are closed by this decision.

## Alternatives considered

- **Keep local accounts plus optional OIDC (ADR-0005):** two credential systems to secure and test, SMTP for resets, and duplicated user management with AC.
- **Use the ID token or AC access token as the Monevo session (no own sessions):** the browser would hold IdP tokens, revocation and the device list would depend on the IdP, and CSRF and cookie hardening would still be needed.
- **Trust the email claim to link existing users:** AC does not verify email and lets users edit it, so this is an account-takeover risk.
- **Back-channel logout:** not offered by AC; periodic refresh-based revalidation is the available substitute.
- **better-auth / Passport.js:** see ADR-0005; they still need our own session handling and add schema constraints.

## Consequences

- Monevo cannot be used without a reachable, correctly configured IdP; a fresh login needs it, while existing sessions keep working during an IdP outage (fail-open revalidation).
- The operator registers Monevo in AC manually (redirect and post-logout URIs, optional exposed admin group) ([deployment.md](../infrastructure/deployment.md)).
- An IdP logout or account disable reaches Monevo with a delay of up to the revalidation interval (15 minutes), or later while the IdP is unreachable.
- Tests need a mock OpenID Provider (`tools/mock-idp`) for integration and E2E tests.
- No email code, no password storage, and fewer auth endpoints to secure.

## Status

Accepted (user decision "switch to oidc only", 2026-11-19).
