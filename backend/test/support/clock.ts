/**
 * Fake clock for scheduler tests (T307).
 *
 * Only `Date` and timers are faked; promise/microtask scheduling stays real so awaited mocks and I/O still settle.
 * Call `restore()` in `afterEach` — leaving fake timers on breaks HTTP helpers and BullMQ in later tests.
 */
export interface FakeClock {
  readonly start: Date;
  now(): Date;
  /** Moves the clock forward and returns the new instant. */
  advance(ms: number): Date;
  advanceMinutes(minutes: number): Date;
  restore(): void;
}

export function useFakeClock(start: Date | string): FakeClock {
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error(`useFakeClock: invalid start value "${String(start)}"`);
  }

  jest.useFakeTimers({
    now: startDate.getTime(),
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  });

  return {
    start: startDate,
    now: () => new Date(Date.now()),
    advance(ms) {
      jest.advanceTimersByTime(ms);
      return new Date(Date.now());
    },
    advanceMinutes(minutes) {
      jest.advanceTimersByTime(minutes * 60_000);
      return new Date(Date.now());
    },
    restore() {
      jest.useRealTimers();
    },
  };
}
