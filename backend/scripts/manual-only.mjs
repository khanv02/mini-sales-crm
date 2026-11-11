/**
 * Placeholder runner for suites that are manual/nightly only at M0.
 * It exits 0 with an explicit message so the documented alias exists.
 */
const name = process.argv[2] ?? 'manual suite';

console.log(`[${name}] No automated suite at M0. See docs/testing-strategy.md for the schedule.`);
