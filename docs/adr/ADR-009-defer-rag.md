# ADR-009 — Defer FR-20 (RAG) beyond M3

- **Status**: Accepted
- **Date**: 2026-11-08
- **Source**: spec Q4, FR-20
- **Related**: FR-16–FR-19

## Context

FR-20 (question answering over notes with RAG, pgvector and source citations) is optional. M3 already carries four
AI features (summary, email draft, lead scoring, cost control) and takes two weeks. RAG adds an embedding
pipeline, chunking, retrieval, citation and evaluation — beyond the available time, and it dilutes the portfolio
goal.

## Decision

**Do not build FR-20 in M3.** Keep the schema/architecture ready (PostgreSQL + pgvector can be enabled) without
adding endpoints/UI/embeddings. Building it later needs a new ADR + a new spec.

## Consequences

**Positive**

- M3 focuses on streaming, quota, cost and evaluation — things that can be measured.
- Lower LLM cost and scope risk.
- It can still be added later on top of the data we already store.

**Negative / trade-offs**

- The portfolio lacks an "advanced AI" feature.
- If users expect RAG, that has to be communicated clearly.

## Conditions for revisiting

- M3 is finished and stable.
- A large, clean notes dataset exists.
- There is budget for embeddings + vector storage.
- There is a clear retrieval/citation evaluation.
- A new ADR is approved.

## Rejected alternatives

- **Build RAG in M3**: scope creep that lowers the quality of the mandatory FRs.
- **Drop it entirely**: keep it optional for the future.
