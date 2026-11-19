/**
 * The web app's only read of the wall clock (coding-conventions.md#3-dates-and-time), so tests can
 * replace it and the `monevo/no-ambient-time` rule can stay on everywhere else.
 */
export const clock = {
  now: (): Date => new Date(),
};
