import type { NextFunction, Request, Response } from 'express';

export interface ApiError extends Error {
  status?: number;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Invalid JSON body', status: 400 });
    return;
  }

  const status = err.status ?? 500;
  const message = err.message || 'Internal server error';

  if (status >= 500) {
    console.error('[agnes-server] error:', message);
  }

  res.status(status).json({
    error: message,
    status,
  });
}

export function createHttpError(status: number, message: string): ApiError {
  const error = new Error(message) as ApiError;
  error.status = status;
  return error;
}
