import express from 'express';
import request from 'supertest';
import Stripe from 'stripe';
import { createHash, randomUUID } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonDbAdapter, type DbOrder } from '../src/db';
import type { AppEnv } from '../src/config/env';
import { orderItemInputSchema } from '../src/domain/orders';
import { priceOrder } from '../src/domain/pricing';
import { calculateRecipeConsumption } from '../src/domain/inventory';
import type { PricedOrderItem } from '../src/domain/pricing';
import { StripePickupService, reconcileStripeSession } from '../src/payments/stripePickup';
import { cancelPickupOrder, registerPickupRoutes } from '../src/routes/pickup';
import { errorHandler } from '../src/utils/errors';

const env: AppEnv = {
  NODE_ENV: 'test', PORT: 3100, API_RATE_LIMIT_MAX: 180, ALLOWED_ORIGINS: 'http://localhost:5173', TRUST_PROXY: 0,
  JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), AUTH_BOOTSTRAP_ADMIN_EMAIL: 'admin@rofe.local', AUTH_BOOTSTRAP_BARISTA_EMAIL: 'barista@rofe.local', LOG_LEVEL: 'info', ENABLE_PAYMENT_SIMULATION: false,
  STRIPE_SECRET_KEY: 'sk_test_rofe_fixture_only', STRIPE_WEBHOOK_SECRET: 'whsec_rofe_fixture_only', PUBLIC_ORDERING_URL: 'https://rofe.example',
};
let directory: string;
let database: JsonDbAdapter;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'rofe-stripe-')); database = new JsonDbAdapter(join(directory, 'db.json')); await database.initialize(); });
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }); });

async function orderFixture(): Promise<DbOrder> {
  const pricing = priceOrder(await database.getProducts(), [orderItemInputSchema.parse({ productId: 'latte', quantity: 1 })]);
  const id = randomUUID();
  const order: DbOrder = { id, operationId: id, folio: 'Q-STRIPETEST', ...pricing, customerName: 'Cliente QR', channel: 'QR_PICKUP', paymentProvider: 'STRIPE', paymentMethod: 'card', status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', createdAt: new Date().toISOString(), pickup: { accessTokenHash: createHash('sha256').update('a'.repeat(64)).digest('hex'), requestHash: 'fixture', standId: 'entrada', locationName: 'ROFÉ', locationAddress: 'Barra principal', expiresAt: new Date(Date.now() + 35 * 60_000).toISOString() } };
  await database.createOrder(order);
  return order;
}
function sessionFor(order: DbOrder, overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return { id: 'cs_test_fixture', object: 'checkout.session', client_reference_id: order.id, metadata: { rofe_order_id: order.id, channel: 'QR_PICKUP' }, amount_total: Math.round(order.total * 100), currency: 'mxn', mode: 'payment', status: 'open', payment_status: 'unpaid', payment_intent: 'pi_fixture', url: 'https://checkout.stripe.com/c/pay/fixture', ...overrides } as Stripe.Checkout.Session;
}

describe('Stripe pickup payment boundary', () => {
  it('only consumes inventory and records revenue once after confirmed payment', async () => {
    const order = await orderFixture();
    const before = await database.getRawInventory();
    await reconcileStripeSession(database, sessionFor(order));
    expect((await database.getOrderById(order.id))!.paymentStatus).toBe('PENDING');
    const paid = sessionFor(order, { status: 'complete', payment_status: 'paid' });
    await Promise.all([reconcileStripeSession(database, paid), reconcileStripeSession(database, paid)]);
    expect((await database.getOrderById(order.id))!.status).toBe('PAID');
    expect((await database.getTransactionLedger()).filter((entry) => entry.type === 'card_payment')).toHaveLength(1);
    const movements = (await database.getInventoryMovements()).filter((entry) => entry.orderId === order.id);
    expect(movements.length).toBeGreaterThan(0);
    for (const movement of movements) expect((await database.getRawInventory()).find((item) => item.id === movement.ingredientId)!.stock).toBe(before.find((item) => item.id === movement.ingredientId)!.stock + movement.quantity);
  });
  it.each([{ amount_total: 1 }, { currency: 'usd' }, { metadata: { rofe_order_id: 'another-order' } }])('rejects mismatched provider confirmation %j', async (override) => {
    const order = await orderFixture();
    await expect(reconcileStripeSession(database, sessionFor(order, { status: 'complete', payment_status: 'paid', ...override }))).rejects.toMatchObject({ status: 409 });
    expect((await database.getOrderById(order.id))!.paymentStatus).toBe('PENDING');
  });
  it('uses the same Stripe idempotency key, currency, amount and safe return URL on retry', async () => {
    const order = await orderFixture();
    const service = new StripePickupService(env);
    const create = vi.spyOn(service.client!.checkout.sessions, 'create').mockResolvedValue(sessionFor(order) as Stripe.Response<Stripe.Checkout.Session>);
    await service.createSession(order, 'a'.repeat(64)); await service.createSession(order, 'a'.repeat(64));
    const [payload, options] = create.mock.calls[0];
    expect(options).toEqual({ idempotencyKey: `pickup-${order.id}` });
    expect(payload!.allowed_payment_method_types).toEqual(['card']);
    expect(payload!.line_items![0].price_data!.unit_amount).toBe(5500);
    expect(new URL(payload!.success_url!).hash).toContain('clave=');
    expect(new URL(payload!.success_url!).search).not.toContain('clave');
    expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
  });
  it('verifies raw webhook signatures and rejects tampering and stale deliveries', () => {
    const service = new StripePickupService(env);
    const body = JSON.stringify({ id: 'evt_fixture', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_fixture' } } });
    const signature = service.client!.webhooks.generateTestHeaderString({ payload: body, secret: env.STRIPE_WEBHOOK_SECRET! });
    expect(service.verifyEvent(Buffer.from(body), signature).id).toBe('evt_fixture');
    expect(() => service.verifyEvent(Buffer.from(`${body} `), signature)).toThrow('Notificación no válida');
    const old = service.client!.webhooks.generateTestHeaderString({ payload: body, secret: env.STRIPE_WEBHOOK_SECRET!, timestamp: Math.floor(Date.now() / 1000) - 600 });
    expect(() => service.verifyEvent(Buffer.from(body), old)).toThrow();
  });
  it('does not resurrect an expired or refunded order after late payment events', async () => {
    const order = await orderFixture();
    await reconcileStripeSession(database, sessionFor(order, { status: 'expired' }));
    await reconcileStripeSession(database, sessionFor(order, { status: 'complete', payment_status: 'paid' }));
    expect((await database.getOrderById(order.id))!.status).toBe('CANCELLED');
    expect(await database.getTransactionLedger()).toHaveLength(0);
  });
  it('releases the reservation when Stripe confirms expiry', async () => {
    const order = await orderFixture();
    await database.reserveOrderInventory(order.id, calculateRecipeConsumption(order.items as PricedOrderItem[]));
    expect((await database.getRawInventory()).find((item) => item.id === 'coffee_beans')!.reservedStock).toBeGreaterThan(0);
    await reconcileStripeSession(database, sessionFor(order, { status: 'expired' }));
    expect((await database.getRawInventory()).find((item) => item.id === 'coffee_beans')!.reservedStock).toBe(0);
    expect((await database.getOrderById(order.id))!.status).toBe('CANCELLED');
  });
  it('keeps a sale paid when payment completes during a cancellation request', async () => {
    const order = await orderFixture();
    await database.reserveOrderInventory(order.id, calculateRecipeConsumption(order.items as PricedOrderItem[]));
    await database.attachPaymentIntent(order.id, 'cs_test_fixture');
    const service = new StripePickupService(env);
    let session = sessionFor(order);
    vi.spyOn(service, 'retrieveSession').mockImplementation(async () => session);
    vi.spyOn(service, 'expireSession').mockImplementation(async () => { session = sessionFor(order, { status: 'complete', payment_status: 'paid' }); throw new Error('already completed'); });
    const result = await cancelPickupOrder(service, (await database.getOrderById(order.id))!, database);
    expect(result.status).toBe('PAID'); expect(result.paymentStatus).toBe('APPROVED');
  });
});

describe('public pickup routes against isolated storage and a mocked Stripe transport', () => {
  it('prices server-side, protects the receipt, replays checkout, and fulfills signed webhooks exactly once', async () => {
    const service = new StripePickupService(env);
    let provider: Stripe.Checkout.Session;
    vi.spyOn(service, 'createSession').mockImplementation(async (order) => { provider = sessionFor(order); return provider; });
    vi.spyOn(service, 'retrieveSession').mockImplementation(async () => provider);
    const app = express();
    const raw = express.raw({ type: 'application/json' }); const json = express.json();
    app.use((req, res, next) => req.path === '/api/webhooks/stripe' ? raw(req, res, next) : json(req, res, next));
    registerPickupRoutes(app, { env, requireAuth: (_req, res) => { res.sendStatus(401); }, audit: async () => undefined, broadcast: vi.fn() }, service, database);
    app.use(errorHandler);
    const operationId = randomUUID(); const token = 'a'.repeat(64);
    const body = { operationId, accessToken: token, customerName: 'Ana', standId: 'entrada', total: 0.01, items: [{ productId: 'latte', quantity: 1 }] };
    const created = await request(app).post('/api/pickup/checkout').send(body);
    expect(created.status).toBe(200); expect(created.body.order.total).toBe(55); expect(created.body.order.pickup.accessTokenHash).toBeUndefined(); expect(created.body.order.items[0].product).toBeUndefined();
    expect((await request(app).get(`/api/pickup/orders/${operationId}`)).status).toBe(404);
    expect((await request(app).get(`/api/pickup/orders/${operationId}`).set('X-Pickup-Token', 'b'.repeat(64))).status).toBe(404);
    expect((await request(app).post('/api/pickup/checkout').send(body)).status).toBe(200);
    expect(service.createSession).toHaveBeenCalledOnce();
    expect((await request(app).post(`/api/pickup/orders/${operationId}/resume`).set('X-Pickup-Token', token)).status).toBe(200);
    expect(service.createSession).toHaveBeenCalledOnce();
    expect((await request(app).post('/api/pickup/checkout').send({ ...body, items: [{ productId: 'latte', quantity: 2 }] })).status).toBe(409);
    const unsigned = await request(app).post('/api/webhooks/stripe').send({ type: 'checkout.session.completed' });
    expect(unsigned.status).toBe(400);
    provider! = { ...provider!, status: 'complete', payment_status: 'paid' };
    const event = JSON.stringify({ id: 'evt_fixture', object: 'event', type: 'checkout.session.completed', data: { object: { id: provider!.id } } });
    const signature = service.client!.webhooks.generateTestHeaderString({ payload: event, secret: env.STRIPE_WEBHOOK_SECRET! });
    for (let index = 0; index < 2; index++) expect((await request(app).post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('stripe-signature', signature).send(event)).status).toBe(200);
    const receipt = await request(app).get(`/api/pickup/orders/${operationId}`).set('X-Pickup-Token', token);
    expect(receipt.body.status).toBe('PAID'); expect((await database.getTransactionLedger()).filter((entry) => entry.type === 'card_payment')).toHaveLength(1);
    expect((await database.getOrders()).filter((entry) => entry.operationId === operationId)).toHaveLength(1);
  });
});
