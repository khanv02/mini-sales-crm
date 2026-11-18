/**
 * Fractional kanban positions (ADR-014).
 *
 * The client sends the target index inside a stage; the server turns it into a
 * `numeric(20,10)` midpoint between the neighbours. When the gap between two
 * neighbours runs out the whole stage is rebalanced to consecutive integers in
 * the same transaction, preserving the order.
 */
export const MIN_POSITION_GAP = 1e-9;
const POSITION_PRECISION = 1e10;

export interface PositionedCard {
  id: string;
  position: number;
}

export interface PositionUpdate {
  id: string;
  position: number;
}

export interface PositionPlan {
  /** Real position assigned to the moved card. */
  position: number;
  /** Cards whose position must be rewritten (only on rebalance, empty otherwise). */
  rebalance: PositionUpdate[];
}

/** `numeric(20,10)` keeps ten decimals; rounding here keeps JavaScript and PostgreSQL in sync. */
export function roundPosition(value: number): number {
  return Math.round(value * POSITION_PRECISION) / POSITION_PRECISION;
}

/** Board order: `(position asc, id asc)`, the same tie-break the queries use. */
export function orderByPosition<T extends PositionedCard>(cards: readonly T[]): T[] {
  return [...cards].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

/**
 * Position for a card dropped at `index` (0-based) inside the target stage,
 * where `neighbors` are the cards already in that stage, excluding the moved one.
 * Out-of-range indexes are clamped to the head/tail (spec.md edge cases).
 */
export function computePosition(neighbors: readonly PositionedCard[], index: number): PositionPlan {
  const ordered = orderByPosition(neighbors);
  const target = Math.min(Math.max(Math.trunc(index), 0), ordered.length);

  if (ordered.length === 0) {
    return { position: 1, rebalance: [] };
  }

  if (target === 0) {
    const head = ordered[0]!;
    return { position: roundPosition(head.position - 1), rebalance: [] };
  }

  if (target === ordered.length) {
    const tail = ordered[ordered.length - 1]!;
    return { position: roundPosition(tail.position + 1), rebalance: [] };
  }

  const previous = ordered[target - 1]!;
  const next = ordered[target]!;
  if (next.position - previous.position < MIN_POSITION_GAP) {
    return rebalance(ordered, target);
  }

  return { position: roundPosition((previous.position + next.position) / 2), rebalance: [] };
}

/** Rewrites the stage to `1..n+1` with a slot for the moved card at `target`. */
function rebalance(ordered: readonly PositionedCard[], target: number): PositionPlan {
  const updates: PositionUpdate[] = ordered.map((card, index) => ({
    id: card.id,
    position: index < target ? index + 1 : index + 2,
  }));

  return { position: target + 1, rebalance: updates };
}
