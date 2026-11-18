declare global {
  namespace Express {
    interface Request {
      /** Set by the request-id middleware for every request (monitoring-and-logging.md#standard-fields). */
      requestId: string;
    }
  }
}

export {};
