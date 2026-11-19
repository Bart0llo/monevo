import express, { type Router } from 'express';
import {
  type Profile,
  ProfileUpdateSchema,
  type UserSettings,
  UserSettingsUpdateSchema,
} from '@monevo/contracts';
import { AppError } from '../../http/errors.js';
import { authOf, type Guards, sessionOf } from '../../http/guards.js';
import { expectedVersion, setVersionTag } from '../../http/versioning.js';
import type { Clock } from '../../infra/clock.js';
import type { PrismaClient } from '../../infra/prisma.js';
import {
  currencyIsActive,
  findSettings,
  findUser,
  type SettingsChanges,
  type SettingsRecord,
  updateDisplayName,
  updateSettings,
  type UserRecord,
} from './users.repo.js';

// `/me` and `/me/settings` (authentication.md#8-api-surface-summary).

export interface MeDeps {
  readonly prisma: PrismaClient;
  readonly clock: Clock;
}

export function toSettingsDto(settings: SettingsRecord): UserSettings {
  return {
    locale: settings.locale as UserSettings['locale'],
    timeZone: settings.timeZone,
    baseCurrency: settings.baseCurrency,
    weekStart: settings.weekStart,
    dateFormat: settings.dateFormat as UserSettings['dateFormat'],
    theme: settings.theme,
    onboardingCompletedAt: settings.onboardingCompletedAt?.toISOString() ?? null,
    version: settings.version,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

function toProfile(user: UserRecord, includeEmail: boolean): Profile {
  return {
    id: user.id,
    displayName: user.displayName,
    ...(includeEmail ? { email: user.email } : {}),
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export function meRouter(deps: MeDeps, guards: Guards): Router {
  const router = express.Router();
  const { prisma } = deps;

  async function loadUser(userId: string): Promise<UserRecord> {
    const user = await findUser(prisma, userId);
    if (!user) throw new AppError('UNAUTHENTICATED');
    return user;
  }

  async function loadSettings(userId: string): Promise<SettingsRecord> {
    const settings = await findSettings(prisma, userId);
    if (!settings) throw new AppError('NOT_FOUND');
    return settings;
  }

  router.get('/me', ...guards.requireAuth({ permissions: ['profile:read'] }), async (req, res) => {
    const auth = authOf(req);
    const user = await loadUser(auth.userId);
    res.json(toProfile(user, auth.credential.type === 'SESSION'));
  });

  router.patch('/me', ...guards.requireAuth(), async (req, res) => {
    const { userId } = sessionOf(req);
    const body = ProfileUpdateSchema.parse(req.body);
    const user = await updateDisplayName(prisma, userId, body.displayName);
    res.json(toProfile(user, true));
  });

  router.get(
    '/me/settings',
    ...guards.requireAuth({ permissions: ['profile:read'] }),
    async (req, res) => {
      const settings = await loadSettings(authOf(req).userId);
      setVersionTag(res, settings.version);
      res.json(toSettingsDto(settings));
    },
  );

  router.patch('/me/settings', ...guards.requireAuth(), async (req, res) => {
    const { userId } = sessionOf(req);
    const body = UserSettingsUpdateSchema.parse(req.body);
    const version = expectedVersion(req, body.version);
    const current = await loadSettings(userId);
    if (current.version !== version) {
      throw new AppError('VERSION_CONFLICT', undefined, undefined, toSettingsDto(current));
    }
    if (body.baseCurrency !== undefined && body.baseCurrency !== current.baseCurrency) {
      if (current.onboardingCompletedAt !== null) {
        throw new AppError('VALIDATION_FAILED', 'The base currency is locked after onboarding.', [
          {
            path: ['baseCurrency'],
            code: 'BASE_CURRENCY_LOCKED',
            message: 'The base currency cannot be changed after onboarding.',
          },
        ]);
      }
      if (!(await currencyIsActive(prisma, body.baseCurrency))) {
        throw new AppError('VALIDATION_FAILED', 'One or more fields are invalid.', [
          { path: ['baseCurrency'], code: 'INVALID_VALUE', message: 'Unknown currency.' },
        ]);
      }
    }
    const changes: SettingsChanges = {
      ...(body.locale === undefined ? {} : { locale: body.locale }),
      ...(body.timeZone === undefined ? {} : { timeZone: body.timeZone }),
      ...(body.baseCurrency === undefined ? {} : { baseCurrency: body.baseCurrency }),
      ...(body.weekStart === undefined ? {} : { weekStart: body.weekStart }),
      ...(body.dateFormat === undefined ? {} : { dateFormat: body.dateFormat }),
      ...(body.theme === undefined ? {} : { theme: body.theme }),
      ...(body.completeOnboarding && current.onboardingCompletedAt === null
        ? { onboardingCompletedAt: deps.clock.now() }
        : {}),
    };
    const updated = await updateSettings(prisma, userId, version, changes);
    if (!updated) {
      const latest = await loadSettings(userId);
      throw new AppError('VERSION_CONFLICT', undefined, undefined, toSettingsDto(latest));
    }
    setVersionTag(res, updated.version);
    res.json(toSettingsDto(updated));
  });

  return router;
}
