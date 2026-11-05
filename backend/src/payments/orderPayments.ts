import { amountDue, type DbAdapter, type DbOrder } from '../db';
import { calculateRecipeConsumption } from '../domain/inventory';
import type { PricedOrderItem } from '../domain/pricing';
import { AppError } from '../utils/errors';
import type { MercadoPagoOrder, MercadoPagoService } from './mercadoPago';

/** Both webhook deliveries and explicit status checks use the same payment boundary. */
export async function reconcilePointOrder(db: DbAdapter, provider: MercadoPagoOrder): Promise<{ order: DbOrder; changed: boolean }> {
  const local = await db.getOrderById(provider.external_reference);
  if (!local || local.paymentMethod !== 'card' || local.paymentIntentId !== provider.id) {
    throw new AppError(409, 'PAYMENT_REFERENCE_MISMATCH', 'La referencia del pago no coincide con un pedido.');
  }
  let changed = false;
  if (provider.status === 'processed' && ['accredited', 'processed'].includes(provider.status_detail ?? '')) {
    const transaction = provider.transactions?.payments?.[0];
    const tip = Number(transaction?.tip_amount ?? 0);
    const amount = Number(transaction?.paid_amount ?? provider.total_paid_amount) - tip;
    if ((provider.currency && provider.currency !== 'MXN') || !Number.isFinite(tip) || tip < 0 || !Number.isFinite(amount) || Math.abs(amount - amountDue(local)) > 0.001) {
      throw new AppError(409, 'PAYMENT_AMOUNT_MISMATCH', 'El importe confirmado no coincide con el pedido.');
    }
    if (local.paymentStatus !== 'APPROVED' && local.paymentStatus !== 'REFUNDED' && local.status !== 'CANCELLED') {
      const paymentId = provider.transactions?.payments?.[0]?.reference_id ?? provider.transactions?.payments?.[0]?.reference?.id ?? provider.transactions?.payments?.[0]?.id ?? provider.id;
      changed = await db.confirmOrderPayment(local.id, paymentId, calculateRecipeConsumption(local.items as PricedOrderItem[]));
    }
  } else if (['failed', 'canceled', 'expired'].includes(provider.status)) {
    if (local.paymentStatus === 'PENDING' && local.status === 'PENDING_PAYMENT') {
      await db.updateOrderStatus(local.id, 'PENDING_PAYMENT', undefined, 'REJECTED');
      changed = true;
    }
  } else if (provider.status === 'refunded' && local.paymentStatus === 'APPROVED') {
    changed = await db.applyOrderRefund({ orderId: local.id, operationId: local.operationId ?? local.id, reason: 'Reembolso confirmado por Mercado Pago', userId: 'mercado-pago' });
  }
  return { order: (await db.getOrderById(local.id))!, changed };
}

export async function sendOrderToPoint(db: DbAdapter, service: MercadoPagoService, order: DbOrder): Promise<DbOrder> {
  if (order.paymentIntentId || order.paymentStatus !== 'PENDING' || order.status !== 'PENDING_PAYMENT') return order;
  await db.reserveOrderInventory(order.id, calculateRecipeConsumption(order.items as PricedOrderItem[]));
  // Vouchers already paid part of the total: the terminal charges only what is due.
  const provider = await service.createPointOrder({ orderId: order.id, total: amountDue(order), idempotencyKey: order.operationId! });
  if (provider.external_reference !== order.id) throw new AppError(502, 'PAYMENT_REFERENCE_MISMATCH', 'Mercado Pago devolvió una referencia inesperada. Solicita ayuda.');
  await db.attachPaymentIntent(order.id, provider.id);
  return { ...order, paymentIntentId: provider.id };
}
