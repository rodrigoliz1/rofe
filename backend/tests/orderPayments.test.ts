import { describe, expect, it, vi } from 'vitest';
import type { DbAdapter, DbOrder } from '../src/db';
import type { MercadoPagoOrder } from '../src/payments/mercadoPago';
import { reconcilePointOrder, sendOrderToPoint } from '../src/payments/orderPayments';
import { MercadoPagoService } from '../src/payments/mercadoPago';

function fixture(overrides: Partial<DbOrder> = {}) {
  const order: DbOrder = { id: 'local-1', operationId: 'operation-1', deviceId: 'device-1', customerName: 'Cliente', items: [], total: 55, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', paymentMethod: 'card', paymentIntentId: 'ORD1', createdAt: new Date().toISOString(), ...overrides };
  const confirmOrderPayment = vi.fn(async () => { order.paymentStatus = 'APPROVED'; order.status = 'PAID'; return true; });
  const updateOrderStatus = vi.fn(async () => { order.paymentStatus = 'REJECTED'; });
  const applyOrderRefund = vi.fn(async () => { order.paymentStatus = 'REFUNDED'; order.status = 'REFUNDED'; return true; });
  const attachPaymentIntent = vi.fn(async (_id: string, intent: string) => { order.paymentIntentId = intent; });
  const db = { getOrders: vi.fn(async () => [order]), getOrderById: vi.fn(async (id: string) => id === order.id ? order : undefined), confirmOrderPayment, updateOrderStatus, applyOrderRefund, attachPaymentIntent, reserveOrderInventory: vi.fn(async () => undefined) } as unknown as DbAdapter;
  return { db, order, confirmOrderPayment, updateOrderStatus, applyOrderRefund, attachPaymentIntent };
}
const approved: MercadoPagoOrder = { id: 'ORD1', external_reference: 'local-1', status: 'processed', status_detail: 'accredited', transactions: { payments: [{ id: 'PAY1', amount: '55.00', paid_amount: '55.00', status: 'processed' }] } };

describe('Point reconciliation', () => {
  it('confirms exactly once across polling and webhook replay', async () => {
    const f = fixture();
    expect((await reconcilePointOrder(f.db, approved)).changed).toBe(true);
    expect((await reconcilePointOrder(f.db, approved)).changed).toBe(false);
    expect(f.confirmOrderPayment).toHaveBeenCalledOnce();
  });
  it.each(['NaN', '54.00', undefined])('rejects an invalid paid amount %s', async (amount) => {
    const f = fixture();
    await expect(reconcilePointOrder(f.db, { ...approved, transactions: { payments: [{ paid_amount: amount }] } })).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH' });
    expect(f.confirmOrderPayment).not.toHaveBeenCalled();
  });
  it('reconciles an optional tip separately from the sale amount', async () => {
    const f = fixture();
    await reconcilePointOrder(f.db, { ...approved, currency: 'MXN', transactions: { payments: [{ paid_amount: '60.00', tip_amount: '5.00' }] } });
    expect(f.confirmOrderPayment).toHaveBeenCalledOnce();
  });
  it('requires the stored intent and external reference to both match', async () => {
    const f = fixture();
    await expect(reconcilePointOrder(f.db, { ...approved, id: 'OTHER' })).rejects.toMatchObject({ code: 'PAYMENT_REFERENCE_MISMATCH' });
  });
  it.each(['APPROVED', 'REFUNDED'])('does not downgrade a %s payment on a late failure', async (paymentStatus) => {
    const f = fixture({ paymentStatus });
    expect((await reconcilePointOrder(f.db, { ...approved, status: 'failed' })).changed).toBe(false);
    expect(f.updateOrderStatus).not.toHaveBeenCalled();
  });
  it('does not resurrect a refunded order on an approval replay', async () => {
    const f = fixture({ paymentStatus: 'REFUNDED', status: 'REFUNDED' });
    await reconcilePointOrder(f.db, approved);
    expect(f.confirmOrderPayment).not.toHaveBeenCalled();
  });
  it('reuses the stored reference, amount and operation key after a timeout', async () => {
    const f = fixture({ paymentIntentId: undefined });
    const service = { createPointOrder: vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(approved) } as unknown as MercadoPagoService;
    await expect(sendOrderToPoint(f.db, service, f.order)).rejects.toThrow('timeout');
    await sendOrderToPoint(f.db, service, f.order);
    expect(service.createPointOrder).toHaveBeenNthCalledWith(1, { orderId: 'local-1', total: 55, idempotencyKey: 'operation-1' });
    expect(service.createPointOrder).toHaveBeenNthCalledWith(2, { orderId: 'local-1', total: 55, idempotencyKey: 'operation-1' });
    expect(f.attachPaymentIntent).toHaveBeenCalledWith('local-1', 'ORD1');
    await sendOrderToPoint(f.db, service, f.order);
    expect(service.createPointOrder).toHaveBeenCalledTimes(2);
  });
});
