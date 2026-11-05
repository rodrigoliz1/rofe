import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.' },
    requestId: req.requestId,
  });
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'INVALID_PAYLOAD', message: 'Revisa los datos enviados.', details: error.flatten() },
      requestId: req.requestId,
    });
    return;
  }

  const databaseMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  const providerType = error && typeof error === 'object' && 'type' in error ? String(error.type) : '';
  if (providerType.startsWith('Stripe')) error = new AppError(502, 'STRIPE_UNAVAILABLE', 'No pudimos confirmar la operación con el servicio de pago. Conserva tu pedido e intenta de nuevo en un momento.');
  if (/insufficient_available_inventory|insufficient_inventory|No hay inventario disponible/.test(databaseMessage)) error = new AppError(409, 'INSUFFICIENT_INVENTORY', 'No hay inventario disponible. Ajusta el pedido o solicita ayuda al equipo.');
  if (/raw_inventory_reservations_check/.test(databaseMessage)) error = new AppError(409, 'INVENTORY_RESERVED', 'Estos insumos están reservados para un cobro pendiente. Finaliza o cancela ese cobro primero.');
  if (/cash_session_required/.test(databaseMessage)) error = new AppError(409, 'CASH_SESSION_REQUIRED', 'Abre una sesión de caja antes de registrar este movimiento.');
  if (/insufficient_cash_denomination|Insufficient cash denomination/.test(databaseMessage)) error = new AppError(409, 'INSUFFICIENT_CASH', 'La caja no tiene esas denominaciones. Revisa el desglose del efectivo.');
  const bodyError = error as { type?: string; status?: number };
  if (bodyError?.type === 'entity.too.large') { res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'El archivo o la solicitud es demasiado grande.' } }); return; }
  if (bodyError?.type === 'entity.parse.failed') { res.status(400).json({ error: { code: 'INVALID_JSON', message: 'La solicitud tiene un formato inválido.' } }); return; }

  const appError = error instanceof AppError
    ? error
    : new AppError(500, 'INTERNAL_ERROR', 'No pudimos completar la operación.');

  const log = appError.status >= 500 ? console.error : console.warn;
  log(JSON.stringify({
    level: appError.status >= 500 ? 'error' : 'warn',
    event: 'request_failed',
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    code: appError.code,
    message: error instanceof Error ? error.message : String(error),
  }));

  res.status(appError.status).json({
    error: { code: appError.code, message: appError.message, details: appError.details },
    requestId: req.requestId,
  });
}
