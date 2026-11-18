import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { captureLogger } from '../../test-support/logger.js';
import { AppError, errorHandler } from '../errors.js';
import { requestId } from '../request-id.js';

function appThrowing(error: unknown) {
  const { logger, lines } = captureLogger();
  const app = express();
  app.use(requestId());
  app.get('/boom', () => {
    throw error;
  });
  app.use(errorHandler(logger));
  return { app, lines };
}

describe('errorHandler', () => {
  it('maps ZodError to 422 VALIDATION_FAILED with field paths', async () => {
    const schema = z.object({
      postings: z.array(
        z.object({
          amount: z.string().refine(() => false, {
            params: { code: 'AMOUNT_PRECISION' },
            message: 'Too many decimals',
          }),
        }),
      ),
      name: z.string(),
    });
    const result = schema.safeParse({ postings: [{ amount: '1' }, { amount: '1.234' }], name: 5 });
    const { app } = appThrowing(result.error);
    const res = await request(app).get('/boom').expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        { path: ['postings', 1, 'amount'], code: 'AMOUNT_PRECISION', message: 'Too many decimals' },
        expect.objectContaining({ path: ['name'], code: 'INVALID_TYPE' }),
      ]),
    );
  });

  it('passes AppError through with its status and detail', async () => {
    const { app } = appThrowing(new AppError('NOT_FOUND', 'Gone.'));
    const res = await request(app).get('/boom').expect(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', detail: 'Gone.', title: 'Not found' });
  });

  it('maps unknown errors to 500 INTERNAL without leaking the message or stack, and logs them', async () => {
    const { app, lines } = appThrowing(new Error('database password is hunter2'));
    const res = await request(app).get('/boom').expect(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL', status: 500 });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(JSON.stringify(res.body)).not.toContain('at ');
    const logged = lines().find((line) => line['msg'] === 'unhandled error');
    expect(logged).toMatchObject({ level: 'error', requestId: res.body.requestId });
  });
});
