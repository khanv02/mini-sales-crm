# ADR-014 — Fractional indexing for position

- **Status**: Accepted
- **Date**: 2026-11-08
- **Source**: FR-05
- **Related**: ADR-005

## Context

The kanban must insert a card between two others. With integer `position` and a full-stage reindex on every drag we
would update many rows inside a transaction, adding locks and conflicts. The spec only says `position`, not its
type.

## Decision

Use `position numeric(20,10)`:

- The client sends `position` as the target index (0-based) inside the stage.
- The server reads the previous/next neighbour and computes the midpoint `(prev + next) / 2`; at the head/tail it
  uses `prev - 1` / `next + 1`.
- If the gap becomes too small (< 1e-9) → rebalance the whole stage inside the transaction (rare), preserving order.
- Sort by `(position asc, id asc)` for stability on ties.
- The deal `version` protects same-deal conflicts; two different deals may share a position and tie-break on id.

## Consequences

**Positive**

- A move updates one row (except for the rare rebalance).
- No stage-wide lock; a good fit for drag-and-drop.
- Easy middle insertion without integer gaps.

**Negative / trade-offs**

- `numeric` is a bit slower than integer; the index is larger.
- Rebalancing and precision must be tested.
- The client must understand that position is a target index while the server returns the real position.

## Rules

- No unique `(stage_id, position)` because races can create ties; sort with a tie-break instead.
- Moving to a new stage computes the position inside the target stage.
- Rebalance inside the transaction and audit a single move (never per row).
- Tests: insert at head/middle/tail; 100 consecutive inserts keep the order; rebalance when precision runs out.

## Rejected alternatives

- **Integer + reindex**: many writes, locks, slow.
- **LexoRank strings**: good but more complex and harder to debug; unnecessary.
- **Float**: poor precision, prone to ties.
