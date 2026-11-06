import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { JsonDbAdapter, type DbOrder } from '../src/db';
import { buildOperationalReport } from '../src/accounting/reports';
let directory: string; let db: JsonDbAdapter; let sessionId: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'rofe-close-')); db = new JsonDbAdapter(join(directory, 'db.json')); await db.initialize(); sessionId = randomUUID(); await db.openCashSession({ id: sessionId, openingAmount: 100, openingDenominations: { bill_100: 1 }, openedBy: 'test', openedAt: new Date(Date.now()-60_000).toISOString() }); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
const order = (): DbOrder => ({ id: randomUUID(), customerName: 'Test', items: [], total: 50, paymentMethod: 'cash', status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', createdAt: '2026-01-01T00:00:00Z' });
test('receipt queued before close is included; late creation date does not move revenue to yesterday', async () => {
  const o=order(); await db.createOrder(o);
  const [paid, closed] = await Promise.all([db.confirmCashOrderPayment({ orderId:o.id,paymentId:'cash',consumption:[],receivedAmount:50,changeAmount:0,receivedDenominations:{bill_50:1},changeDenominations:{} }), db.closeCashSessionConsistently(sessionId,{bill_100:1,bill_50:1},'test')]);
  expect(paid).toBe(true); expect(closed.expectedCash).toBe(150); expect(closed.difference).toBe(0);
  expect((await db.getOrderById(o.id))?.paidCashSessionId).toBe(sessionId);
  expect((await db.getDailyClosures())[0].total_sales).toBe(50);
});
test('close wins: a later cash receipt fails without a movement', async () => {
  const o=order(); await db.createOrder(o); await db.closeCashSessionConsistently(sessionId,{bill_100:1},'test');
  await expect(db.confirmCashOrderPayment({ orderId:o.id,paymentId:'cash',consumption:[],receivedAmount:50,changeAmount:0,receivedDenominations:{bill_50:1},changeDenominations:{} })).rejects.toThrow(/Cash session required/);
  expect(await db.getTransactionLedger()).toHaveLength(0);
});
test('concurrent and delayed identical close retries preserve a newly opened shift', async () => {
  const close=()=>db.closeCashSessionConsistently(sessionId,{bill_100:1},'test');
  await Promise.all([close(),close()]); expect(await db.getDailyClosures()).toHaveLength(1);
  const next=randomUUID(); await db.openCashSession({id:next,openingAmount:100,openingDenominations:{bill_100:1},openedBy:'test',openedAt:new Date().toISOString()});
  await close(); expect((await db.getOpenCashSession())?.id).toBe(next);
  await expect(db.closeCashSessionConsistently(sessionId,{bill_50:2},'test')).rejects.toThrow('cash_close_conflict');
});
test('reports distinguish payment confirmation and a refund in the next period', () => {
  const o={...order(),status:'REFUNDED',paymentStatus:'REFUNDED',paidAt:'2026-11-05T10:00:00Z',refundedAt:'2026-11-06T10:00:00Z'};
  const report=(day:string)=>buildOperationalReport({orders:[o],transactions:[],movements:[],purchases:[],waste:[],start:Date.parse(`${day}T00:00:00Z`),end:Date.parse(`${day}T23:59:59Z`)});
  expect(report('2026-11-05')).toMatchObject({revenue:50,refunds:0,cashSales:50,tickets:1});
  expect(report('2026-11-06')).toMatchObject({revenue:-50,refunds:50,cashSales:-50,tickets:0});
});
