import { expect, test, type APIRequestContext } from '@playwright/test';

/*
 * Financial / transactional / security audit of change vouchers against the real backend
 * (isolated JSON database of the E2E run — never production data).
 */
const API = 'http://127.0.0.1:3100';
type Headers = Record<string, string>;

async function login(request: APIRequestContext, email: string, password: string): Promise<Headers> {
  const response = await request.post(`${API}/api/auth/login`, { data: { email, password } });
  expect(response.status()).toBe(200);
  return { Authorization: `Bearer ${(await response.json()).accessToken as string}` };
}
async function device(request: APIRequestContext, name: string): Promise<Headers> {
  const enrolled = await (await request.post(`${API}/api/auth/device/register`, { data: { name, enrollmentSecret: 'e2e-device-enrollment-secret' } })).json() as { deviceId: string; deviceToken: string };
  const session = await request.post(`${API}/api/auth/device/login`, { data: enrolled });
  return { Authorization: `Bearer ${(await session.json()).accessToken as string}` };
}
async function freshDrawer(request: APIRequestContext, admin: Headers, denominations: Record<string, number>) {
  const current = (await (await request.get(`${API}/api/admin/cash/session`, { headers: admin })).json()) as { current?: unknown };
  if (current.current) {
    const drawer = await (await request.get(`${API}/api/cash/denominations`, { headers: admin })).json() as Record<string, number>;
    expect((await request.post(`${API}/api/admin/cash/session/close`, { headers: admin, data: { denominations: drawer } })).status()).toBe(200);
  }
  expect((await request.post(`${API}/api/admin/cash/session/open`, { headers: admin, data: { denominations } })).status()).toBe(201);
}
async function order(request: APIRequestContext, headers: Headers, productId: string, extra: Record<string, unknown> = {}) {
  return request.post(`${API}/api/orders`, { headers, data: { operationId: crypto.randomUUID(), customerName: 'Auditoría', paymentMethod: 'cash', items: [{ productId, quantity: 1 }], ...extra } });
}
const pay = (request: APIRequestContext, headers: Headers, id: string, data: Record<string, unknown>) => request.post(`${API}/api/orders/${id}/cash-payment`, { headers, data });
async function finish(request: APIRequestContext, admin: Headers, ids: string[]) {
  for (const id of ids) for (const status of ['IN_PREPARATION', 'READY', 'COMPLETED']) await request.post(`${API}/api/orders/${id}/status`, { headers: admin, data: { status } });
}
async function closeDrawer(request: APIRequestContext, admin: Headers) {
  const drawer = await (await request.get(`${API}/api/cash/denominations`, { headers: admin })).json() as Record<string, number>;
  return request.post(`${API}/api/admin/cash/session/close`, { headers: admin, data: { denominations: drawer } });
}

test('reconciliation, necessity, concurrency, refunds and payouts keep every peso accounted for', async ({ request }) => {
  const admin = await login(request, 'admin@rofe.test', 'TestAdmin123!');
  const barista = await login(request, 'barista@rofe.test', '12345678');
  const pos = await device(request, 'Auditoría POS');
  await freshDrawer(request, admin, { bill_20: 1, coin_10: 1 });
  const sale = (await (await order(request, pos, 'americano')).json()).order as { id: string };

  // 1. The backend reconciles on its own: received = due + cash change + voucher.
  const base = { receivedDenominations: { bill_100: 1 }, receivedAmount: 100 };
  expect((await pay(request, barista, sale.id, { ...base, receivedAmount: 90, changeDenominations: {}, changeAmount: 0, voucherAmount: 0 })).status()).toBe(400);
  expect((await pay(request, barista, sale.id, { ...base, changeDenominations: { bill_20: 1, coin_10: 1 }, changeAmount: 30, voucherAmount: 30 })).status()).toBe(400);
  expect((await pay(request, barista, sale.id, { ...base, changeDenominations: { bill_20: 1, coin_10: 1 }, changeAmount: 30, voucherAmount: 25.001 })).status()).toBe(400);
  expect((await pay(request, barista, sale.id, { ...base, changeDenominations: { bill_20: 1, coin_10: 1 }, changeAmount: 30, voucherAmount: -25 })).status()).toBe(400);
  // 2. A voucher only for change that truly cannot be given ($30 can be given here).
  const notNeeded = await pay(request, barista, sale.id, { ...base, changeDenominations: { bill_20: 1 }, changeAmount: 20, voucherAmount: 35 });
  expect(notNeeded.status()).toBe(409);
  expect((await notNeeded.json()).error.code).toBe('VOUCHER_NOT_NEEDED');
  // 3. Change that is not in the drawer: rejected, nothing stored.
  const missing = await pay(request, barista, sale.id, { ...base, changeDenominations: { bill_50: 1, coin_5: 1 }, changeAmount: 55, voucherAmount: 0 });
  expect(missing.status()).toBe(409);
  expect((await (await request.get(`${API}/api/orders/${sale.id}`, { headers: barista })).json()).paymentStatus).toBe('NOT_REQUIRED');
  expect((await (await request.get(`${API}/api/admin/vouchers`, { headers: admin })).json()).vouchers.filter((voucher: { orderId: string }) => voucher.orderId === sale.id)).toHaveLength(0);
  // 4. Correct: $30 in cash + $25 voucher. A retry returns the same voucher, never a second one.
  const body = { ...base, changeDenominations: { bill_20: 1, coin_10: 1 }, changeAmount: 30, voucherAmount: 25 };
  const [first, retry] = [await pay(request, barista, sale.id, body), await pay(request, barista, sale.id, body)];
  expect(first.status()).toBe(200);
  const code = (await first.json()).voucher.code as string;
  expect((await retry.json())).toMatchObject({ idempotentReplay: true, voucher: { code, balance: 25 } });
  expect((await (await request.get(`${API}/api/admin/vouchers`, { headers: admin })).json()).vouchers.filter((voucher: { orderId: string }) => voucher.orderId === sale.id)).toHaveLength(1);

  // 5. Ten terminals try to spend the same $25 at the same time: exactly one succeeds.
  const race = await Promise.all(Array.from({ length: 10 }, () => order(request, pos, 'americano', { voucherCode: code })));
  const winners = race.filter((response) => response.status() === 201);
  expect(winners).toHaveLength(1);
  expect(race.filter((response) => response.status() === 409)).toHaveLength(9);
  const spent = (await winners[0].json()).order as { id: string; total: number; voucherAmount: number; discount: number };
  // A liability settlement, not a discount: revenue stays $45, $20 still due.
  expect(spent).toMatchObject({ total: 45, voucherAmount: 25, discount: 0 });
  const lookup = async () => (await (await request.get(`${API}/api/vouchers/${code}`, { headers: barista })).json()).voucher as { balance: number; status: string };
  expect(await lookup()).toMatchObject({ balance: 0, status: 'REDEEMED' });
  // The barista collects only what is due.
  expect((await pay(request, barista, spent.id, { receivedDenominations: { bill_20: 1, coin_10: 1, coin_5: 1 }, receivedAmount: 35, changeDenominations: {}, changeAmount: 0 })).status()).toBe(400);
  expect((await pay(request, barista, spent.id, { receivedDenominations: { bill_20: 1 }, receivedAmount: 20, changeDenominations: {}, changeAmount: 0 })).status()).toBe(200);

  // 6. Refund of that order: only the $20 collected goes back in cash; $25 returns to the voucher, once.
  const refund = (denominations: Record<string, number>, operationId = crypto.randomUUID()) => request.post(`${API}/api/orders/${spent.id}/refund`, { headers: admin, data: { operationId, reason: 'Auditoría de devolución', cashDenominations: denominations } });
  expect((await refund({ bill_20: 2, coin_5: 1 })).status()).toBe(400);
  expect((await refund({ bill_20: 1 })).status()).toBe(200);
  expect(await lookup()).toMatchObject({ balance: 25, status: 'ACTIVE' });
  expect((await refund({ bill_20: 1 })).status()).toBe(200);
  expect(await lookup()).toMatchObject({ balance: 25 });

  // 7. Six baristas try to pay it out in cash at the same time: paid once.
  const espresso = (await (await order(request, pos, 'espresso')).json()).order as { id: string };
  expect((await pay(request, barista, espresso.id, { receivedDenominations: { bill_20: 1, coin_10: 1, coin_5: 1, coin_2: 1, coin_1: 1 }, receivedAmount: 38, changeDenominations: {}, changeAmount: 0 })).status()).toBe(200);
  const payouts = await Promise.all(Array.from({ length: 6 }, () => request.post(`${API}/api/vouchers/${code}/redeem-cash`, { headers: barista, data: { operationId: crypto.randomUUID(), denominations: { bill_20: 1, coin_5: 1 } } })));
  expect(payouts.filter((response) => response.status() === 200)).toHaveLength(1);
  expect(await lookup()).toMatchObject({ balance: 0, status: 'REDEEMED' });
  // Wrong payout amount and an exhausted voucher are refused.
  expect((await request.post(`${API}/api/vouchers/${code}/redeem-cash`, { headers: barista, data: { operationId: crypto.randomUUID(), denominations: { bill_20: 1 } } })).status()).toBe(409);

  // 8. Cash closing: physical cash and voucher movements apart, difference 0.
  const session = (await (await request.get(`${API}/api/admin/cash/session`, { headers: admin })).json()).current as { expectedCash: number; vouchers: Record<string, number> };
  // 30 opening + 100 − 30 (sale 1) + 20 (sale 2) − 20 (refund) + 38 (espresso) − 25 (payout) = 113
  expect(session.expectedCash).toBe(113);
  expect(session.vouchers).toMatchObject({ issued: 25, paidOutInCash: 25, outstanding: expect.any(Number) });
  const closed = await closeDrawer(request, admin);
  expect(await closed.json()).toMatchObject({ expectedCash: 113, countedCash: 113, difference: 0, vouchers: { issued: 25, paidOutInCash: 25 } });
  await finish(request, admin, [sale.id, espresso.id]);
});

test('permissions: terminals, baristas and administrators only reach their operations', async ({ request }) => {
  const admin = await login(request, 'admin@rofe.test', 'TestAdmin123!');
  const barista = await login(request, 'barista@rofe.test', '12345678');
  const pos = await device(request, 'Auditoría permisos');
  await freshDrawer(request, admin, {});
  const sale = (await (await order(request, pos, 'espresso')).json()).order as { id: string };
  // $50 for $38 with an empty drawer: the whole $12 change becomes a voucher.
  const code = (await (await pay(request, barista, sale.id, { receivedDenominations: { bill_50: 1 }, receivedAmount: 50, changeDenominations: {}, changeAmount: 0, voucherAmount: 12 })).json()).voucher.code as string;
  const other = (await (await order(request, pos, 'latte')).json()).order as { id: string };

  expect((await request.get(`${API}/api/vouchers/${code}`)).status()).toBe(401);
  expect((await request.get(`${API}/api/admin/vouchers`)).status()).toBe(401);
  // Terminal: may read a voucher to apply it, nothing else.
  expect((await request.get(`${API}/api/vouchers/${code}`, { headers: pos })).status()).toBe(200);
  expect((await pay(request, pos, other.id, { receivedDenominations: { bill_100: 1 }, receivedAmount: 100, changeDenominations: {}, changeAmount: 0, voucherAmount: 45 })).status()).toBe(403);
  expect((await request.post(`${API}/api/vouchers/${code}/redeem-cash`, { headers: pos, data: { operationId: crypto.randomUUID(), denominations: { coin_10: 1, coin_2: 1 } } })).status()).toBe(403);
  expect((await request.post(`${API}/api/orders/${other.id}/cancel-insufficient-change`, { headers: pos })).status()).toBe(403);
  expect((await request.get(`${API}/api/admin/vouchers`, { headers: pos })).status()).toBe(403);
  expect((await request.post(`${API}/api/admin/vouchers/${code}/cancel`, { headers: pos, data: { reason: 'Prueba de permisos' } })).status()).toBe(403);
  // Barista: collects and pays out, but no administrative history or cancellation.
  expect((await request.get(`${API}/api/admin/vouchers`, { headers: barista })).status()).toBe(403);
  expect((await request.post(`${API}/api/admin/vouchers/${code}/cancel`, { headers: barista, data: { reason: 'Prueba de permisos' } })).status()).toBe(403);
  expect((await request.post(`${API}/api/orders`, { headers: barista, data: { operationId: crypto.randomUUID(), paymentMethod: 'cash', items: [{ productId: 'latte', quantity: 1 }], voucherCode: code } })).status()).toBe(403);
  // Offline outbox never takes vouchers.
  const operationId = crypto.randomUUID();
  const sync = await request.post(`${API}/api/orders/sync`, { headers: pos, data: { operations: [{ operationId, type: 'CREATE_CASH_ORDER', payload: { operationId, paymentMethod: 'cash', items: [{ productId: 'latte', quantity: 1 }], voucherCode: code } }] } });
  expect(sync.status()).toBe(400);
  expect((await sync.json()).error.code).toBe('OFFLINE_VOUCHER_NOT_ALLOWED');
  await request.post(`${API}/api/orders/${other.id}/cancel-insufficient-change`, { headers: barista });
  await finish(request, admin, [sale.id]);
  await closeDrawer(request, admin);
});

test('administrative history and cancellation: reasons required, reserved vouchers protected, cancelled vouchers dead', async ({ request }) => {
  const admin = await login(request, 'admin@rofe.test', 'TestAdmin123!');
  const barista = await login(request, 'barista@rofe.test', '12345678');
  const pos = await device(request, 'Auditoría historial');
  await freshDrawer(request, admin, {});
  const sale = (await (await order(request, pos, 'espresso')).json()).order as { id: string };
  const code = (await (await pay(request, barista, sale.id, { receivedDenominations: { bill_50: 1 }, receivedAmount: 50, changeDenominations: {}, changeAmount: 0, voucherAmount: 12 })).json()).voucher.code as string;

  // A card order reserves the $12; while it is pending the voucher cannot be cancelled.
  const card = (await (await order(request, pos, 'latte', { paymentMethod: 'card', voucherCode: code })).json()).order as { id: string; voucherAmount: number };
  expect(card.voucherAmount).toBe(12);
  const reserved = await request.post(`${API}/api/admin/vouchers/${code}/cancel`, { headers: admin, data: { reason: 'Cliente reportó pérdida' } });
  expect(reserved.status()).toBe(409);
  expect((await reserved.json()).error.code).toBe('VOUCHER_RESERVED');
  const history = (await (await request.get(`${API}/api/admin/vouchers?status=REDEEMED`, { headers: admin })).json()) as { summary: { reservedInPendingOrders: number } };
  expect(history.summary.reservedInPendingOrders).toBeGreaterThanOrEqual(12);
  // The terminal cancels the card payment: the $12 comes back.
  expect((await request.post(`${API}/api/orders/${card.id}/cancel-payment`, { headers: pos })).status()).toBe(200);
  expect((await (await request.get(`${API}/api/vouchers/${code}`, { headers: barista })).json()).voucher).toMatchObject({ balance: 12, status: 'ACTIVE' });

  expect((await request.post(`${API}/api/admin/vouchers/${code}/cancel`, { headers: admin, data: { reason: 'no' } })).status()).toBe(400);
  expect((await request.post(`${API}/api/admin/vouchers/${code}/cancel`, { headers: admin, data: { reason: 'Cliente reportó pérdida' } })).status()).toBe(200);
  expect((await (await request.post(`${API}/api/admin/vouchers/${code}/cancel`, { headers: admin, data: { reason: 'Cliente reportó pérdida' } })).json()).idempotentReplay).toBe(true);
  expect((await order(request, pos, 'latte', { voucherCode: code })).status()).toBe(409);
  expect((await request.post(`${API}/api/vouchers/${code}/redeem-cash`, { headers: barista, data: { operationId: crypto.randomUUID(), denominations: { coin_10: 1, coin_2: 1 } } })).status()).toBe(409);

  const cancelled = (await (await request.get(`${API}/api/admin/vouchers?status=CANCELLED`, { headers: admin })).json()) as { vouchers: Array<{ code: string; cancelledReason: string; balance: number; redemptions: Array<{ kind: string; status: string }> }> };
  const entry = cancelled.vouchers.find((voucher) => voucher.code === code)!;
  expect(entry).toMatchObject({ cancelledReason: 'Cliente reportó pérdida', balance: 12 });
  expect(entry.redemptions).toEqual([expect.objectContaining({ kind: 'ORDER', status: 'RELEASED' })]);
  await finish(request, admin, [sale.id]);
  await closeDrawer(request, admin);
});
