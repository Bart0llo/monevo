import type { Db } from './prisma.js';

// Runtime settings read from `app_settings` (configuration.md#runtime-settings-app_settings).
// Stage 2 reads only `privacy.showSessionIp`; the admin settings UI arrives with its stage.

export const SHOW_SESSION_IP_KEY = 'privacy.showSessionIp';

export async function readShowSessionIp(db: Db): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: SHOW_SESSION_IP_KEY } });
  return typeof row?.value === 'boolean' ? row.value : true;
}
