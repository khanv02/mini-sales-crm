import { useFakeClock, type FakeClock } from '../support/clock';

describe('useFakeClock', () => {
  let clock: FakeClock | undefined;

  afterEach(() => {
    clock?.restore();
    clock = undefined;
  });

  it('freezes Date at the start instant and moves it forward', () => {
    clock = useFakeClock('2026-11-18T09:00:00.000Z');

    expect(clock.now().toISOString()).toBe('2026-11-18T09:00:00.000Z');
    expect(new Date().toISOString()).toBe('2026-11-18T09:00:00.000Z');

    expect(clock.advanceMinutes(90).toISOString()).toBe('2026-11-18T10:30:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-11-18T10:30:00.000Z');
  });

  it('accepts a Date and advances by milliseconds', () => {
    clock = useFakeClock(new Date('2026-01-01T00:00:00.000Z'));

    const next = clock.advance(1_500);
    expect(next.toISOString()).toBe('2026-01-01T00:00:01.500Z');
  });

  it('restores the real clock so later tests are unaffected', () => {
    clock = useFakeClock('2000-01-01T00:00:00.000Z');
    const frozen = Date.now();
    clock.restore();

    expect(frozen).toBe(new Date('2000-01-01T00:00:00.000Z').getTime());
    expect(Date.now()).not.toBe(frozen);
  });

  it('rejects an unparsable start value', () => {
    expect(() => useFakeClock('not-a-date')).toThrow(/invalid start value/);
  });
});
