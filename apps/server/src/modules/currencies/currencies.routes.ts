import express, { type Router } from 'express';
import {
  type CurrencyListResponse,
  type ExchangeRate,
  ExchangeRateCreateSchema,
  type ExchangeRateListResponse,
  ExchangeRateListQuerySchema,
  ExchangeRateResolveRequestSchema,
} from '@monevo/contracts';
import { parseDecimal, rateToDecimalString } from '@monevo/domain';
import { AppError } from '../../http/errors.js';
import { authOf, type Guards } from '../../http/guards.js';
import type { PrismaClient } from '../../infra/prisma.js';
import { findSettings } from '../users/index.js';
import { listCurrencies, listRates, type RateRecord, upsertManualRate } from './rates.repo.js';
import type { RateService } from './rates.service.js';

// `/currencies` and `/exchange-rates` (api-design.md#8-endpoint-map, multi-currency.md).

export interface CurrencyRouteDeps {
  readonly prisma: PrismaClient;
  readonly rates: RateService;
}

export function toExchangeRateDto(record: RateRecord): ExchangeRate {
  return {
    id: record.id,
    fromCurrency: record.fromCurrency,
    toCurrency: record.toCurrency,
    rateDate: record.rateDate,
    rate: rateToDecimalString(record.rate),
    source: record.source,
    providerId: record.providerId,
    publishedOn: record.publishedOn,
    fetchedAt: record.fetchedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function currenciesRouter(deps: CurrencyRouteDeps, guards: Guards): Router {
  const router = express.Router();
  const { prisma } = deps;

  router.get(
    '/currencies',
    ...guards.requireAuth({ permissions: ['currencies:read'] }),
    async (_req, res) => {
      const body: CurrencyListResponse = { items: await listCurrencies(prisma) };
      res.json(body);
    },
  );

  router.get(
    '/exchange-rates',
    ...guards.requireAuth({ permissions: ['currencies:read'] }),
    async (req, res) => {
      const query = ExchangeRateListQuerySchema.parse(req.query);
      const rows = await listRates(prisma, {
        userId: authOf(req).userId,
        from: query.from,
        to: query.to,
        date: query.date,
        limit: query.limit,
      });
      const body: ExchangeRateListResponse = { items: rows.map(toExchangeRateDto) };
      res.json(body);
    },
  );

  router.post(
    '/exchange-rates',
    ...guards.requireAuth({ permissions: ['exchange-rates:create'] }),
    async (req, res) => {
      const body = ExchangeRateCreateSchema.parse(req.body);
      const { record, created } = await upsertManualRate(prisma, {
        userId: authOf(req).userId,
        fromCurrency: body.fromCurrency,
        toCurrency: body.toCurrency,
        rateDate: body.rateDate,
        rate: parseDecimal(body.rate),
      });
      res.status(created ? 201 : 200).json(toExchangeRateDto(record));
    },
  );

  router.post(
    '/exchange-rates/resolve',
    ...guards.requireAuth({ permissions: ['exchange-rates:create'] }),
    async (req, res) => {
      const body = ExchangeRateResolveRequestSchema.parse(req.body);
      const { userId } = authOf(req);
      const settings = await findSettings(prisma, userId);
      if (!settings) throw new AppError('NOT_FOUND');
      res.json(
        await deps.rates.resolve({
          userId,
          timeZone: settings.timeZone,
          fromCurrency: body.fromCurrency,
          toCurrency: body.toCurrency,
          date: body.date,
        }),
      );
    },
  );

  return router;
}
