import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { amountDue, JsonDbAdapter, type DbOrder } from '../src/db';
import { bestPossibleChange, isWholeCents } from '../src/domain/cash';
import { generateVoucherCode, normalizeVoucherCode } from '../src/domain/vouchers';
import { buildOperationalReport } from '../src/accounting/reports';

let directory: string;
let file: string;
let db: JsonDbAdapter;

const order = (id: string, total: number, extra: Partial<DbOrder> = {}): DbOrder => ({
  id, folio: id, operationId: crypto.randomUUID(), customerName: 'Test', items: [], total, status: 'PENDING_PAYMENT',
  paymentStatus: 'NOT_REQUIRED', paymentMethod: 'cash', createdAt: new Date().toISOString(), ...extra,
});

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'rofe-vouchers-'));
  file = join(directory, 'db.json');
  db = new JsonDbAdapter(file);
  await db.initialize();
  await db.openCashSession({ id: crypto.randomUUID(), openingAmount: 30, openingDenominations: { bill_20: 1, coin_10: 1 }, openedBy: 'test', openedAt: new Date().toISOString() });
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

async function issue(total = 45, received = { bill_100: 1 }, change = { bill_20: 1, coin_10: 1 }, voucher = 25) {
  const sale = order(crypto.randomUUID(), total);
  await db.createOrder(sale);
  const code = generateVoucherCode();
  const committed = await db.confirmCashOrderPayment({ orderId: sale.id, paymentId: `cash-${sale.id}`, consumption: [], receivedAmount: 100, changeAmount: 30, receivedDenominations: received, changeDenominations: change, voucher: { code, amount: voucher, userId: 'barista' } });
  return { sale, code, committed };
}

describe('change voucher domain', () => {
  it('generates unambiguous codes and normalizes what customers type or scan', () => {
    const code = generateVoucherCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$/);
    expect(normalizeVoucherCode(code.replaceAll('-', '').toLowerCase())).toBe(code);
    expect(normalizeVoucherCode(`ROFE-VALE:${code}`)).toBe(code);
    expect(normalizeVoucherCode('OIL0-0000-00')).toBe('0110-0000-00');
    expect(normalizeVoucherCode('short')).toBeNull();
    expect(new Set(Array.from({ length: 2000 }, generateVoucherCode)).size).toBe(2000);
  });
  it('computes the most change a drawer can give, server side', () => {
    expect(bestPossibleChange(65, { bill_20: 1, coin_10: 2 })).toBe(40);
    expect(bestPossibleChange(55, { bill_20: 1, coin_10: 1, bill_100: 1 })).toBe(30);
    expect(bestPossibleChange(0.7, { coin_0_50: 1, coin_0_20: 1 })).toBe(0.7);
    expect(bestPossibleChange(30, { coin_10: 2, coin_1: 3 })).toBe(23);
    expect(isWholeCents(12.34)).toBe(true);
    expect(isWholeCents(12.345)).toBe(false);
  });
});

describe('change vouchers in the ledger', () => {
  it('issues exactly one voucher with the payment, never a payment without it', async () => {
    const { sale, code, committed } = await issue();
    expect(committed).toBe(true);
    expect(await db.getChangeVoucherForOrder(sale.id)).toMatchObject({ code, amount: 25, balance: 25, status: 'ACTIVE' });
    // Replay of the same payment: no second voucher.
    const replay = await db.confirmCashOrderPayment({ orderId: sale.id, paymentId: `cash-${sale.id}`, consumption: [], receivedAmount: 100, changeAmount: 30, receivedDenominations: { bill_100: 1 }, changeDenominations: { bill_20: 1, coin_10: 1 }, voucher: { code: generateVoucherCode(), amount: 25, userId: 'barista' } });
    expect(replay).toBe(false);
    expect((await db.listChangeVouchers()).filter((voucher) => voucher.orderId === sale.id)).toHaveLength(1);
  });

  it('a failed payment (missing change denominations) stores neither the payment nor the voucher', async () => {
    const sale = order(crypto.randomUUID(), 45);
    await db.createOrder(sale);
    await expect(db.confirmCashOrderPayment({ orderId: sale.id, paymentId: `cash-${sale.id}`, consumption: [], receivedAmount: 100, changeAmount: 50, receivedDenominations: { bill_100: 1 }, changeDenominations: { bill_50: 1 }, voucher: { code: generateVoucherCode(), amount: 5, userId: 'barista' } })).rejects.toThrow(/Insufficient cash/);
    expect(await db.listChangeVouchers()).toHaveLength(0);
    expect((await db.getOrderById(sale.id))?.paymentStatus).toBe('NOT_REQUIRED');
    expect(await db.getCashRegister()).toEqual({ bill_20: 1, coin_10: 1 });
  });

  it('parallel uses of one voucher: exactly one order gets the balance', async () => {
    const { code } = await issue();
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => db.applyChangeVoucherToOrder({ code, orderId: `race-${index}`, operationId: crypto.randomUUID(), amount: 25 })));
    expect(results.filter((result) => result.status === 'fulfilled' && result.value)).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(9);
    expect((await db.getChangeVoucher(code))?.balance).toBe(0);
  });

  it('parallel cash payouts: paid once, drawer changed once', async () => {
    const { code } = await issue();
    await db.adjustCashRegister({ bill_20: 2, coin_5: 1, bill_100: 1 });
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => db.redeemChangeVoucherCash({ code, operationId: crypto.randomUUID(), amount: 25, denominations: { bill_20: 1, coin_5: 1 }, userId: 'barista' })));
    expect(results.filter((result) => result.status === 'fulfilled' && result.value === 25)).toHaveLength(1);
    expect(await db.getCashRegister()).toMatchObject({ bill_20: 1, coin_5: 0 });
    expect((await db.getTransactionLedger()).filter((entry) => entry.type === 'voucher_payout')).toHaveLength(1);
  });

  it('retries with the same operation never apply or pay twice', async () => {
    const { code } = await issue();
    const operationId = crypto.randomUUID();
    expect(await db.applyChangeVoucherToOrder({ code, orderId: 'o1', operationId, amount: 10 })).toBe(true);
    expect(await db.applyChangeVoucherToOrder({ code, orderId: 'o1', operationId, amount: 10 })).toBe(false);
    expect((await db.getChangeVoucher(code))?.balance).toBe(15);
    expect(await db.releaseChangeVoucherForOrder('o1')).toBe(10);
    expect(await db.releaseChangeVoucherForOrder('o1')).toBe(0);
    expect((await db.getChangeVoucher(code))?.balance).toBe(25);
    await db.adjustCashRegister({ bill_20: 2, coin_5: 1 });
    const payout = crypto.randomUUID();
    expect(await db.redeemChangeVoucherCash({ code, operationId: payout, amount: 25, denominations: { bill_20: 1, coin_5: 1 }, userId: 'b' })).toBe(25);
    expect(await db.redeemChangeVoucherCash({ code, operationId: payout, amount: 25, denominations: { bill_20: 1, coin_5: 1 }, userId: 'b' })).toBe(0);
    await expect(db.redeemChangeVoucherCash({ code, operationId: crypto.randomUUID(), amount: 25, denominations: { bill_20: 1, coin_5: 1 }, userId: 'b' })).rejects.toThrow('voucher_not_active');
  });

  it('payout requires the exact balance and the denominations really in the drawer', async () => {
    const { code } = await issue();
    await expect(db.redeemChangeVoucherCash({ code, operationId: crypto.randomUUID(), amount: 20, denominations: { bill_20: 1 }, userId: 'b' })).rejects.toThrow('voucher_amount_mismatch');
    await expect(db.redeemChangeVoucherCash({ code, operationId: crypto.randomUUID(), amount: 25, denominations: { bill_20: 1, coin_5: 1 }, userId: 'b' })).rejects.toThrow(/insufficient_cash_denomination/);
    expect((await db.getChangeVoucher(code))?.balance).toBe(25);
  });

  it('orphan reservations (order never stored) come back after 10 minutes, once', async () => {
    const { code } = await issue();
    await db.applyChangeVoucherToOrder({ code, orderId: 'never-stored', operationId: crypto.randomUUID(), amount: 25 });
    expect(await db.releaseOrphanVoucherRedemptions(code)).toBe(0); // too recent
    const data = JSON.parse(await readFile(file, 'utf8'));
    data.changeVoucherRedemptions[0].createdAt = new Date(Date.now() - 11 * 60_000).toISOString();
    await writeFile(file, JSON.stringify(data));
    expect(await db.releaseOrphanVoucherRedemptions(code)).toBe(25);
    expect(await db.releaseOrphanVoucherRedemptions(code)).toBe(0);
    expect(await db.getChangeVoucher(code)).toMatchObject({ balance: 25, status: 'ACTIVE' });
  });

  it('administrative cancellation needs a reason, refuses reserved vouchers and is never undone by a release', async () => {
    const { code } = await issue();
    const pending = order('pending-with-voucher', 30, { voucherAmount: 10, paymentMethod: 'card', paymentStatus: 'PENDING' });
    await db.createOrder(pending);
    await db.applyChangeVoucherToOrder({ code, orderId: pending.id, operationId: crypto.randomUUID(), amount: 10 });
    await expect(db.cancelChangeVoucher({ code, reason: 'Pérdida del cliente', userId: 'admin' })).rejects.toThrow('voucher_reserved_by_pending_order');
    await db.updateOrderStatus(pending.id, 'COMPLETED');
    await expect(db.cancelChangeVoucher({ code, reason: 'no', userId: 'admin' })).rejects.toThrow('voucher_cancel_reason_required');
    expect(await db.cancelChangeVoucher({ code, reason: 'Pérdida del cliente', userId: 'admin' })).toBe(true);
    expect(await db.cancelChangeVoucher({ code, reason: 'Pérdida del cliente', userId: 'admin' })).toBe(false);
    expect(await db.releaseChangeVoucherForOrder(pending.id)).toBe(10);
    expect((await db.getChangeVoucher(code))?.status).toBe('CANCELLED');
    await expect(db.applyChangeVoucherToOrder({ code, orderId: 'later', operationId: crypto.randomUUID(), amount: 1 })).rejects.toThrow('voucher_not_active');
  });
});

describe('accounting', () => {
  it('a voucher settles part of the total: revenue is the full price, not a discount', () => {
    const now = new Date().toISOString();
    const report = buildOperationalReport({
      orders: [
        { ...order('a', 45), status: 'PAID', paymentStatus: 'APPROVED', createdAt: now },
        { ...order('b', 45, { voucherAmount: 25, paymentMethod: 'card' }), status: 'PAID', paymentStatus: 'APPROVED', createdAt: now },
      ],
      transactions: [], movements: [], purchases: [], waste: [],
    });
    expect(report).toMatchObject({ grossSales: 90, discounts: 0 });
    expect(amountDue({ total: 45, voucherAmount: 25 })).toBe(20);
  });
});
