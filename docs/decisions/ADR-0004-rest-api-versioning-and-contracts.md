# ADR-0004: REST API, versioning and contracts

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

The API must serve the web app now and a native Android client and integrations later (R-GEN-03), be documented with OpenAPI and Swagger UI (R-API-01), and keep DTOs separate from Prisma models (R-API-03).

## Decision

- REST under `/api/v1`, JSON with camelCase fields, decimal strings for money, RFC 9457 problem+json errors with a stable `code`, cursor pagination, `If-Match` optimistic concurrency, `Idempotency-Key` on creates.
- **Zod 4 schemas in `@monevo/contracts`** are the single source for validation, TypeScript types, and the OpenAPI 3.1 document (`@asteasolutions/zod-to-openapi`).
- Breaking changes go to `/api/v2`; `v1` stays for at least 6 months after `v2` ships. A CI snapshot diff of the OpenAPI document detects breaking changes.

Details: [api-design.md](../architecture/api-design.md).

## Alternatives considered

- **GraphQL or tRPC:** less suitable for native clients and integrations; tRPC ties clients to TypeScript.
- **Hand-written OpenAPI:** drifts from the implementation.
- **Header-based versioning:** less visible and harder to route.

## Consequences

- Every route needs a Zod schema and an OpenAPI registration (enforced by tests).
- Sync endpoints are part of the same contract and versioning.

## Status

Accepted.
