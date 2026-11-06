import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { JsonDbAdapter, type DbOrder } from '../src/db';
import { recoverPointReference, runPointReconciliation } from '../src/payments/pointReconciliation';
import { reconcilePointOrder } from '../src/payments/orderPayments';
import { isCronAuthorized } from '../src/routes/pointReconciliation';
import type { MercadoPagoOrder } from '../src/payments/mercadoPago';
let directory: string; let db: JsonDbAdapter;
const pending = (extra: Partial<DbOrder> = {}): DbOrder => ({ id: randomUUID(), customerName: 'Isolated test', items: [], total: 55, paymentMethod: 'card', paymentStatus: 'PENDING', status: 'PENDING_PAYMENT', paymentIntentId: 'ORD-TEST', createdAt: new Date(Date.now() - 60_000).toISOString(), ...extra });
const approved = (order: DbOrder): MercadoPagoOrder => ({ id: 'ORD-TEST', external_reference: order.id, status: 'processed', status_detail: 'accredited', transactions: { payments: [{ paid_amount: '55.00' }] } });
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'rofe-reconcile-')); db = new JsonDbAdapter(join(directory, 'db.json')); await db.initialize(); });
afterEach(async () => { vi.useRealTimers(); await rm(directory, { recursive: true, force: true }); });
test('concurrent workers and a webhook confirm one payment and one ledger posting', async () => {
  const order = pending(); await db.createOrder(order);
  const provider = { getOrder: vi.fn(async () => approved(order)) };
  await Promise.all([runPointReconciliation(db, provider), runPointReconciliation(db, provider), reconcilePointOrder(db, approved(order))]);
  expect(provider.getOrder.mock.calls.length).toBeLessThanOrEqual(1);
  expect((await db.getTransactionLedger()).filter(t => t.type === 'card_payment')).toHaveLength(1);
  expect((await db.getOrderById(order.id))?.paymentStatus).toBe('APPROVED');
});
test('a lost GET response preserves the pending order and retries only after backoff', async () => {
  const order = pending(); await db.createOrder(order);
  const provider = { getOrder: vi.fn().mockRejectedValueOnce(new Error('network private diagnostics')).mockResolvedValue(approved(order)) };
  await runPointReconciliation(db, provider); await runPointReconciliation(db, provider);
  expect(provider.getOrder).toHaveBeenCalledTimes(1);
  expect((await db.listPendingPoint())[0].job?.outcome).toBe('PROVIDER_ERROR');
  expect((await db.getOrderById(order.id))?.paymentStatus).toBe('PENDING');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + 120_000);
  await runPointReconciliation(db, provider);
  expect((await db.getOrderById(order.id))?.paymentStatus).toBe('APPROVED');
});
test('a crashed worker lease expires and an older worker cannot overwrite the new outcome', async () => {
  await db.createOrder(pending()); const [first] = await db.claimPointReconciliation(5);
  expect(await db.claimPointReconciliation(5)).toEqual([]);
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + 181_000);
  const [second] = await db.claimPointReconciliation(5);
  expect(second.attempts).toBe(2);
  expect(await db.finishPointReconciliation(first.orderId, first.leaseToken!, 'RESOLVED', 0)).toBe(false);
  expect(await db.finishPointReconciliation(second.orderId, second.leaseToken!, 'PENDING_PROVIDER', 60)).toBe(true);
});
test('missing references are exceptions, never new financial requests; verified webhook repairs them', async () => {
  const order = pending({ paymentIntentId: undefined }); await db.createOrder(order);
  const provider = { getOrder: vi.fn() }; await runPointReconciliation(db, provider);
  expect(provider.getOrder).not.toHaveBeenCalled(); expect((await db.listPendingPoint())[0].job?.outcome).toBe('MISSING_REFERENCE');
  await expect(recoverPointReference(db, { ...approved(order), transactions: { payments: [{ paid_amount: '99' }] } })).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH' });
  expect((await db.getOrderById(order.id))?.paymentIntentId).toBeUndefined();
  await recoverPointReference(db, approved(order)); await reconcilePointOrder(db, approved(order));
  expect((await db.getOrderById(order.id))?.paymentStatus).toBe('APPROVED');
});
test('GET returning another reference or amount cannot confirm the pending order', async () => {
  const order = pending(); await db.createOrder(order);
  await runPointReconciliation(db, { getOrder: async () => ({ ...approved(order), id: 'OTHER' }) });
  expect((await db.listPendingPoint())[0].job?.outcome).toBe('REFERENCE_MISMATCH');
  expect((await db.getOrderById(order.id))?.paymentStatus).toBe('PENDING');
});
test('Stripe, QR pickup, paid and recent orders are excluded', async () => {
  for (const extra of [{ paymentProvider: 'STRIPE' }, { channel: 'QR_PICKUP' }, { status: 'PAID', paymentStatus: 'APPROVED' }, { createdAt: new Date().toISOString() }] as Partial<DbOrder>[]) await db.createOrder(pending(extra));
  const provider = { getOrder: vi.fn() }; expect(await runPointReconciliation(db, provider)).toEqual({ claimed: 0, resolved: 0 }); expect(provider.getOrder).not.toHaveBeenCalled();
});
test('scheduler authentication fails closed and compares the complete bearer token', () => {
  expect(isCronAuthorized(undefined, 'secret')).toBe(false); expect(isCronAuthorized('Bearer secret', undefined)).toBe(false);
  expect(isCronAuthorized('Bearer secrex', 'secret')).toBe(false); expect(isCronAuthorized('Bearer secret', 'secret')).toBe(true);
});

test('a response for another valid local order must not reconcile that other order', async () => {
  const one = pending(); const two = pending({paymentIntentId:'ORD-TWO',createdAt:new Date().toISOString()});
  await db.createOrder(one); await db.createOrder(two);
  await runPointReconciliation(db, {getOrder:async()=>({...approved(two),id:'ORD-TWO'})});
  expect((await db.getOrderById(two.id))?.paymentStatus).toBe('PENDING');
  expect((await db.listPendingPoint()).find(row=>row.order.id===one.id)?.job?.outcome).toBe('REFERENCE_MISMATCH');
});
test('provider approval with blocked inventory remains visible and never triggers another charge', async () => {
  const order = pending({items:[{quantity:1,recipeSnapshot:{coffee_beans:999999}}]}); await db.createOrder(order);
  await runPointReconciliation(db,{getOrder:async()=>approved(order)});
  expect((await db.listPendingPoint())[0].job?.outcome).toBe('LOCAL_CONFIRMATION_ERROR');
  expect((await db.getOrderById(order.id))?.paymentStatus).toBe('PENDING');
  expect(await db.getInventoryMovements()).toHaveLength(0);
});
