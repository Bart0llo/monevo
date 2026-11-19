import express, { type Request, type Router } from 'express';
import { uuidv7 } from 'uuidv7';
import {
  type Account,
  AccountCreateSchema,
  type AccountListResponse,
  AccountUpdateSchema,
} from '@monevo/contracts';
import {
  type Decimal,
  money,
  MoneyError,
  moneyToDecimalString,
  parseDecimal,
} from '@monevo/domain';
import { AppError, fieldError, isUniqueViolation } from '../../http/errors.js';
import { authOf, type Guards } from '../../http/guards.js';
import { uuidParam } from '../../http/params.js';
import { setVersionTag, versionPrecondition } from '../../http/versioning.js';
import type { Clock } from '../../infra/clock.js';
import type { PrismaClient } from '../../infra/prisma.js';
import { findCurrency } from '../currencies/index.js';
import {
  type AccountChanges,
  type AccountRecord,
  createAccount,
  deleteAccount,
  findAccount,
  listAccounts,
  nextAccountSortOrder,
  setAccountArchived,
  updateAccount,
} from './accounts.repo.js';

// `/accounts` (api-design.md#8-endpoint-map, features.md#accounts). Stage 3 has no postings: the
// currency is always editable and delete always allowed. No balances are computed.

export interface AccountRouteDeps {
  readonly prisma: PrismaClient;
  readonly clock: Clock;
}

export function toAccountDto(record: AccountRecord): Account {
  return {
    id: record.id,
    name: record.name,
    currency: record.currency,
    kind: record.kind,
    customKindLabel: record.customKindLabel,
    icon: record.icon,
    color: record.color,
    openingBalance: moneyToDecimalString(money(record.openingBalance, record.currency)),
    openingDate: record.openingDate,
    includeInNetWorthWidget: record.includeInNetWorthWidget,
    sortOrder: record.sortOrder,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** The opening balance as a decimal string at the currency exponent, or a field error. */
function openingBalanceFor(amount: string | Decimal, currency: string): string {
  try {
    return moneyToDecimalString(money(amount, currency));
  } catch (error) {
    if (error instanceof MoneyError) {
      throw fieldError(
        'openingBalance',
        error.code,
        error.code === 'AMOUNT_PRECISION'
          ? `Too many decimal places for ${currency}.`
          : 'The amount is out of range.',
      );
    }
    throw error;
  }
}

function tokenRequest(req: Request): boolean {
  return authOf(req).credential.type === 'API_TOKEN';
}

export function accountsRouter(deps: AccountRouteDeps, guards: Guards): Router {
  const router = express.Router();
  const { prisma, clock } = deps;

  async function requireActiveCurrency(code: string): Promise<void> {
    const currency = await findCurrency(prisma, code);
    if (currency?.active !== true) {
      throw fieldError('currency', 'CURRENCY_INACTIVE', 'The currency is not available.');
    }
  }

  async function load(userId: string, id: string): Promise<AccountRecord> {
    const account = await findAccount(prisma, userId, id);
    if (!account) throw new AppError('NOT_FOUND');
    return account;
  }

  function conflict(current: AccountRecord): AppError {
    return new AppError('VERSION_CONFLICT', undefined, undefined, toAccountDto(current));
  }

  router.get(
    '/accounts',
    ...guards.requireAuth({ permissions: ['accounts:read'] }),
    async (req, res) => {
      const body: AccountListResponse = {
        items: (await listAccounts(prisma, authOf(req).userId)).map(toAccountDto),
      };
      res.json(body);
    },
  );

  router.post(
    '/accounts',
    ...guards.requireAuth({ permissions: ['accounts:create'] }),
    async (req, res) => {
      const { userId } = authOf(req);
      const body = AccountCreateSchema.parse(req.body);
      await requireActiveCurrency(body.currency);
      const openingBalance = openingBalanceFor(body.openingBalance, body.currency);
      let created: AccountRecord;
      try {
        created = await createAccount(prisma, userId, body.id ?? uuidv7(), {
          name: body.name,
          currency: body.currency,
          kind: body.kind,
          customKindLabel: body.customKindLabel ?? null,
          icon: body.icon,
          color: body.color,
          openingBalance,
          openingDate: body.openingDate,
          includeInNetWorthWidget: body.includeInNetWorthWidget,
          sortOrder: body.sortOrder ?? (await nextAccountSortOrder(prisma, userId)),
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new AppError('ID_CONFLICT');
        throw error;
      }
      setVersionTag(res, created.version);
      res.status(201).json(toAccountDto(created));
    },
  );

  router.get(
    '/accounts/:id',
    ...guards.requireAuth({ permissions: ['accounts:read'] }),
    async (req, res) => {
      const account = await load(authOf(req).userId, uuidParam(req, 'id'));
      setVersionTag(res, account.version);
      res.json(toAccountDto(account));
    },
  );

  router.patch(
    '/accounts/:id',
    ...guards.requireAuth({ permissions: ['accounts:update'] }),
    async (req, res) => {
      const { userId } = authOf(req);
      const id = uuidParam(req, 'id');
      const body = AccountUpdateSchema.parse(req.body);
      const expected = versionPrecondition(req, body.version, tokenRequest(req));
      const current = await load(userId, id);
      if (expected !== undefined && expected !== current.version) throw conflict(current);

      const kind = body.kind ?? current.kind;
      const label =
        body.customKindLabel === undefined ? current.customKindLabel : body.customKindLabel;
      if ((kind === 'CUSTOM') !== (label !== null)) {
        throw fieldError(
          'customKindLabel',
          'CUSTOM',
          'customKindLabel is required for kind CUSTOM and not allowed otherwise',
        );
      }
      const currency = body.currency ?? current.currency;
      if (currency !== current.currency) await requireActiveCurrency(currency);
      const changes: AccountChanges = {
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.currency === undefined ? {} : { currency: body.currency }),
        ...(body.kind === undefined ? {} : { kind: body.kind }),
        ...(body.customKindLabel === undefined ? {} : { customKindLabel: body.customKindLabel }),
        ...(body.icon === undefined ? {} : { icon: body.icon }),
        ...(body.color === undefined ? {} : { color: body.color }),
        ...(body.openingBalance === undefined && currency === current.currency
          ? {}
          : {
              openingBalance: openingBalanceFor(
                body.openingBalance === undefined
                  ? current.openingBalance
                  : parseDecimal(body.openingBalance),
                currency,
              ),
            }),
        ...(body.openingDate === undefined ? {} : { openingDate: body.openingDate }),
        ...(body.includeInNetWorthWidget === undefined
          ? {}
          : { includeInNetWorthWidget: body.includeInNetWorthWidget }),
        ...(body.sortOrder === undefined ? {} : { sortOrder: body.sortOrder }),
      };
      const updated = await updateAccount(prisma, userId, id, current.version, changes);
      if (!updated) throw conflict(await load(userId, id));
      setVersionTag(res, updated.version);
      res.json(toAccountDto(updated));
    },
  );

  router.delete(
    '/accounts/:id',
    ...guards.requireAuth({ permissions: ['accounts:delete'] }),
    async (req, res) => {
      const { userId } = authOf(req);
      const id = uuidParam(req, 'id');
      const expected = versionPrecondition(req, undefined, tokenRequest(req));
      if (!(await deleteAccount(prisma, userId, id, expected))) {
        const current = await load(userId, id);
        throw conflict(current);
      }
      res.status(204).end();
    },
  );

  for (const action of ['archive', 'unarchive'] as const) {
    router.post(
      `/accounts/:id/${action}`,
      ...guards.requireAuth({ permissions: ['accounts:update'] }),
      async (req, res) => {
        const { userId } = authOf(req);
        const id = uuidParam(req, 'id');
        await load(userId, id);
        const updated = await setAccountArchived(
          prisma,
          userId,
          id,
          action === 'archive' ? clock.now() : null,
        );
        if (!updated) throw new AppError('NOT_FOUND');
        setVersionTag(res, updated.version);
        res.json(toAccountDto(updated));
      },
    );
  }

  return router;
}
