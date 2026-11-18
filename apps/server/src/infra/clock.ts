/**
 * The only place that reads the wall clock (lint rule `monevo/no-ambient-time`). Everything else
 * receives a `Clock` so tests are deterministic (backend-architecture.md#11-testability).
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function fixedClock(instant: Date): Clock {
  return { now: () => new Date(instant.getTime()) };
}
