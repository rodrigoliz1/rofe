import type { DbAdapter, DbOrder } from '../db';
import { amountDue } from '../db';
import { AppError } from '../utils/errors';
import type { MercadoPagoOrder, MercadoPagoService } from './mercadoPago';
import { reconcilePointOrder } from './orderPayments';

export type PointOutcome = 'PENDING_PROVIDER' | 'MISSING_REFERENCE' | 'PROVIDER_ERROR' | 'REFERENCE_MISMATCH' | 'AMOUNT_MISMATCH' | 'LOCAL_CONFIRMATION_ERROR' | 'RESOLVED';
export interface PointJob {
  orderId: string;
  attempts: number;
  outcome: PointOutcome;
  lastAttemptAt?: string;
  nextAttemptAt: string;
  leaseToken?: string;
  leaseUntil?: string;
}
export function isPendingPoint(order: DbOrder): boolean {
  return order.paymentMethod === 'card' && order.paymentProvider !== 'STRIPE' && order.channel !== 'QR_PICKUP'
    && order.status === 'PENDING_PAYMENT' && order.paymentStatus === 'PENDING';
}

/** Repair only a provider-verified reference. Never search by amount or create a new charge. */
export async function recoverPointReference(db: DbAdapter, provider: MercadoPagoOrder): Promise<void> {
  const local = await db.getOrderById(provider.external_reference);
  if (!local || !isPendingPoint(local) || (local.paymentIntentId && local.paymentIntentId !== provider.id)) {
    throw new AppError(409, 'PAYMENT_REFERENCE_MISMATCH', 'La referencia no corresponde a un cobro pendiente.');
  }
  if (local.paymentIntentId) return;
  const payment = provider.transactions?.payments?.[0];
  const tip = Number(payment?.tip_amount ?? 0);
  const amount = provider.status === 'processed' ? Number(payment?.paid_amount ?? provider.total_paid_amount) - Number(payment?.tip_amount ?? 0) : Number(payment?.amount);
  if (!Number.isFinite(tip) || tip < 0 || !Number.isFinite(amount) || Math.abs(amount - amountDue(local)) > 0.001 || (provider.currency && provider.currency !== 'MXN')) {
    throw new AppError(409, 'PAYMENT_AMOUNT_MISMATCH', 'El importe verificado no coincide con el pedido.');
  }
  await db.attachPaymentIntent(local.id, provider.id);
  const attached = await db.getOrderById(local.id);
  if (attached?.paymentIntentId !== provider.id) throw new AppError(409, 'PAYMENT_REFERENCE_MISMATCH', 'La referencia cambió durante la recuperación.');
}

/** Its provider port exposes GET only. Browser, webhook and workers share the same SQL payment boundary. */
export async function runPointReconciliation(db: DbAdapter, provider: Pick<MercadoPagoService, 'getOrder'>) {
  const claims = await db.claimPointReconciliation(5);
  let resolved = 0;
  for (const claim of claims) {
    let outcome: PointOutcome = 'PROVIDER_ERROR';
    let fetched = false;
    try {
      const order = await db.getOrderById(claim.orderId);
      if (!order || !isPendingPoint(order)) outcome = 'RESOLVED';
      else if (!order.paymentIntentId) outcome = 'MISSING_REFERENCE';
      else {
        const verified = await provider.getOrder(order.paymentIntentId);
        fetched = true;
        if (verified.id !== order.paymentIntentId || verified.external_reference !== order.id) throw new AppError(409, 'PAYMENT_REFERENCE_MISMATCH', 'La referencia consultada no coincide con el pedido.');
        const result = await reconcilePointOrder(db, verified);
        outcome = isPendingPoint(result.order) ? 'PENDING_PROVIDER' : 'RESOLVED';
      }
    } catch (error) {
      if (fetched) outcome = 'LOCAL_CONFIRMATION_ERROR';
      if (error instanceof AppError && error.code === 'PAYMENT_REFERENCE_MISMATCH') outcome = 'REFERENCE_MISMATCH';
      else if (error instanceof AppError && error.code === 'PAYMENT_AMOUNT_MISMATCH') outcome = 'AMOUNT_MISMATCH';
      // No provider payload, raw exception, terminal or account identifier is persisted.
    }
    const delaySeconds = outcome === 'RESOLVED' ? 0 : Math.min(3600, 30 * 2 ** Math.min(claim.attempts, 7));
    await db.finishPointReconciliation(claim.orderId, claim.leaseToken!, outcome, delaySeconds);
    if (outcome === 'RESOLVED') resolved++;
  }
  return { claimed: claims.length, resolved };
}
