# ADR-001 — Modular monolith

- **Status**: Accepted
- **Date**: 2026-11-08
- **Source**: spec section 4
- **Related**: C2, C7, NFR-03

## Context

A one-person project that needs simple run/deploy, while still wanting clear module boundaries so it can be split
later. Microservices add operations, tracing and deployment cost, and are unnecessary at 3–20 sales per org.

## Decision

Build a single NestJS app, split into modules by bounded context: auth, users, contacts, pipeline, deals,
activities, notifications, imports, webhooks, reports, audit, ai. Each module has its own controller/service/
repository; modules communicate through public services or an internal domain event bus. BullMQ workers run in the
same process in the MVP and can be split into a separate process later without changing contracts.

## Consequences

**Positive**

- One repo, one CI pipeline, one Docker image; simple deployment.
- Cross-module transactions are easy (audit + business change).
- Debugging a single process; fits the portfolio scope and timeline.

**Negative / trade-offs**

- Poor per-part scaling; one failing module can affect the whole app.
- Module boundaries are easy to break through cross-module repository imports.
- Heavy workers can compete for CPU with the API when they share the process.

## Mitigations

- Cross-module repository imports are forbidden; use services/events only.
- Split workers into a separate process as load grows (same codebase, different entrypoint).
- Keep modules free of dependency cycles; review the dependency graph at M4.

## Rejected alternatives

- **Microservices**: far too much infrastructure for one person, with no need for independent scaling.
- **Plain Express**: you would rebuild DI, guards, validation and modules yourself; Nest already provides them.
