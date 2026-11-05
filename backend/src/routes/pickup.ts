import express from 'express';
import rateLimit from 'express-rate-limit';
import { createHash, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { db, type DbAdapter, type DbOrder, type DbPickupSettings } from '../db';
import { orderItemInputSchema } from '../domain/orders';
import { priceOrder } from '../domain/pricing';
import { modifierAvailability, availableRecipeStock } from '../domain/modifiers';
import { calculateRecipeConsumption } from '../domain/inventory';
import type { PricedOrderItem } from '../domain/pricing';
import { requireRole } from '../middleware/auth';
import { AppError } from '../utils/errors';
import { reconcileStripeSession, StripePickupService } from '../payments/stripePickup';
import type { RouteContext } from './context';

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const checkoutSchema = z.object({
  operationId: z.string().uuid(), accessToken: tokenSchema,
  customerName: z.string().trim().min(2).max(80),
  standId: z.string().regex(/^[a-z0-9-]{1,40}$/).default('principal'),
  items: z.array(orderItemInputSchema).min(1).max(12),
  notes: z.string().trim().max(240).default(''),
});
const settingsSchema = z.object({ enabled: z.boolean(), locationName: z.string().trim().min(2).max(120), locationAddress: z.string().trim().max(240), instructions: z.string().trim().min(3).max(500) });
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

async function reservePickupStock(database: DbAdapter, order: DbOrder): Promise<void> {
  try { await database.reserveOrderInventory(order.id, calculateRecipeConsumption(order.items as PricedOrderItem[])); }
  catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
    if (/insufficient_available_inventory|No hay inventario disponible/.test(message)) {
      await database.updateOrderStatus(order.id, 'CANCELLED', undefined, 'REJECTED', 'Inventario insuficiente antes de iniciar el pago.');
      throw new AppError(409, 'PICKUP_OUT_OF_STOCK', 'Uno de tus productos se agotó. Vuelve al menú para ajustar tu pedido.');
    }
    throw error;
  }
}

export function publicPickupOrder(order: DbOrder) {
  return {
    id: order.id, folio: order.folio, customerName: order.customerName,
    status: order.status, paymentStatus: order.paymentStatus, total: order.total,
    createdAt: order.createdAt, notes: order.notes,
    items: order.items.map((item) => ({ productName: item.productName ?? item.product?.name, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice, customizable: item.product?.customizable, customization: item.customization, selectedCustomVariants: item.selectedCustomVariants, quantitySelections: item.quantitySelections, preparation: item.preparation, modifiers: item.modifiers })),
    pickup: { locationName: order.pickup!.locationName, locationAddress: order.pickup!.locationAddress, expiresAt: order.pickup!.expiresAt },
  };
}

async function ownedOrder(id: string, token: unknown, database: DbAdapter): Promise<DbOrder> {
  const parsed = tokenSchema.safeParse(token);
  const order = parsed.success ? await database.getOrderById(id) : undefined;
  if (!order?.pickup || order.channel !== 'QR_PICKUP' || !parsed.success || !timingSafeEqual(Buffer.from(order.pickup.accessTokenHash, 'hex'), Buffer.from(digest(parsed.data), 'hex'))) {
    throw new AppError(404, 'PICKUP_NOT_FOUND', 'No encontramos este pedido en este navegador. Abre el comprobante original o solicita ayuda en barra.');
  }
  return order;
}

export async function refreshPickupOrder(service: StripePickupService, order: DbOrder, database: DbAdapter = db): Promise<{ order: DbOrder; changed: boolean }> {
  const session = order.paymentIntentId ? await service.retrieveSession(order.paymentIntentId) : await service.recoverSession(order);
  return session ? reconcileStripeSession(database, session) : { order, changed: false };
}

export async function cancelPickupOrder(service: StripePickupService, order: DbOrder, database: DbAdapter = db): Promise<DbOrder> {
  let result = await refreshPickupOrder(service, order, database);
  if (result.order.paymentStatus !== 'PENDING') return result.order;
  if (result.order.paymentIntentId) {
    try { await service.expireSession(result.order.paymentIntentId); }
    catch { /* A payment can finish while the expiry request is in flight. Read its final state. */ }
    result = await refreshPickupOrder(service, result.order, database);
    if (result.order.paymentStatus === 'PENDING') throw new AppError(409, 'PICKUP_CANCELLATION_PENDING', 'Seguimos verificando el pago. Vuelve a consultar antes de iniciar otro pedido.');
  } else {
    // A late create cannot succeed once this immutable Stripe expiry is in the past.
    if (Date.now() < Date.parse(order.pickup!.expiresAt) + 60_000) throw new AppError(409, 'PICKUP_CANCELLATION_PENDING', 'Estamos verificando si Stripe abrió tu pago. Reintenta el mismo pedido para recuperarlo.');
    await database.updateOrderStatus(order.id, 'CANCELLED', undefined, 'REJECTED', 'Pedido sin sesión de pago después de su vencimiento.');
  }
  return (await database.getOrderById(order.id))!;
}

export function registerPickupRoutes(app: express.Express, context: RouteContext, stripe: StripePickupService, database: DbAdapter = db): void {
  const db = database;
  const { env, requireAuth, audit, broadcast } = context;
  const changed = (order: DbOrder) => { broadcast({ type: 'order_updated', orderId: order.id, order }); broadcast({ type: 'inventory_updated' }); broadcast({ type: 'cash_updated' }); };
  const settings = async (): Promise<DbPickupSettings> => await db.getPickupSettings() ?? {
    enabled: true, locationName: env.PICKUP_LOCATION_NAME ?? 'ROFÉ Espresso Bar', locationAddress: env.PICKUP_LOCATION_ADDRESS ?? '', instructions: 'Recoge en barra cuando tu pedido esté listo. Presenta tu nombre y folio.',
  };
  const checkoutLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'PICKUP_RATE_LIMIT', message: 'Has iniciado varios pedidos. Espera unos minutos o solicita ayuda en barra.' } }),
  });
  app.use('/api/pickup', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.get('/api/pickup/menu', async (_req, res, next) => {
    try {
      const [config, products, raw] = await Promise.all([settings(), db.getProducts(), db.getRawInventory()]);
      const ingredients = new Map(raw.map((item) => [item.id, item]));
      res.json({ ...config, acceptingOrders: config.enabled && stripe.available(), currency: 'MXN',
        products: products.map((product) => {
          const recipe = Object.entries(product.recipe ?? {}).filter(([, amount]) => amount > 0);
          const baseStock = recipe.length ? Math.max(0, Math.min(...recipe.map(([id, amount]) => { const item = ingredients.get(id); return item ? Math.floor((item.stock - (item.reservedStock ?? 0)) / amount) : 0; }))) : 0;
          const stock = baseStock || availableRecipeStock(product, raw);
          return { id: product.id, name: product.name, description: product.description, price: product.price, category: product.category, icon: product.icon, customizable: product.customizable, image: product.image, custom_variants: modifierAvailability(product, raw), stock };
        }),
      });
    } catch (error) { next(error); }
  });

  app.post('/api/pickup/quote', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res, next) => {
    try {
      const input = z.object({ items: z.array(orderItemInputSchema).min(1).max(20) }).parse(req.body);
      const pricing = priceOrder(await db.getProducts(), input.items, await db.getRawInventory());
      res.json({ total: pricing.total, items: pricing.items.map(item => ({ productId: item.productId, unitPrice: item.unitPrice, totalPrice: item.totalPrice, preparation: item.preparation, modifiers: item.modifiers })) });
    } catch (error) { next(error); }
  });

  app.post('/api/pickup/checkout', checkoutLimiter, async (req, res, next) => {
    try {
      const input = checkoutSchema.parse(req.body);
      if (input.items.reduce((sum, item) => sum + item.quantity, 0) > 20) throw new AppError(400, 'PICKUP_TOO_LARGE', 'Puedes pedir hasta 20 productos a la vez. Para pedidos mayores, solicita ayuda en barra.');
      const requestHash = digest(JSON.stringify({ customerName: input.customerName, standId: input.standId, items: input.items, notes: input.notes }));
      let order = await db.getOrderByOperationId(input.operationId);
      if (!order) {
        const config = await settings();
        if (!config.enabled || !stripe.available()) throw new AppError(503, 'PICKUP_UNAVAILABLE', 'Los pedidos en línea no están disponibles en este momento. Puedes pedir directamente en barra.');
        const pricing = priceOrder(await db.getProducts(), input.items, await db.getRawInventory());
        if (pricing.total <= 0 || pricing.total > 10_000) throw new AppError(400, 'PICKUP_INVALID_TOTAL', 'El pedido debe tener un importe mayor a cero y de hasta $10,000 MXN.');
        const candidate: DbOrder = {
          id: input.operationId, operationId: input.operationId, folio: `Q-${input.operationId.replace(/-/g, '').slice(0, 10).toUpperCase()}`,
          channel: 'QR_PICKUP', paymentProvider: 'STRIPE', paymentMethod: 'card', status: 'PENDING_PAYMENT', paymentStatus: 'PENDING',
          customerName: input.customerName, notes: input.notes, ...pricing, createdAt: new Date().toISOString(),
          pickup: { accessTokenHash: digest(input.accessToken), requestHash, standId: input.standId, locationName: config.locationName, locationAddress: config.locationAddress, expiresAt: new Date(Date.now() + 35 * 60_000).toISOString() },
        };
        const inserted = await db.createOrder(candidate);
        order = inserted ? candidate : (await db.getOrderByOperationId(input.operationId))!;
      }
      order = await ownedOrder(order.id, input.accessToken, db);
      if (order.pickup!.requestHash !== requestHash) throw new AppError(409, 'PICKUP_OPERATION_CONFLICT', 'Este intento corresponde a otro carrito. Recupera el pedido anterior antes de cambiarlo.');
      if (order.paymentStatus !== 'PENDING' || order.status !== 'PENDING_PAYMENT') { res.json({ order: publicPickupOrder(order), checkoutUrl: null }); return; }
      await reservePickupStock(db, order);
      const session = order.paymentIntentId ? await stripe.retrieveSession(order.paymentIntentId) : await stripe.createSession(order, input.accessToken);
      const result = await reconcileStripeSession(db, session);
      changed(result.order);
      res.json({ order: publicPickupOrder(result.order), checkoutUrl: session.status === 'open' ? session.url : null });
    } catch (error) { next(error); }
  });

  app.get('/api/pickup/orders/:id', async (req, res, next) => {
    try {
      let order = await ownedOrder(req.params.id, req.get('X-Pickup-Token'), db);
      if (order.paymentStatus === 'PENDING' && stripe.configured()) {
        const result = await refreshPickupOrder(stripe, order, db); order = result.order;
        if (result.changed) changed(order);
      }
      res.json(publicPickupOrder(order));
    } catch (error) { next(error); }
  });

  app.post('/api/pickup/orders/:id/cancel', async (req, res, next) => {
    try {
      const order = await cancelPickupOrder(stripe, await ownedOrder(req.params.id, req.get('X-Pickup-Token'), db), db);
      changed(order); res.json(publicPickupOrder(order));
    } catch (error) { next(error); }
  });

  app.post('/api/pickup/orders/:id/resume', checkoutLimiter, async (req, res, next) => {
    try {
      const token = tokenSchema.parse(req.get('X-Pickup-Token'));
      const order = await ownedOrder(req.params.id, token, db);
      if (order.paymentStatus !== 'PENDING' || order.status !== 'PENDING_PAYMENT') { res.json({ order: publicPickupOrder(order), checkoutUrl: null }); return; }
      await reservePickupStock(db, order);
      const session = order.paymentIntentId ? await stripe.retrieveSession(order.paymentIntentId) : await stripe.createSession(order, token);
      const result = await reconcileStripeSession(db, session);
      if (result.changed) changed(result.order);
      res.json({ order: publicPickupOrder(result.order), checkoutUrl: session.status === 'open' ? session.url : null });
    } catch (error) { next(error); }
  });

  app.post('/api/webhooks/stripe', async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new AppError(400, 'INVALID_STRIPE_BODY', 'Notificación no válida.');
      const event = stripe.verifyEvent(req.body, req.get('stripe-signature') ?? '');
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired'].includes(event.type)) {
        const sessionId = (event.data.object as { id: string }).id;
        const session = await stripe.retrieveSession(sessionId);
        if (session.metadata?.channel === 'QR_PICKUP') {
          const result = await reconcileStripeSession(db, session);
          if (result.changed) changed(result.order);
        }
      } else if (event.type === 'charge.refunded' || event.type === 'refund.updated') {
        const object = event.data.object as { metadata?: Record<string, string> };
        const order = object.metadata?.rofe_order_id ? await db.getOrderById(object.metadata.rofe_order_id) : undefined;
        if (order?.paymentProvider === 'STRIPE' && order.paymentStatus === 'APPROVED' && await stripe.fullyRefunded(order)) {
          await db.applyOrderRefund({ orderId: order.id, operationId: order.id, reason: 'Devolución completa confirmada por Stripe', userId: 'stripe' });
          changed((await db.getOrderById(order.id))!);
        }
      }
      res.json({ received: true });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/pickup', requireAuth, requireRole('ADMIN', 'MANAGER'), async (_req, res, next) => {
    try {
      const config = await settings();
      const origin = env.PUBLIC_ORDERING_URL ? new URL(env.PUBLIC_ORDERING_URL) : null;
      res.json({ ...config, configured: stripe.configured(), acceptingOrders: config.enabled && stripe.available(),
        secretKeyConfigured: Boolean(env.STRIPE_SECRET_KEY), webhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
        publicUrl: origin ? new URL('/pedir', origin).toString() : null,
        localPreview: !origin || origin.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname),
        mode: env.STRIPE_SECRET_KEY?.includes('_live_') ? 'live' : 'test',
      });
    }
    catch (error) { next(error); }
  });
  app.put('/api/admin/pickup', requireAuth, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
    try { const config = settingsSchema.parse(req.body); await db.savePickupSettings(config); await audit(req, { action: 'PICKUP_SETTINGS', entity: 'SETTINGS', after: config }); res.json(config); }
    catch (error) { next(error); }
  });
  app.post('/api/admin/pickup/check', requireAuth, requireRole('ADMIN', 'MANAGER'), async (_req, res, next) => {
    try {
      if (!stripe.client) throw new AppError(503, 'STRIPE_NOT_CONFIGURED', 'Configura STRIPE_SECRET_KEY en el servidor.');
      const account = await stripe.client.accounts.retrieve(null);
      res.json({ accountId: account.id, chargesEnabled: account.charges_enabled, country: account.country, verifiedAt: new Date().toISOString() });
    } catch (error) { next(error); }
  });
}
