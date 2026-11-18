# ADR-0001: Express modular monolith

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

The brief fixes Node.js, TypeScript, and Express, and excludes NestJS. The expected load is a household or small group (≤ 10 users) on one VPS or homelab host. The app needs REST, Socket.IO, background jobs, and static hosting of the PWA.

## Decision

Build one Node.js process with **Express 5**, organized as a **modular monolith**: one folder per business module (routes, service, repository, mapper, sync adapter, OpenAPI registrations), communicating only through each module's exported service interface. The same process serves the static web app, the REST API, Socket.IO, and in-process pg-boss jobs. No cluster mode. Details: [backend-architecture.md](../architecture/backend-architecture.md).

## Alternatives considered

- **NestJS:** excluded by the brief.
- **Microservices:** operational overhead with no benefit at this scale.
- **Fastify or Hono:** good, but Express is required.
- **Separate worker process for jobs:** possible later (pg-boss supports it), not needed now.

## Consequences

- Simple deployment and debugging; one log stream.
- Module boundaries must be enforced by lint rules and review, since the framework does not enforce them.
- Horizontal scaling would require a Socket.IO adapter, a shared rate-limit store, and job coordination. This is accepted as unnecessary for the target scale.

## Status

Accepted.
