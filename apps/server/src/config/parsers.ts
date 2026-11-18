// Value formats shared by environment variables (configuration.md#1-two-configuration-layers).

const SIZE_UNITS: Readonly<Record<string, number>> = {
  '': 1,
  B: 1,
  KB: 1000,
  MB: 1000 ** 2,
  GB: 1000 ** 3,
  KIB: 1024,
  MIB: 1024 ** 2,
  GIB: 1024 ** 3,
};

/**
 * Parses a byte size: a plain count or a suffix (`KB`/`MB`/`GB` are powers of 1000, `KiB`/`MiB`/`GiB`
 * powers of 1024). Returns `undefined` for anything else, including fractions.
 */
export function parseSize(input: string): number | undefined {
  const match = /^(\d+)\s*([a-zA-Z]*)$/.exec(input.trim());
  if (!match) return undefined;
  const [, digits = '', unit = ''] = match;
  const multiplier = SIZE_UNITS[unit.toUpperCase()];
  if (multiplier === undefined) return undefined;
  const value = Number(digits) * multiplier;
  return Number.isSafeInteger(value) ? value : undefined;
}

/** Booleans accept exactly `true` or `false`. */
export function parseBoolean(input: string): boolean | undefined {
  if (input === 'true') return true;
  if (input === 'false') return false;
  return undefined;
}

/**
 * Express `trust proxy` value: `true`/`false`, a hop count, or a comma-separated list of addresses,
 * subnets or the presets `loopback`, `linklocal`, `uniquelocal`.
 */
export function parseTrustProxy(input: string): boolean | number | string {
  const asBoolean = parseBoolean(input);
  if (asBoolean !== undefined) return asBoolean;
  if (/^\d+$/.test(input)) return Number(input);
  return input
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(', ');
}
