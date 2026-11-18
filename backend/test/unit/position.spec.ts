import {
  MIN_POSITION_GAP,
  computePosition,
  orderByPosition,
  roundPosition,
  type PositionedCard,
} from '../../src/modules/deals/position.service';

function card(id: string, position: number): PositionedCard {
  return { id, position };
}

describe('fractional positions (ADR-014)', () => {
  it('places the first card at 1', () => {
    expect(computePosition([], 0)).toEqual({ position: 1, rebalance: [] });
  });

  it('inserts at the head, middle and tail', () => {
    const cards = [card('a', 1), card('b', 2), card('c', 3)];

    expect(computePosition(cards, 0).position).toBe(0);
    expect(computePosition(cards, 1).position).toBe(1.5);
    expect(computePosition(cards, 2).position).toBe(2.5);
    expect(computePosition(cards, 3).position).toBe(4);
  });

  it('clamps an out-of-range index to the head or tail', () => {
    const cards = [card('a', 1), card('b', 2)];

    expect(computePosition(cards, -5).position).toBe(0);
    expect(computePosition(cards, 99).position).toBe(3);
  });

  it('orders by position and uses the id as the tie-break', () => {
    const cards = [card('b', 1), card('a', 1), card('c', 0.5)];

    expect(orderByPosition(cards).map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
  });

  it('rounds to the numeric(20,10) scale', () => {
    expect(roundPosition(1.0 / 3)).toBe(0.3333333333);
  });

  it('keeps the order after 100 head inserts', () => {
    let cards: PositionedCard[] = [];
    for (let index = 0; index < 100; index += 1) {
      const plan = computePosition(cards, 0);
      expect(plan.rebalance).toEqual([]);
      cards = [...cards, card(`deal-${index}`, plan.position)];
    }

    const ordered = orderByPosition(cards);
    expect(ordered.map((entry) => entry.id)).toEqual(Array.from({ length: 100 }, (_, index) => `deal-${99 - index}`));
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index]!.position).toBeGreaterThan(ordered[index - 1]!.position);
    }
  });

  it('rebalances a stage when the gap runs out and preserves the order', () => {
    let cards: PositionedCard[] = [card('head', 1), card('tail', 2)];
    let rebalanced = false;

    for (let index = 0; index < 40; index += 1) {
      const plan = computePosition(cards, 1);
      if (plan.rebalance.length > 0) {
        rebalanced = true;
        expect(plan.position).toBe(2);
        expect(plan.rebalance).toContainEqual({ id: 'head', position: 1 });
        expect(plan.rebalance).toContainEqual({ id: 'tail', position: cards.length + 1 });
        const rewritten = new Map(plan.rebalance.map((update) => [update.id, update.position]));
        cards = cards.map((entry) => (rewritten.has(entry.id) ? card(entry.id, rewritten.get(entry.id)!) : entry));
      }
      cards = [...cards, card(`deal-${index}`, plan.position)];
    }

    expect(rebalanced).toBe(true);
    const ordered = orderByPosition(cards);
    expect(ordered[0]?.id).toBe('head');
    expect(ordered[ordered.length - 1]?.id).toBe('tail');
    const positions = ordered.map((entry) => entry.position);
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index]!).toBeGreaterThan(positions[index - 1]!);
    }
  });

  it('rebalances when two neighbours share the same position', () => {
    const plan = computePosition([card('a', 1), card('b', 1)], 1);

    expect(plan).toEqual({
      position: 2,
      rebalance: [
        { id: 'a', position: 1 },
        { id: 'b', position: 3 },
      ],
    });
  });

  it('rebuilds the minimum gap only when it is smaller than the documented threshold', () => {
    const tight = computePosition([card('a', 1), card('b', 1 + MIN_POSITION_GAP / 2)], 1);
    expect(tight.rebalance).not.toEqual([]);

    const loose = computePosition([card('a', 1), card('b', 1 + MIN_POSITION_GAP * 2)], 1);
    expect(loose.rebalance).toEqual([]);
    expect(loose.position).toBe(1.000000001);
  });
});
