import { DEFAULT_RATE_PROVIDER, RATE_PROVIDERS, type RateProviderId } from '@monevo/contracts';
import type { Db } from './prisma.js';

// Runtime settings read from `app_settings` (configuration.md#runtime-settings-app_settings).
// Environment values override stored settings.

export const SHOW_SESSION_IP_KEY = 'privacy.showSessionIp';
export const RATES_PROVIDER_KEY = 'rates.provider';

export async function readShowSessionIp(db: Db): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: SHOW_SESSION_IP_KEY } });
  return typeof row?.value === 'boolean' ? row.value : true;
}

/** The stored `rates.provider`, or undefined when unset or not a known provider. */
export async function readRateProviderSetting(db: Db): Promise<RateProviderId | undefined> {
  const row = await db.appSetting.findUnique({ where: { key: RATES_PROVIDER_KEY } });
  const value = row?.value;
  return typeof value === 'string' && (RATE_PROVIDERS as readonly string[]).includes(value)
    ? (value as RateProviderId)
    : undefined;
}

/** `RATE_PROVIDER` ?? `rates.provider` ?? the default. */
export async function effectiveRateProvider(
  db: Db,
  envValue: RateProviderId | undefined,
): Promise<RateProviderId> {
  if (envValue !== undefined) return envValue;
  return (await readRateProviderSetting(db)) ?? DEFAULT_RATE_PROVIDER;
}

export async function writeAppSetting(
  db: Db,
  key: string,
  value: string | number | boolean,
  userId: string,
): Promise<void> {
  await db.appSetting.upsert({
    where: { key },
    create: { key, value, updatedByUserId: userId },
    update: { value, updatedByUserId: userId },
  });
}
