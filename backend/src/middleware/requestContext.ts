import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header('x-request-id');
  req.requestId = inbound && inbound.length <= 128 ? inbound : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  const startedAt = Date.now();

  res.on('finish', () => {
    console.log(JSON.stringify({
      level: 'info',
      event: 'http_request',
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.principal?.role === 'POS_DEVICE' ? undefined : req.principal?.subjectId,
      deviceId: req.principal?.deviceId,
    }));
  });

  next();
}
