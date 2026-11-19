import type { Request, Response } from 'express';
import { AppError } from './errors.js';

// Optimistic concurrency (api-design.md#3-conventions): `ETag: "<version>"`, `If-Match` or a body
// `version`.

export function setVersionTag(res: Response, version: number): void {
  res.setHeader('ETag', `"${version}"`);
}

/** The expected version from `If-Match` (preferred) or the body; `428` when neither is present. */
export function expectedVersion(req: Request, bodyVersion: number | undefined): number {
  const header = req.get('If-Match');
  if (header !== undefined) {
    const match = /^\s*(?:W\/)?"(\d{1,9})"\s*$/.exec(header);
    if (!match?.[1]) {
      throw new AppError('MALFORMED_REQUEST', 'If-Match must be a version tag such as "3".');
    }
    return Number(match[1]);
  }
  if (bodyVersion !== undefined) return bodyVersion;
  throw new AppError('PRECONDITION_REQUIRED', 'Send If-Match or version.');
}
