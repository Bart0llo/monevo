import type { Request } from 'express';
import { AppError } from './errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A UUID path parameter; anything else is `404 NOT_FOUND` like a foreign ID. */
export function uuidParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !UUID.test(value)) throw new AppError('NOT_FOUND');
  return value.toLowerCase();
}
