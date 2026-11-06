import type { Express, Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import type { DbAdapter, DbOrder } from '../db';
import type { AppEnv } from '../config/env';
import type { MercadoPagoService } from '../payments/mercadoPago';
import { recoverPointReference, runPointReconciliation } from '../payments/pointReconciliation';
import { reconcilePointOrder } from '../payments/orderPayments';
import { AppError } from '../utils/errors';

export function isCronAuthorized(header: string | undefined, secret: string | undefined): boolean {
  if (!header || !secret) return false;
  const actual = Buffer.from(header); const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Register after the application's ADMIN/MANAGER middleware. No financial POST to MP. */
export function registerPointReconciliationRoutes(app: Express, db: DbAdapter, provider: MercadoPagoService, env: AppEnv, onChecked?: (req: Request, order: DbOrder) => Promise<void>) {
  app.get('/api/internal/point-reconciliation', async (req, res, next) => {
    try {
      if (!isCronAuthorized(req.header('authorization'), env.CRON_SECRET)) throw new AppError(401, 'CRON_UNAUTHORIZED', 'Acceso no autorizado.');
      if (!env.POINT_RECONCILIATION_ENABLED) throw new AppError(503, 'RECONCILIATION_DISABLED', 'La conciliación programada no está habilitada.');
      if (!provider.isConfigured()) throw new AppError(503, 'POINT_NOT_CONFIGURED', 'Point no está configurado.');
      res.setHeader('Cache-Control', 'no-store');
      res.json(await runPointReconciliation(db, provider));
    } catch (error) { next(error); }
  });
  app.get('/api/admin/payments/point', async (_req, res, next) => {
    try {
      const pending = await db.listPendingPoint();
      const unassigned = await db.listUnassignedPoint();
      res.setHeader('Cache-Control', 'no-store');
      res.json({ available: await db.pointReconciliationAvailable(), enabled: env.POINT_RECONCILIATION_ENABLED && Boolean(env.CRON_SECRET), limit: 100,
        unassigned: unassigned.map(order => ({ id: order.id, folio: order.folio ?? order.id, total: order.total, paidAt: order.paidAt })),
        orders: pending.map(({ order, job }) => ({ id: order.id, folio: order.folio ?? order.id, total: order.total, createdAt: order.createdAt,
          hasProviderReference: Boolean(order.paymentIntentId), attempts: job?.attempts ?? 0, outcome: job?.outcome ?? (order.paymentIntentId ? 'PENDING_PROVIDER' : 'MISSING_REFERENCE'),
          lastAttemptAt: job?.lastAttemptAt, nextAttemptAt: job?.nextAttemptAt })) });
    } catch (error) { next(error); }
  });
  app.post('/api/admin/payments/point/:id/reconcile', async (req, res, next) => {
    try {
      const { providerOrderId } = z.object({ providerOrderId: z.string().trim().min(1).max(100).optional() }).parse(req.body);
      const local = await db.getOrderById(req.params.id);
      if (!local || local.paymentMethod !== 'card' || local.paymentProvider === 'STRIPE' || local.channel === 'QR_PICKUP') throw new AppError(404, 'ORDER_NOT_FOUND', 'No se encontró un pedido Point.');
      const id = local.paymentIntentId ?? providerOrderId;
      if (!id) throw new AppError(409, 'POINT_REFERENCE_REQUIRED', 'Hace falta el identificador verificado de la orden en Mercado Pago. No envíes otro cobro.');
      const verified = await provider.getOrder(id);
      if (verified.external_reference !== local.id || verified.id !== id) throw new AppError(409, 'PAYMENT_REFERENCE_MISMATCH', 'La referencia no corresponde al pedido.');
      if (!local.paymentIntentId) await recoverPointReference(db, verified);
      const result = await reconcilePointOrder(db, verified);
      await onChecked?.(req, result.order);
      res.json({ orderId: result.order.id, status: result.order.status, paymentStatus: result.order.paymentStatus, changed: result.changed });
    } catch (error) { next(error); }
  });
}
