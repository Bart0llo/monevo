import type { RequestHandler } from 'express';
import { uuidv7 } from 'uuidv7';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Accept a caller-supplied id only when it is short and harmless to echo and log.
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get(REQUEST_ID_HEADER);
    req.requestId = incoming !== undefined && VALID_REQUEST_ID.test(incoming) ? incoming : uuidv7();
    res.setHeader(REQUEST_ID_HEADER, req.requestId);
    next();
  };
}
