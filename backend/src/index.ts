import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { AuthPrincipal } from './auth/types';
import { randomUUID } from 'crypto';
import { db } from './db';
import type { DbOrder } from './db';
import { registerCatalogRoutes } from './routes/catalog';
import { registerPickupRoutes, refreshPickupOrder, cancelPickupOrder } from './routes/pickup';
import { StripePickupService } from './payments/stripePickup';
import { reconcilePointOrder, sendOrderToPoint } from './payments/orderPayments';
import { getEnv } from './config/env';
import { createSecurityStore } from './auth/store';
import { AuthService } from './auth/service';
import { DiscountAuthorizationService } from './auth/discountAuthorization';
import { authenticate, requireRole } from './middleware/auth';
import { requestContext } from './middleware/requestContext';
import { AppError, errorHandler, notFoundHandler } from './utils/errors';
import { createOrderSchema } from './domain/orders';
import { priceOrder, toMoney } from './domain/pricing';
import { applyAuthorizedDiscount } from './domain/discounts';
import type { PricedOrderItem } from './domain/pricing';
import { calculateRecipeConsumption } from './domain/inventory';
import { bestPossibleChange, isWholeCents, totalDenominations } from './domain/cash';
import { MercadoPagoService } from './payments/mercadoPago';
import { z } from 'zod';
import { buildOperationalReport, salesCsv } from './accounting/reports';
import { generateVoucherCode, normalizeVoucherCode, voucherQrPayload } from './domain/vouchers';
import { amountDue, type DbChangeVoucher } from './db';

const app = express();
const env = getEnv();
process.env.TZ = 'America/Mexico_City';
const PORT = env.PORT;
const securityStore = createSecurityStore(env);
const authService = new AuthService(env, securityStore);
const discountAuthorization = new DiscountAuthorizationService(env);
const mercadoPago = new MercadoPagoService(env);
const stripePickup = new StripePickupService(env);
const requireAuth = authenticate(authService);

const auditSensitive = (req: express.Request, input: { action: string; entity: string; entityId?: string; before?: unknown; after?: unknown }) =>
  securityStore.addAudit({
    userId: req.principal?.role === 'POS_DEVICE' ? undefined : req.principal?.subjectId,
    deviceId: req.principal?.deviceId,
    ...input,
    requestId: req.requestId,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');

// Serverless (Vercel) has no start() step: initialize once per instance before the first request.
let readyPromise: Promise<void> | undefined;
export function ensureReady(): Promise<void> {
  readyPromise ??= (async () => {
    await db.initialize();
    await authService.initialize();
  })().catch((error: unknown) => {
    readyPromise = undefined;
    throw error;
  });
  return readyPromise;
}
if (process.env.VERCEL) app.use((_req, _res, next) => { ensureReady().then(() => next(), next); });
app.use(requestContext);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = new Set(env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean));
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    // When credentials: true, Access-Control-Allow-Origin must NOT be '*'.
    // Reflect the origin back or fall back to the first allowed origin.
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, origin || env.ALLOWED_ORIGINS.split(',')[0].trim());
    }
    callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origen no autorizado.'));
  },
}));
const jsonBody = express.json({ limit: '1500kb' });
const stripeBody = express.raw({ type: 'application/json', limit: '256kb' });
app.use((req, res, next) => req.path === '/api/webhooks/stripe' ? stripeBody(req, res, next) : jsonBody(req, res, next));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => res.status(429).json({ code: 'AUTH_RATE_LIMITED', message: 'Demasiados intentos. Espera unos minutos.' }),
});
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: env.API_RATE_LIMIT_MAX, standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Hay demasiadas solicitudes. Espera un momento e intenta de nuevo.' }, requestId: req.requestId }) });
app.use('/api', apiLimiter);

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(6).max(128) });
const deviceRegistrationSchema = z.object({ name: z.string().trim().min(2).max(80), enrollmentSecret: z.string().min(16).max(256) });
const deviceLoginSchema = z.object({ deviceId: z.string().uuid(), deviceToken: z.string().min(32).max(256) });
const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().email().optional(),
  notes: z.string().trim().max(500).optional(),
});
const purchaseSchema = z.object({
  operationId: z.string().uuid(),
  supplierId: z.string().uuid().optional(),
  invoiceReference: z.string().trim().max(120).optional(),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'credit']),
  cashDenominations: z.record(z.string(), z.number().int().min(0)).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({ ingredientId: z.string().min(1).max(100), quantity: z.number().positive(), unitCost: z.number().min(0).max(1_000_000) })).min(1).max(100),
});
const wasteSchema = z.object({ operationId: z.string().uuid(), ingredientId: z.string().min(1).max(100), quantity: z.number().positive(), reason: z.string().trim().min(5).max(240) });
const productionSchema = z.object({
  operationId: z.string().uuid(), productId: z.string().min(1).max(100), quantityProduced: z.number().int().positive().max(10_000),
  wasteQuantity: z.number().int().min(0).max(10_000).default(0), expiresAt: z.string().datetime().optional(),
}).refine((value) => value.wasteQuantity < value.quantityProduced, { path: ['wasteQuantity'], message: 'La merma debe ser menor a la producción.' });
const userCreateSchema = z.object({ email: z.string().email(), password: z.string().min(10).max(128), role: z.enum(['ADMIN', 'MANAGER', 'BARISTA']) });
const userUpdateSchema = z.object({ password: z.string().min(10).max(128).optional(), role: z.enum(['ADMIN', 'MANAGER', 'BARISTA']).optional(), active: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0);
const discountAuthorizationSchema = z.object({
  operationId: z.string().uuid(),
  type: z.enum(['PERCENTAGE', 'FIXED', 'COURTESY']),
  value: z.number().min(0).max(1_000_000),
  reason: z.string().trim().min(5).max(240),
}).superRefine((value, context) => {
  if (value.type === 'PERCENTAGE' && (value.value <= 0 || value.value > 100)) context.addIssue({ code: 'custom', path: ['value'], message: 'El porcentaje debe estar entre 0 y 100.' });
  if (value.type === 'FIXED' && value.value <= 0) context.addIssue({ code: 'custom', path: ['value'], message: 'El importe debe ser mayor a cero.' });
});
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', async (_req, res, next) => {
  try {
    await db.getProducts();
    res.json({ status: 'ready' });
  } catch (error) {
    next(new AppError(503, 'NOT_READY', 'El servicio aún no está listo.', error));
  }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const input = credentialsSchema.parse(req.body);
    const session = await authService.login(input.email, input.password);
    res.cookie('rofe_refresh', session.refreshToken, refreshCookieOptions);
    await securityStore.addAudit({ userId: session.principal.subjectId, action: 'LOGIN', entity: 'SESSION', entityId: session.principal.sessionId, requestId: req.requestId, ip: req.ip, timestamp: new Date().toISOString() });
    res.json({ accessToken: session.accessToken, principal: session.principal });
  } catch (error) { next(error); }
});

app.post('/api/auth/device/register', authLimiter, async (req, res, next) => {
  try {
    const input = deviceRegistrationSchema.parse(req.body);
    const device = await authService.registerDevice(input.name, input.enrollmentSecret);
    await securityStore.addAudit({ deviceId: device.deviceId, action: 'DEVICE_REGISTER', entity: 'DEVICE', entityId: device.deviceId, requestId: req.requestId, ip: req.ip, timestamp: new Date().toISOString() });
    res.status(201).json(device);
  } catch (error) { next(error); }
});

app.post('/api/auth/device/login', authLimiter, async (req, res, next) => {
  try {
    const input = deviceLoginSchema.parse(req.body);
    const session = await authService.loginDevice(input.deviceId, input.deviceToken);
    res.cookie('rofe_refresh', session.refreshToken, refreshCookieOptions);
    res.json({ accessToken: session.accessToken, principal: session.principal });
  } catch (error) { next(error); }
});

app.post('/api/auth/refresh', async (req, res, next) => {
  try {
    const refreshToken = typeof req.cookies.rofe_refresh === 'string' ? req.cookies.rofe_refresh : '';
    const session = await authService.refresh(refreshToken);
    res.cookie('rofe_refresh', session.refreshToken, refreshCookieOptions);
    res.json({ accessToken: session.accessToken, principal: session.principal });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', requireAuth, async (req, res, next) => {
  try {
    await authService.logout(req.principal!.sessionId);
    await securityStore.addAudit({ userId: req.principal!.role === 'POS_DEVICE' ? undefined : req.principal!.subjectId, deviceId: req.principal!.deviceId, action: 'LOGOUT', entity: 'SESSION', entityId: req.principal!.sessionId, requestId: req.requestId, ip: req.ip, timestamp: new Date().toISOString() });
    res.clearCookie('rofe_refresh', { httpOnly: refreshCookieOptions.httpOnly, secure: refreshCookieOptions.secure, sameSite: refreshCookieOptions.sameSite, path: refreshCookieOptions.path });
    res.status(204).end();
  } catch (error) { next(error); }
});

// --- Server-Sent Events (SSE) Client List ---
let clients: Array<{ response: express.Response; principal: AuthPrincipal }> = [];

// Broadcast helper
const broadcast = (data: { type: string; [key: string]: unknown }) => {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach((client) => {
    try {
      const order = data.order as { deviceId?: string } | undefined;
      if (client.principal.role === 'POS_DEVICE' && order && order.deviceId !== client.principal.deviceId) return;
      client.response.write(message);
    } catch (error) {
      console.error('Unable to write to SSE client:', error);
    }
  });
};

// --- SSE Endpoint ---
registerPickupRoutes(app, { env, requireAuth, audit: auditSensitive, broadcast }, stripePickup);
app.get('/api/events', requireAuth, requireRole('ADMIN', 'MANAGER', 'BARISTA', 'POS_DEVICE'), (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    'Connection': 'keep-alive',
  });

  // Keep-alive heartbeat
  res.write('data: {"type":"connected"}\n\n');

  const principal = req.principal!;
  const client = { response: res, principal };
  clients.push(client);
  const token = req.header('authorization')?.slice(7) ?? '';
  const sessionCheck = setInterval(() => {
    void authService.verifyActiveAccessToken(token).catch(() => res.end());
  }, 30_000);
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n');
  }, 20_000);

  // Serverless instances do not share memory, so a broadcast from another instance never
  // reaches this stream. Poll the database and forward order changes as regular events.
  let poller: NodeJS.Timeout | undefined;
  if (env.REALTIME_POLL_MS > 0) {
    let fingerprints: Map<string, string> | undefined;
    let polling = false;
    poller = setInterval(() => {
      if (polling || res.writableEnded) return;
      polling = true;
      void (async () => {
        const orders = await db.getOrdersUpdatedSince(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        const next = new Map(orders.map((order) => [order.id, orderFingerprint(order)]));
        if (fingerprints) {
          let changed = false;
          for (const order of orders) {
            if (fingerprints.get(order.id) === next.get(order.id)) continue;
            changed = true;
            if (principal.role === 'POS_DEVICE' && order.deviceId !== principal.deviceId) continue;
            res.write(`data: ${JSON.stringify({ type: 'order_updated', orderId: order.id, order })}\n\n`);
          }
          if (changed) res.write('data: {"type":"inventory_updated"}\n\n');
        }
        fingerprints = next;
        await reconcilePendingPickupThrottled();
      })().catch(() => console.error(JSON.stringify({ level: 'error', event: 'realtime_poll_failed' }))).finally(() => { polling = false; });
    }, env.REALTIME_POLL_MS);
  }
  // Close before the platform kills the function; the client reconnects immediately.
  const lifetime = env.SSE_MAX_DURATION_MS > 0 ? setTimeout(() => res.end(), env.SSE_MAX_DURATION_MS) : undefined;
  console.log(`Cliente SSE conectado. Total conectados: ${clients.length}`);

  req.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(sessionCheck);
    if (poller) clearInterval(poller);
    if (lifetime) clearTimeout(lifetime);
    clients = clients.filter((candidate) => candidate !== client);
    console.log(`Cliente SSE desconectado. Total conectados: ${clients.length}`);
  });
});

function orderFingerprint(order: DbOrder): string {
  return JSON.stringify([order.status, order.paymentStatus, order.paymentId, order.updatedAt, order.cancellationReason]);
}

// --- QR pickup reconciliation (Stripe webhook is primary; this sweeps missed events) ---
let sweeping = false;
let lastSweepAt = 0;
async function reconcilePendingPickup(): Promise<void> {
  if (sweeping || !stripePickup.configured()) return;
  sweeping = true;
  lastSweepAt = Date.now();
  try {
    for (const order of await db.getPendingPickupOrders()) {
      try {
        const result = await refreshPickupOrder(stripePickup, order);
        if (result.changed) {
          broadcast({ type: 'order_updated', orderId: result.order.id, order: result.order });
          broadcast({ type: 'inventory_updated' });
        } else if (!result.order.paymentIntentId && Date.now() > Date.parse(order.pickup!.expiresAt) + 60_000) {
          await cancelPickupOrder(stripePickup, result.order);
          broadcast({ type: 'inventory_updated' });
        }
      } catch { console.error(JSON.stringify({ level: 'error', event: 'pickup_reconciliation_failed', orderId: order.id })); }
    }
  } catch { console.error(JSON.stringify({ level: 'error', event: 'pickup_sweep_failed' })); }
  finally { sweeping = false; }
}
const reconcilePendingPickupThrottled = () => Date.now() - lastSweepAt >= 60_000 ? reconcilePendingPickup() : Promise.resolve();

// --- API Routes ---

// Get active orders (Barista View)
app.get('/api/orders', requireAuth, requireRole('ADMIN', 'MANAGER', 'BARISTA'), async (_req, res) => {
  try {
    const orders = await db.getOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    res.status(500).json({ error: 'Error al obtener pedidos.' });
  }
});

// Create new order & trigger Mercado Pago Point or Cash flow
app.post('/api/orders', requireAuth, requireRole('POS_DEVICE'), async (req, res, next) => {
  try {
    const input = createOrderSchema.parse(req.body);
    const existing = await db.getOrderByOperationId(input.operationId);
    const simulation = !mercadoPago.isConfigured() && env.NODE_ENV !== 'production' && env.ENABLE_PAYMENT_SIMULATION;
    if (existing) {
      if (existing.deviceId !== req.principal!.deviceId || existing.paymentMethod !== input.paymentMethod) {
        throw new AppError(409, 'OPERATION_CONFLICT', 'Esta operación ya pertenece a otro pedido o método de pago.');
      }
      const order = existing.paymentMethod === 'card' && !simulation ? await sendOrderToPoint(db, mercadoPago, existing) : existing;
      res.status(200).json({ order, mode: order.paymentMethod === 'cash' ? 'cash' : simulation ? 'simulation' : 'production', idempotentReplay: true });
      return;
    }
    if (input.paymentMethod === 'card' && !mercadoPago.isConfigured() && !simulation) {
      throw new AppError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'La terminal no está disponible. Selecciona efectivo o solicita ayuda.');
    }
    const basePricing = priceOrder(await db.getProducts(), input.items, await db.getRawInventory());
    if (input.expectedSubtotal !== undefined && Math.abs(basePricing.subtotal - input.expectedSubtotal) > 0.001) throw new AppError(409, 'PRICE_CHANGED', 'Los precios cambiaron. Actualiza el menú y revisa el pedido antes de confirmar.');
    const authorizedDiscount = input.discountAuthorizationToken
      ? discountAuthorization.verify(input.discountAuthorizationToken, input.operationId)
      : undefined;
    const pricing = applyAuthorizedDiscount(basePricing, authorizedDiscount);
    const orderId = input.operationId;
    // Change voucher: discount up to its balance, reserved before the order is stored and
    // given back if storing fails or the order is cancelled.
    // A change voucher is money the customer already paid (a ROFÉ liability): it is a
    // PAYMENT of part of the total, never a discount. Revenue stays the full total.
    let voucherUse: { code: string; amount: number } | undefined;
    if (input.voucherCode) {
      if (authorizedDiscount) throw new AppError(400, 'VOUCHER_WITH_DISCOUNT', 'Un cupón no se combina con otro descuento.');
      if (!await db.voucherOrdersAvailable()) throw new AppError(503, 'VOUCHERS_UNAVAILABLE', 'Usar cupones en pedidos requiere la migración 008.');
      const voucher = await findVoucher(input.voucherCode);
      if (voucher.status !== 'ACTIVE' || voucher.balance <= 0) throw new AppError(409, 'VOUCHER_NOT_ACTIVE', voucher.status === 'CANCELLED' ? 'Este cupón fue cancelado por administración.' : 'Este cupón ya fue utilizado.');
      const amount = toMoney(Math.min(voucher.balance, pricing.total));
      if (amount > 0) {
        await db.applyChangeVoucherToOrder({ code: voucher.code, orderId, operationId: input.operationId, amount }).catch((error: unknown) => { throw voucherError(error); });
        voucherUse = { code: voucher.code, amount };
      }
    }
    const folio = `R-${orderId.replaceAll('-', '').slice(0, 10).toUpperCase()}`;

    const newOrder = {
      id: orderId,
      folio,
      operationId: input.operationId,
      deviceId: req.principal!.deviceId,
      customerName: input.customerName || 'Cliente',
      items: pricing.items,
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      discountType: pricing.discountAuthorization?.type,
      discountReason: pricing.discountAuthorization?.reason,
      discountAuthorizedBy: pricing.discountAuthorization?.authorizedBy,
      tax: pricing.tax,
      total: pricing.total,
      voucherAmount: voucherUse?.amount ?? 0,
      notes: voucherUse ? [input.notes, `Pagado con cupón de cambio ${voucherUse.code}: $${voucherUse.amount.toFixed(2)}`].filter(Boolean).join(' · ') : input.notes,
      status: 'PENDING_PAYMENT',
      paymentStatus: input.paymentMethod === 'cash' ? 'NOT_REQUIRED' : 'PENDING',
      paymentMethod: input.paymentMethod,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (voucherUse) {
      // A failed insert must not keep the voucher balance reserved.
      const inserted = await db.createOrder(newOrder).catch(async (error: unknown) => { await db.releaseChangeVoucherForOrder(orderId); throw error; });
      if (!inserted) {
        const replay = await db.getOrderByOperationId(input.operationId);
        res.status(200).json({ order: replay, mode: replay?.paymentMethod === 'cash' ? 'cash' : 'production', idempotentReplay: true });
        return;
      }
      if (amountDue(newOrder) === 0) {
        await db.confirmOrderPayment(orderId, `voucher-${orderId}`, calculateRecipeConsumption(pricing.items));
        const order = await db.getOrderById(orderId);
        broadcast({ type: 'order_paid', orderId, order });
        broadcast({ type: 'inventory_updated' });
        res.status(201).json({ order, mode: 'voucher' });
        return;
      }
      if (input.paymentMethod === 'cash') {
        broadcast({ type: 'order_updated', orderId, order: newOrder });
        broadcast({ type: 'inventory_updated' });
        res.status(201).json({ order: newOrder, mode: 'cash' });
        return;
      }
      const order = simulation ? newOrder : await sendOrderToPoint(db, mercadoPago, newOrder);
      res.status(201).json({ order, mode: simulation ? 'simulation' : 'production' });
      return;
    }

    if (pricing.total === 0) {
      await db.createOrder(newOrder);
      await db.confirmOrderPayment(orderId, `courtesy-${orderId}`, calculateRecipeConsumption(pricing.items));
      const order = await db.getOrderById(orderId);
      broadcast({ type: 'order_paid', orderId, order });
      broadcast({ type: 'inventory_updated' });
      res.status(201).json({ order, mode: 'courtesy' });
      return;
    }

    if (input.paymentMethod === 'cash') {
      const inserted = await db.createOrder(newOrder);
      if (!inserted) {
        const replay = await db.getOrderByOperationId(input.operationId);
        res.status(200).json({ order: replay, mode: 'cash', idempotentReplay: true });
        return;
      }
      broadcast({
        type: 'order_updated',
        orderId,
        order: newOrder
      });
      broadcast({ type: 'inventory_updated' });

      res.status(201).json({
        order: newOrder,
        mode: 'cash'
      });
      return;
    }

    // Persist the stable external reference before contacting the terminal. A timeout
    // can safely be retried with the same body and provider idempotency key.
    const inserted = await db.createOrder(newOrder);
    const stored = inserted ? newOrder : (await db.getOrderByOperationId(input.operationId))!;
    const order = simulation ? stored : await sendOrderToPoint(db, mercadoPago, stored);
    res.status(inserted ? 201 : 200).json({ order, mode: simulation ? 'simulation' : 'production', idempotentReplay: !inserted });

  } catch (error) {
    next(error);
  }
});

app.get('/api/orders/:id', requireAuth, requireRole('POS_DEVICE', 'ADMIN', 'MANAGER', 'BARISTA'), async (req, res, next) => {
  try {
    let order = await db.getOrderById(req.params.id) ?? await db.getOrderByOperationId(req.params.id);
    if (!order || (req.principal!.role === 'POS_DEVICE' && order.deviceId !== req.principal!.deviceId)) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Pedido no encontrado.');
    }
    if (order.paymentIntentId && order.paymentStatus === 'PENDING') {
      const result = order.paymentProvider === 'STRIPE'
        ? await refreshPickupOrder(stripePickup, order)
        : await reconcilePointOrder(db, await mercadoPago.getOrder(order.paymentIntentId));
      order = result.order;
      if (result.changed) {
        await auditSensitive(req, { action: 'PAYMENT_RECONCILED', entity: 'ORDER', entityId: order.id, after: { paymentStatus: order.paymentStatus } });
        broadcast({ type: 'order_updated', orderId: order.id, order });
        broadcast({ type: 'inventory_updated' });
      }
    }
    res.json(order);
  } catch (error) { next(error); }
});

app.post('/api/orders/:id/cancel-payment', requireAuth, requireRole('POS_DEVICE'), async (req, res, next) => {
  try {
    let order = await db.getOrderById(req.params.id) ?? await db.getOrderByOperationId(req.params.id);
    if (!order || order.deviceId !== req.principal!.deviceId) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pedido no encontrado.');
    if (order.status === 'CANCELLED') { res.json({ order }); return; }
    if (order.status !== 'PENDING_PAYMENT') throw new AppError(409, 'ORDER_ALREADY_PAID', 'El pago ya fue confirmado. Conserva el comprobante y solicita ayuda.');
    if (order.paymentMethod === 'card' && mercadoPago.isConfigured() && order.paymentStatus === 'PENDING') {
      order = await sendOrderToPoint(db, mercadoPago, order);
      const cancelled = await mercadoPago.cancelOrder(order.paymentIntentId!, `cancel-${order.id}`);
      if (!cancelled) throw new AppError(409, 'CANCELLATION_PENDING', 'Cancelación solicitada. Espera la confirmación en la terminal antes de iniciar otro pago.');
    }
    await db.updateOrderStatus(order.id, 'CANCELLED', undefined, undefined, 'Cancelado desde el punto de venta');
    await db.releaseChangeVoucherForOrder(order.id);
    order = (await db.getOrders()).find((entry) => entry.id === order!.id)!;
    await auditSensitive(req, { action: 'ORDER_CANCEL', entity: 'ORDER', entityId: order.id });
    broadcast({ type: 'order_updated', orderId: order.id, order });
    res.json({ order });
  } catch (error) { next(error); }
});

// Sync offline orders
app.post('/api/orders/sync', requireAuth, requireRole('POS_DEVICE'), async (req, res, next) => {
  try {
    const syncSchema = z.object({ operations: z.array(z.object({
      operationId: z.string().uuid(),
      type: z.literal('CREATE_CASH_ORDER'),
      payload: createOrderSchema,
    })).min(1).max(100) });
    const { operations } = syncSchema.parse(req.body);
    const products = await db.getProducts();
    let syncedCount = 0;
    for (const operation of operations) {
      const existing = await db.getOrderByOperationId(operation.operationId);
      if (existing) {
        if (existing.deviceId !== req.principal!.deviceId || existing.paymentMethod !== 'cash') throw new AppError(409, 'OPERATION_CONFLICT', 'La operación pertenece a otro pedido.');
        continue;
      }
      if (operation.payload.paymentMethod !== 'cash' || operation.payload.operationId !== operation.operationId) {
        throw new AppError(400, 'INVALID_OFFLINE_OPERATION', 'Sólo las ventas en efectivo pueden sincronizarse desde la outbox.');
      }
      if (operation.payload.discountAuthorizationToken) {
        throw new AppError(400, 'OFFLINE_DISCOUNT_NOT_ALLOWED', 'Los descuentos requieren autorización en línea vigente.');
      }
      if (operation.payload.voucherCode) {
        throw new AppError(400, 'OFFLINE_VOUCHER_NOT_ALLOWED', 'Los cupones de cambio solo se aceptan en línea.');
      }
      const pricing = priceOrder(products, operation.payload.items, await db.getRawInventory());
      const now = new Date().toISOString();
      const inserted = await db.createOrder({
        id: operation.operationId,
        folio: `R-${operation.operationId.replaceAll('-', '').slice(0, 10).toUpperCase()}`,
        operationId: operation.operationId,
        deviceId: req.principal!.deviceId,
        customerName: operation.payload.customerName || 'Cliente',
        items: pricing.items,
        subtotal: pricing.subtotal,
        discount: 0,
        tax: 0,
        total: pricing.total,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'NOT_REQUIRED',
        paymentMethod: 'cash',
        notes: operation.payload.notes,
        createdAt: now,
        updatedAt: now,
      });
      if (inserted) {
        syncedCount += 1;
        const order = (await db.getOrders()).find((entry) => entry.operationId === operation.operationId);
        broadcast({ type: 'order_updated', orderId: order?.id, order });
      }
    }

    // Broadcast update so clients refresh
    if (syncedCount > 0) {
      broadcast({ type: 'inventory_updated' });
    }

    res.json({ message: 'Sincronización completada', syncedOrders: syncedCount, operationIds: operations.map((operation) => operation.operationId) });
  } catch (error) {
    console.error('Error en sync:', error);
    next(error);
  }
});

// Update order status (Barista View actions)
app.post('/api/orders/:id/status', requireAuth, requireRole('ADMIN', 'MANAGER', 'BARISTA'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = z.object({
      status: z.enum(['IN_PREPARATION', 'READY', 'COMPLETED', 'CANCELLED']),
      reason: z.string().trim().min(3).max(240).optional(),
    }).parse(req.body);

    const currentOrder = (await db.getOrders()).find((order) => order.id === id);
    if (!currentOrder) {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }
    const allowedTransitions: Record<string, string[]> = {
      PENDING_PAYMENT: ['CANCELLED'],
      PAID: ['IN_PREPARATION'],
      IN_PREPARATION: ['READY'],
      READY: ['IN_PREPARATION', 'COMPLETED'],
    };
    if (!(allowedTransitions[currentOrder.status] ?? []).includes(status)) {
      throw new AppError(409, 'INVALID_ORDER_TRANSITION', `No se puede cambiar un pedido de ${currentOrder.status} a ${status}.`);
    }
    if (status === 'CANCELLED' && req.principal!.role === 'BARISTA') {
      throw new AppError(403, 'CANCELLATION_REQUIRES_MANAGER', 'Una cancelación requiere autorización administrativa.');
    }
    if (status === 'CANCELLED' && !reason) {
      throw new AppError(400, 'CANCELLATION_REASON_REQUIRED', 'Indica la razón de cancelación.');
    }

    if (status === 'CANCELLED' && currentOrder.paymentProvider === 'STRIPE') {
      const cancelled = await cancelPickupOrder(stripePickup, currentOrder);
      if (cancelled.paymentStatus === 'APPROVED') throw new AppError(409, 'ORDER_ALREADY_PAID', 'El pago ya fue confirmado. Usa una devolución para cancelar la venta.');
    } else if (status === 'CANCELLED' && currentOrder.paymentMethod === 'card' && currentOrder.paymentIntentId) {
      if (!await mercadoPago.cancelOrder(currentOrder.paymentIntentId, `cancel-${currentOrder.id}`)) throw new AppError(409, 'CANCELLATION_PENDING', 'Cancelación solicitada. Espera la confirmación de la terminal.');
    }

    await db.updateOrderStatus(id, status, undefined, undefined, reason);
    const orders = await db.getOrders();
    const updatedOrder = orders.find(o => o.id === id);

    if (!updatedOrder) {
       res.status(404).json({ error: 'Pedido no encontrado.' });
       return;
    }

    console.log(`Estado del pedido ${id} actualizado a: ${status}`);

    // Broadcast state change to all clients
    broadcast({
      type: 'order_updated',
      orderId: id,
      order: updatedOrder
    });

    if (status === 'CANCELLED') {
      await db.releaseChangeVoucherForOrder(id);
      await securityStore.addAudit({ userId: req.principal!.subjectId, deviceId: currentOrder.deviceId, action: 'ORDER_CANCEL', entity: 'ORDER', entityId: id, before: { status: currentOrder.status }, after: { status, reason }, requestId: req.requestId, ip: req.ip, timestamp: new Date().toISOString() });
    }

    res.json(updatedOrder);
  } catch (error) {
    next(error);
  }
});

app.post('/api/orders/:id/refund', requireAuth, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const input = z.object({
      operationId: z.string().uuid(),
      reason: z.string().trim().min(5).max(240),
      cashDenominations: z.record(z.string(), z.number().int().min(0)).optional(),
    }).parse(req.body);
    const order = (await db.getOrders()).find((entry) => entry.id === req.params.id);
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pedido no encontrado.');
    if (order.status === 'REFUNDED' || order.paymentStatus === 'REFUNDED') {
      // Self-healing replay: the voucher part goes back to its voucher exactly once.
      await db.releaseChangeVoucherForOrder(order.id);
      res.json({ order, idempotentReplay: true });
      return;
    }
    if (order.paymentStatus !== 'APPROVED') throw new AppError(409, 'ORDER_NOT_PAID', 'Sólo una venta pagada puede devolverse.');
    if (order.paymentMethod === 'cash') {
      if (!input.cashDenominations || Math.abs(totalDenominations(input.cashDenominations) - amountDue(order)) > 0.001) {
        throw new AppError(400, 'REFUND_CASH_MISMATCH', 'Las denominaciones de devolución deben sumar exactamente lo cobrado en efectivo.');
      }
      if (!await db.getOpenCashSession()) throw new AppError(409, 'CASH_SESSION_REQUIRED', 'Abre caja antes de devolver efectivo.');
    } else if (order.paymentProvider === 'STRIPE') {
      await stripePickup.refund(order);
    } else if (order.paymentIntentId && mercadoPago.isConfigured()) {
      await mercadoPago.refundOrder(order.paymentIntentId, input.operationId);
    } else if (env.NODE_ENV === 'production' || !env.ENABLE_PAYMENT_SIMULATION) {
      throw new AppError(409, 'PAYMENT_REFERENCE_MISSING', 'La venta no tiene una referencia de Mercado Pago para devolver.');
    }
    const committed = await db.applyOrderRefund({ orderId: order.id, operationId: input.operationId, reason: input.reason, userId: req.principal!.subjectId, cashDenominations: input.cashDenominations });
    const voucherReturned = await db.releaseChangeVoucherForOrder(order.id);
    const refunded = (await db.getOrders()).find((entry) => entry.id === order.id)!;
    await auditSensitive(req, { action: 'REFUND', entity: 'ORDER', entityId: order.id, before: order, after: { status: refunded.status, paymentStatus: refunded.paymentStatus, reason: input.reason, voucherReturned } });
    broadcast({ type: 'order_updated', orderId: order.id, order: refunded });
    broadcast({ type: 'inventory_updated' });
    broadcast({ type: 'cash_updated' });
    res.json({ order: refunded, idempotentReplay: !committed });
  } catch (error) { next(error); }
});

// Process cash payment confirmation from barista view
app.post('/api/orders/:id/cash-payment', requireAuth, requireRole('ADMIN', 'MANAGER', 'BARISTA'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { receivedDenominations, changeDenominations, receivedAmount, changeAmount, voucherAmount = 0 } = z.object({
      receivedDenominations: z.record(z.string(), z.number().int().min(0)),
      changeDenominations: z.record(z.string(), z.number().int().min(0)),
      receivedAmount: z.number().min(0).max(1_000_000),
      changeAmount: z.number().min(0).max(1_000_000),
      /** Change the drawer cannot give: issued as a change voucher for the customer. */
      voucherAmount: z.number().min(0).max(1_000_000).optional(),
    }).strict().parse(req.body);

    const orders = await db.getOrders();
    const currentOrder = orders.find(o => o.id === id);
    if (!currentOrder) {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }
    if (currentOrder.paymentStatus === 'APPROVED' || currentOrder.status === 'PAID') {
      res.json({ message: 'El pago ya estaba registrado.', order: currentOrder, voucher: publicVoucher(await db.getChangeVoucherForOrder(id)), idempotentReplay: true });
      return;
    }
    if (currentOrder.paymentMethod !== 'cash') throw new AppError(409, 'PAYMENT_METHOD_MISMATCH', 'Este pedido no fue creado para pago en efectivo.');
    if (!await db.getOpenCashSession()) {
      throw new AppError(409, 'CASH_SESSION_REQUIRED', 'Abre una sesión de caja antes de cobrar en efectivo.');
    }
    if (![receivedAmount, changeAmount, voucherAmount].every(isWholeCents)) throw new AppError(400, 'CASH_AMOUNT_PRECISION', 'Los importes deben expresarse en centavos exactos.');
    const due = amountDue(currentOrder);
    const receivedFromDenominations = totalDenominations(receivedDenominations);
    const changeFromDenominations = totalDenominations(changeDenominations);
    if (Math.abs(receivedFromDenominations - Number(receivedAmount)) > 0.001 || Math.abs(changeFromDenominations - Number(changeAmount)) > 0.001) {
      throw new AppError(400, 'CASH_TOTAL_MISMATCH', 'Las denominaciones no coinciden con los importes capturados.');
    }
    // received = amount due + change given in cash + change owed as a voucher
    if (receivedFromDenominations < due || Math.abs(receivedFromDenominations - changeFromDenominations - voucherAmount - due) > 0.001) {
      throw new AppError(400, 'CASH_PAYMENT_MISMATCH', 'El efectivo recibido y el cambio no cuadran con el total del pedido.');
    }
    if (voucherAmount > 0) {
      if (!await db.vouchersAvailable()) throw new AppError(503, 'VOUCHERS_UNAVAILABLE', 'Los cupones de cambio no están habilitados todavía (falta la migración 007).');
      // A voucher is only for change that truly cannot be given: the drawer (plus the bills
      // just received) must be giving the most change it can. Checked here, not on the screen.
      const register = await db.getCashRegister();
      const available = Object.fromEntries(Object.keys({ ...register, ...receivedDenominations }).map((key) => [key, (register[key] || 0) + (receivedDenominations[key] || 0)]));
      const best = bestPossibleChange(toMoney(receivedFromDenominations - due), available);
      if (Math.abs(best - changeFromDenominations) > 0.001) {
        throw new AppError(409, 'VOUCHER_NOT_NEEDED', best > changeFromDenominations ? `La caja puede entregar $${best.toFixed(2)} de cambio: el cupón solo cubre lo que no se puede entregar.` : 'El cambio indicado no está disponible en caja.');
      }
    }

    let voucher: { code: string; amount: number; userId: string } | undefined;
    let committed = false;
    // The payment and the voucher are one transaction. A code collision (unique index)
    // aborts both, so it is retried with a new code; nothing was stored by the failed try.
    for (let attempt = 0; ; attempt += 1) {
      voucher = voucherAmount > 0 ? { code: generateVoucherCode(), amount: toMoney(voucherAmount), userId: req.principal!.subjectId } : undefined;
      try {
        committed = await db.confirmCashOrderPayment({
          orderId: id,
          paymentId: `cash-${id}`,
          consumption: calculateRecipeConsumption(currentOrder.items as PricedOrderItem[]),
          receivedAmount,
          changeAmount,
          receivedDenominations,
          changeDenominations,
          voucher,
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (voucher && attempt < 3 && /change_vouchers_code_key|duplicate key/.test(message)) continue;
        if (message.includes('insufficient_cash_denomination') || message.includes('Insufficient cash denomination')) throw new AppError(409, 'INSUFFICIENT_CASH', 'La caja no tiene esas denominaciones para el cambio. Vuelve a contar.');
        throw error;
      }
    }
    if (!committed) {
      const replayOrder = (await db.getOrders()).find(o => o.id === id)!;
      res.json({ message: 'El pago ya estaba registrado.', order: replayOrder, voucher: publicVoucher(await db.getChangeVoucherForOrder(id)), idempotentReplay: true });
      return;
    }
    const updatedOrder = (await db.getOrders()).find(o => o.id === id)!;

    console.log(`[EFECTIVO] Pedido ${id} cobrado: Recibido $${receivedAmount}, Cambio $${changeAmount}.`);

    // Broadcast update to all clients
    broadcast({
      type: 'order_paid',
      orderId: id,
      order: updatedOrder
    });
    broadcast({ type: 'cash_updated' });

    await securityStore.addAudit({ userId: req.principal!.subjectId, deviceId: currentOrder.deviceId, action: 'CASH_PAYMENT', entity: 'ORDER', entityId: id, requestId: req.requestId, ip: req.ip, after: { receivedAmount, changeAmount, voucherAmount }, timestamp: new Date().toISOString() });
    if (voucher) await securityStore.addAudit({ userId: req.principal!.subjectId, action: 'VOUCHER_ISSUED', entity: 'CHANGE_VOUCHER', entityId: voucher.code, after: { orderId: id, amount: voucher.amount }, requestId: req.requestId, ip: req.ip, timestamp: new Date().toISOString() });

    res.json({ message: 'Pago en efectivo registrado con éxito.', order: updatedOrder, voucher: publicVoucher(voucher ? await db.getChangeVoucher(voucher.code) : undefined) });
  } catch (error) {
    next(error);
  }
});

// Webhook endpoint for Mercado Pago Point (Cards)
app.post('/api/webhooks/mercadopago', async (req, res, next) => {
  try {
    const queryDataId = typeof req.query['data.id'] === 'string' ? req.query['data.id'] : undefined;
    const bodyDataId = typeof req.body?.data?.id === 'string' ? req.body.data.id : undefined;
    const dataId = queryDataId || bodyDataId;
    const signatureValid = mercadoPago.validateWebhookSignature({
      xSignature: req.header('x-signature'),
      xRequestId: req.header('x-request-id'),
      dataId,
    });
    if (!signatureValid || !dataId) throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Firma de webhook inválida.');

    const { order, changed } = await reconcilePointOrder(db, await mercadoPago.getOrder(dataId));
    if (changed) {
      await auditSensitive(req, { action: 'PAYMENT_RECONCILED', entity: 'ORDER', entityId: order.id, after: { status: order.status, paymentStatus: order.paymentStatus } });
      broadcast({ type: order.paymentStatus === 'APPROVED' ? 'order_paid' : 'order_updated', orderId: order.id, order });
      broadcast({ type: 'inventory_updated' });
    }

    res.status(200).send('OK');
  } catch (error) {
    next(error);
  }
});

// Local simulation endpoint for manual payment confirmation (testing without webhook tunnel)
app.post('/api/orders/:id/simulate-payment', requireAuth, requireRole('POS_DEVICE'), async (req, res) => {
  try {
    if (env.NODE_ENV === 'production' || !env.ENABLE_PAYMENT_SIMULATION) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.' }, requestId: req.requestId });
      return;
    }
    const { id } = req.params;
    const orders = await db.getOrders();
    const currentOrder = orders.find(o => o.id === id);

    if (!currentOrder || currentOrder.deviceId !== req.principal!.deviceId) {
       res.status(404).json({ error: 'Pedido no encontrado.' });
       return;
    }
    if (currentOrder.paymentStatus === 'APPROVED') {
      res.json({ message: 'El pago simulado ya estaba registrado.', order: currentOrder, idempotentReplay: true });
      return;
    }
    const committed = await db.confirmOrderPayment(id, `sim-${id}`, calculateRecipeConsumption(currentOrder.items as PricedOrderItem[]));
    if (!committed) {
      res.json({ message: 'El pago simulado ya estaba registrado.', order: currentOrder, idempotentReplay: true });
      return;
    }
    const paidOrder = (await db.getOrders()).find(o => o.id === id)!;

    console.log(`[SIMULACIÓN] Pedido ${paidOrder.id} marcado como PAGADO manualmente.`);

    // Broadcast status to clients
    broadcast({
      type: 'order_paid',
      orderId: paidOrder.id,
      order: paidOrder
    });

    res.json({ message: 'Pago simulado con éxito.', order: paidOrder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en simulación.' });
  }
});

// Clear orders endpoint (for convenience / start new day)
app.post('/api/orders/clear', requireAuth, requireRole('ADMIN'), (_req, res) => {
  res.status(410).json({ error: { code: 'HISTORY_IS_IMMUTABLE', message: 'Los pedidos no se borran. Usa cierre diario y filtros de historial.' } });
});

// --- Change vouchers (cupones de cambio) ---
const voucherLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true, handler: (_req, res) => res.status(429).json({ error: { code: 'VOUCHER_RATE_LIMITED', message: 'Demasiados intentos con códigos de cupón. Espera unos minutos.' } }) });

function publicVoucher(voucher: DbChangeVoucher | undefined) {
  if (!voucher) return undefined;
  return { code: voucher.code, amount: voucher.amount, balance: voucher.balance, status: voucher.status, createdAt: voucher.createdAt, qr: voucherQrPayload(voucher.code) };
}

function voucherError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('vouchers_migration_missing')) return new AppError(503, 'VOUCHERS_UNAVAILABLE', 'Los cupones de cambio no están habilitados todavía (falta la migración 007).');
  if (message.includes('voucher_not_found')) return new AppError(404, 'VOUCHER_NOT_FOUND', 'No encontramos ese cupón. Revisa el código.');
  if (message.includes('voucher_not_active')) return new AppError(409, 'VOUCHER_NOT_ACTIVE', 'Este cupón ya no está vigente (utilizado o cancelado).');
  if (message.includes('voucher_amount_mismatch')) return new AppError(409, 'VOUCHER_AMOUNT_MISMATCH', 'El saldo del cupón cambió. Vuelve a consultarlo.');
  if (message.includes('insufficient_cash_denomination')) return new AppError(409, 'INSUFFICIENT_CASH', 'La caja no tiene esas denominaciones. Revisa el efectivo disponible.');
  if (message.includes('cash_session_required')) return new AppError(409, 'CASH_SESSION_REQUIRED', 'Abre una sesión de caja antes de entregar efectivo.');
  if (message.includes('voucher_reserved_by_pending_order')) return new AppError(409, 'VOUCHER_RESERVED', 'El cupón está aplicado a un pedido pendiente. Cancela o cobra ese pedido primero.');
  if (message.includes('voucher_cancel_reason_required')) return new AppError(400, 'VOUCHER_CANCEL_REASON_REQUIRED', 'Indica el motivo de la cancelación.');
  return error instanceof AppError ? error : new AppError(500, 'VOUCHER_FAILED', 'No pudimos procesar el cupón.');
}

async function findVoucher(rawCode: string): Promise<DbChangeVoucher> {
  const code = normalizeVoucherCode(rawCode);
  if (!code) throw new AppError(404, 'VOUCHER_NOT_FOUND', 'No encontramos ese cupón. Revisa el código.');
  await db.releaseOrphanVoucherRedemptions(code).catch(() => 0);
  const voucher = await db.getChangeVoucher(code).catch((error: unknown) => { throw voucherError(error); });
  if (!voucher) throw new AppError(404, 'VOUCHER_NOT_FOUND', 'No encontramos ese cupón. Revisa el código.');
  return voucher;
}

app.get('/api/vouchers/:code', voucherLimiter, requireAuth, requireRole('POS_DEVICE', 'BARISTA', 'MANAGER', 'ADMIN'), async (req, res, next) => {
  try { res.json({ voucher: publicVoucher(await findVoucher(String(req.params.code))) }); } catch (error) { next(error); }
});

// The drawer cannot give change and the customer prefers to cancel. Only an unpaid cash
// order qualifies (no money was recorded and no inventory was consumed), so a barista may
// do it; any other cancellation still requires a manager.
app.post('/api/orders/:id/cancel-insufficient-change', requireAuth, requireRole('BARISTA', 'MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const order = await db.getOrderById(String(req.params.id));
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pedido no encontrado.');
    if (order.status === 'CANCELLED') { res.json({ order, idempotentReplay: true }); return; }
    if (order.status !== 'PENDING_PAYMENT' || order.paymentMethod !== 'cash' || order.paymentStatus === 'APPROVED') {
      throw new AppError(409, 'INVALID_ORDER_TRANSITION', 'Solo se puede cancelar así un pedido en efectivo que aún no se cobró.');
    }
    await db.updateOrderStatus(order.id, 'CANCELLED', undefined, undefined, 'Cambio insuficiente en caja: el cliente canceló');
    await db.releaseChangeVoucherForOrder(order.id);
    const updated = await db.getOrderById(order.id);
    broadcast({ type: 'order_updated', orderId: order.id, order: updated });
    broadcast({ type: 'inventory_updated' });
    await securityStore.addAudit({ userId: req.principal!.subjectId, deviceId: order.deviceId, action: 'ORDER_CANCEL', entity: 'ORDER', entityId: order.id, before: { status: order.status }, after: { status: 'CANCELLED', reason: 'INSUFFICIENT_CHANGE' }, requestId: req.requestId, ip: req.ip, timestamp: new Date().toISOString() });
    res.json({ order: updated });
  } catch (error) { next(error); }
});

app.post('/api/vouchers/:code/redeem-cash', voucherLimiter, requireAuth, requireRole('BARISTA', 'MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const { operationId, denominations } = z.object({ operationId: z.string().uuid(), denominations: z.record(z.string(), z.number().int().min(0)) }).strict().parse(req.body);
    const voucher = await findVoucher(String(req.params.code));
    const amount = totalDenominations(denominations);
    if (voucher.status === 'ACTIVE' && Math.abs(amount - voucher.balance) > 0.001) throw new AppError(400, 'VOUCHER_AMOUNT_MISMATCH', 'El efectivo entregado debe ser exactamente el saldo del cupón.');
    const paid = await db.redeemChangeVoucherCash({ code: voucher.code, operationId, amount, denominations, userId: req.principal!.subjectId }).catch((error: unknown) => { throw voucherError(error); });
    if (paid > 0) {
      broadcast({ type: 'cash_updated' });
      await securityStore.addAudit({ userId: req.principal!.subjectId, action: 'VOUCHER_CASH_PAYOUT', entity: 'CHANGE_VOUCHER', entityId: voucher.code, after: { amount: paid }, requestId: req.requestId, ip: req.ip, timestamp: new Date().toISOString() });
    }
    res.json({ voucher: publicVoucher(await db.getChangeVoucher(voucher.code)), paid, idempotentReplay: paid === 0 });
  } catch (error) { next(error); }
});

// Administrative history and liability summary.
async function voucherLedger(since?: number) {
  if (!await db.vouchersAvailable()) return undefined;
  const vouchers = await db.listChangeVouchers();
  const orders = new Map((await db.getOrders()).map((order) => [order.id, order]));
  const inWindow = (timestamp: string) => since === undefined || Date.parse(timestamp) >= since;
  const redemptions = vouchers.flatMap((voucher) => voucher.redemptions);
  const reserved = redemptions.filter((entry) => entry.kind === 'ORDER' && entry.status === 'APPLIED' && orders.get(entry.orderId ?? '')?.status === 'PENDING_PAYMENT');
  return {
    vouchers,
    summary: {
      /** Liability: what ROFÉ still owes on active vouchers. */
      outstanding: toMoney(vouchers.filter((voucher) => voucher.status === 'ACTIVE').reduce((sum, voucher) => sum + voucher.balance, 0)),
      activeCount: vouchers.filter((voucher) => voucher.status === 'ACTIVE').length,
      reservedInPendingOrders: toMoney(reserved.reduce((sum, entry) => sum + entry.amount, 0)),
      issued: toMoney(vouchers.filter((voucher) => inWindow(voucher.createdAt)).reduce((sum, voucher) => sum + voucher.amount, 0)),
      paidOutInCash: toMoney(redemptions.filter((entry) => entry.kind === 'CASH' && inWindow(entry.createdAt)).reduce((sum, entry) => sum + entry.amount, 0)),
      appliedToOrders: toMoney(redemptions.filter((entry) => entry.kind === 'ORDER' && entry.status === 'APPLIED' && orders.get(entry.orderId ?? '')?.paymentStatus === 'APPROVED' && inWindow(entry.createdAt)).reduce((sum, entry) => sum + entry.amount, 0)),
      cancelled: toMoney(vouchers.filter((voucher) => voucher.status === 'CANCELLED' && inWindow(voucher.cancelledAt ?? voucher.updatedAt)).reduce((sum, voucher) => sum + voucher.balance, 0)),
    },
  };
}

app.get('/api/admin/vouchers', requireAuth, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const ledger = await voucherLedger();
    if (!ledger) throw voucherError(new Error('vouchers_migration_missing'));
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    res.json({ summary: ledger.summary, vouchers: ledger.vouchers.filter((voucher) => !status || voucher.status === status).map((voucher) => ({ ...publicVoucher(voucher), orderId: voucher.orderId, createdBy: voucher.createdBy, cancelledReason: voucher.cancelledReason, cancelledBy: voucher.cancelledBy, cancelledAt: voucher.cancelledAt, redemptions: voucher.redemptions.map(({ kind, amount, orderId, status: state, userId, createdAt }) => ({ kind, amount, orderId, status: state, userId, createdAt })) })) });
  } catch (error) { next(error); }
});

app.post('/api/admin/vouchers/:code/cancel', requireAuth, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(5).max(240) }).strict().parse(req.body);
    const voucher = await findVoucher(String(req.params.code));
    const cancelled = await db.cancelChangeVoucher({ code: voucher.code, reason, userId: req.principal!.subjectId }).catch((error: unknown) => { throw voucherError(error); });
    if (cancelled) await auditSensitive(req, { action: 'VOUCHER_CANCEL', entity: 'CHANGE_VOUCHER', entityId: voucher.code, before: { status: voucher.status, balance: voucher.balance }, after: { status: 'CANCELLED', reason } });
    res.json({ voucher: publicVoucher(await db.getChangeVoucher(voucher.code)), idempotentReplay: !cancelled });
  } catch (error) { next(error); }
});

app.get('/api/cash/denominations', requireAuth, requireRole('ADMIN', 'MANAGER', 'BARISTA'), async (_req, res, next) => {
  try {
    res.json(await db.getCashRegister());
  } catch (error) {
    next(error);
  }
});

app.post('/api/orders/discount-authorization', authLimiter, requireAuth, requireRole('POS_DEVICE'), async (req, res, next) => {
  try {
    const input = discountAuthorizationSchema.extend({ email: z.string().email(), password: z.string().min(6).max(128) }).parse(req.body);
    const manager = await authService.verifyManagerCredentials(input.email, input.password);
    const authorization = { operationId: input.operationId, type: input.type, value: input.value, reason: input.reason, authorizedBy: manager.id };
    const token = discountAuthorization.issue(authorization);
    await securityStore.addAudit({
      userId: manager.id, deviceId: req.principal!.deviceId, action: 'DISCOUNT_AUTHORIZE', entity: 'ORDER_OPERATION',
      entityId: input.operationId, after: { type: input.type, value: input.value, reason: input.reason },
      requestId: req.requestId, ip: req.ip, timestamp: new Date().toISOString(),
    });
    res.status(201).json({ token, expiresInSeconds: 300 });
  } catch (error) { next(error); }
});

// --- Admin Endpoints ---
app.use('/api/admin', requireAuth, requireRole('ADMIN', 'MANAGER'));

app.get('/api/admin/terminal', async (_req, res) => {
  res.json({ configured: mercadoPago.isConfigured(), webhookConfigured: Boolean(env.MERCADO_PAGO_WEBHOOK_SECRET), simulation: env.NODE_ENV !== 'production' && env.ENABLE_PAYMENT_SIMULATION, terminalId: env.POINT_DEVICE_ID ?? null });
});
app.post('/api/admin/terminal/check', async (_req, res, next) => {
  try { res.json({ ...await mercadoPago.checkTerminal(), verifiedAt: new Date().toISOString() }); }
  catch (error) { next(error); }
});

app.post('/api/admin/discounts/authorize', async (req, res, next) => {
  try {
    const input = discountAuthorizationSchema.parse(req.body);
    const token = discountAuthorization.issue({ ...input, authorizedBy: req.principal!.subjectId });
    await auditSensitive(req, {
      action: 'DISCOUNT_AUTHORIZE',
      entity: 'ORDER_OPERATION',
      entityId: input.operationId,
      after: { type: input.type, value: input.value, reason: input.reason },
    });
    res.status(201).json({ token, expiresInSeconds: 300 });
  } catch (error) { next(error); }
});

app.get('/api/admin/devices', async (_req, res, next) => {
  try { res.json(await securityStore.listDevices()); } catch (error) { next(error); }
});

app.post('/api/admin/devices/:id/revoke', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const device = await securityStore.findDevice(req.params.id);
    if (!device) throw new AppError(404, 'DEVICE_NOT_FOUND', 'Dispositivo no encontrado.');
    const revokedAt = new Date().toISOString();
    await securityStore.revokeDevice(device.id, revokedAt);
    await securityStore.addAudit({ userId: req.principal!.subjectId, deviceId: device.id, action: 'DEVICE_REVOKE', entity: 'DEVICE', entityId: device.id, before: { active: device.active }, after: { active: false, revokedAt }, requestId: req.requestId, ip: req.ip, timestamp: revokedAt });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/admin/users', requireRole('ADMIN'), async (_req, res, next) => {
  try { res.json(await authService.listUsers()); } catch (error) { next(error); }
});

app.post('/api/admin/users', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const user = await authService.createUser(userCreateSchema.parse(req.body));
    await auditSensitive(req, { action: 'USER_CHANGE', entity: 'USER', entityId: user.id, after: user });
    res.status(201).json(user);
  } catch (error) { next(error); }
});

app.patch('/api/admin/users/:email', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const input = userUpdateSchema.parse(req.body);
    const before = (await authService.listUsers()).find((user) => user.email.toLowerCase() === email);
    if (before?.id === req.principal!.subjectId && (input.active === false || (input.role && input.role !== 'ADMIN'))) {
      throw new AppError(409, 'CANNOT_DEMOTE_SELF', 'No puedes desactivar ni quitar tu propio rol administrador.');
    }
    const user = await authService.updateUser(email, input);
    await auditSensitive(req, { action: 'USER_CHANGE', entity: 'USER', entityId: user.id, before, after: user });
    res.json(user);
  } catch (error) { next(error); }
});

// Get administrative dashboard metrics
app.get('/api/admin/metrics', async (req, res, next) => {
  try {
    const query = z.object({ startDate: z.string().datetime().optional(), endDate: z.string().datetime().optional() }).parse(req.query);
    const [orders, transactions, movements, purchases, waste, register, inventory, cashSession] = await Promise.all([
      db.getOrders(), db.getTransactionLedger(), db.getInventoryMovements(), db.getPurchases(), db.getWasteRecords(),
      db.getCashRegister(), db.getRawInventory(), db.getOpenCashSession(),
    ]);
    const source = { orders, transactions, movements, purchases, waste };
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const selected = buildOperationalReport({ ...source, start: query.startDate ? new Date(query.startDate).getTime() : todayStart, end: query.endDate ? new Date(query.endDate).getTime() : now.getTime() });
    const today = buildOperationalReport({ ...source, start: todayStart, end: now.getTime() });
    const week = buildOperationalReport({ ...source, start: weekStartDate.getTime(), end: now.getTime() });
    const month = buildOperationalReport({ ...source, start: monthStart, end: now.getTime() });
    const cashInRegister = totalDenominations(register);
    const expectedCash = cashSession ? await expectedCashForSession(cashSession.openedAt, cashSession.openingAmount) : 0;
    res.json({
      revenue: selected.revenue, costs: toMoney(selected.costOfGoodsSold + selected.operatingExpenses + selected.wasteCost),
      profit: selected.operatingResult, cashInRegister, transactionsCount: transactions.length,
      salesToday: today.revenue, salesWeek: week.revenue, salesMonth: month.revenue, tickets: selected.tickets,
      averageTicket: selected.averageTicket, grossMargin: selected.grossMargin, grossMarginPercent: selected.grossMarginPercent,
      cashSales: selected.cashSales, cardSales: selected.cardSales, refunds: selected.refunds, discounts: selected.discounts,
      expectedCash, cashDifference: cashSession ? toMoney(cashInRegister - expectedCash) : 0,
      bestProducts: selected.products.slice(0, 5),
      lowInventory: inventory.filter((item) => item.stock <= (item.minStock ?? 0)).map((item) => ({ id: item.id, name: item.name, stock: item.stock, unit: item.unit, minStock: item.minStock ?? 0 })),
    });
  } catch (error) { next(error); }
});

const reportRangeSchema = z.object({ startDate: z.string().datetime().optional(), endDate: z.string().datetime().optional() });
app.get('/api/admin/reports/summary', async (req, res, next) => {
  try {
    const range = reportRangeSchema.parse(req.query);
    res.json(buildOperationalReport({
      orders: await db.getOrders(), transactions: await db.getTransactionLedger(), movements: await db.getInventoryMovements(),
      purchases: await db.getPurchases(), waste: await db.getWasteRecords(),
      start: range.startDate ? new Date(range.startDate).getTime() : undefined,
      end: range.endDate ? new Date(range.endDate).getTime() : undefined,
    }));
  } catch (error) { next(error); }
});

app.get('/api/admin/reports/sales.csv', async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="rofe-ventas.csv"');
    const range = reportRangeSchema.parse(req.query);
    const start = range.startDate ? new Date(range.startDate).getTime() : -Infinity;
    const end = range.endDate ? new Date(range.endDate).getTime() : Infinity;
    const orders = (await db.getOrders()).filter((order) => { const created = new Date(order.createdAt).getTime(); return created >= start && created <= end; });
    res.send(`\uFEFF${salesCsv(orders)}`);
  } catch (error) { next(error); }
});

// Get cash register denominations counts
app.get('/api/admin/cash', async (_req, res) => {
  try {
    const register = await db.getCashRegister();
    res.json(register);
  } catch (error) {
    console.error('Error al obtener arqueo de caja:', error);
    res.status(500).json({ error: 'Error al obtener caja.' });
  }
});

app.get('/api/admin/cash/session', async (_req, res, next) => {
  try {
    const current = await db.getOpenCashSession();
    // expectedCash is physical cash only. Vouchers are shown apart: issued vouchers are cash
    // that stays in the drawer but is owed to customers (a liability), payouts leave the drawer.
    res.json({ current: current ? { ...current, expectedCash: await expectedCashForSession(current.openedAt, current.openingAmount), vouchers: (await voucherLedger(Date.parse(current.openedAt)))?.summary } : undefined, history: await db.getCashSessions() });
  } catch (error) { next(error); }
});

app.post('/api/admin/cash/session/open', async (req, res, next) => {
  try {
    const { denominations, operationId } = z.object({ denominations: z.record(z.string(), z.number().int().min(0)), operationId: z.string().uuid().optional() }).parse(req.body);
    const openingAmount = totalDenominations(denominations);
    const session = { id: operationId ?? randomUUID(), openingAmount, openingDenominations: denominations, openedBy: req.principal!.subjectId, openedAt: new Date().toISOString() };
    const opened = await db.openCashSession(session);
    if (!opened) {
      const previous = (await db.getCashSessions()).find((entry) => entry.id === session.id);
      if (previous) {
        const keys = new Set([...Object.keys(previous.openingDenominations), ...Object.keys(denominations)]);
        if (previous.openedBy !== session.openedBy || [...keys].some((key) => (previous.openingDenominations[key] ?? 0) !== (denominations[key] ?? 0))) {
          throw new AppError(409, 'CASH_OPEN_OPERATION_CONFLICT', 'Este intento de apertura ya se registró con otro conteo. Actualiza la caja antes de continuar.');
        }
        if (previous.closedAt) throw new AppError(409, 'CASH_OPEN_OPERATION_COMPLETED', 'La caja de este intento ya fue cerrada. Actualiza la pantalla para iniciar una apertura nueva.');
        res.status(200).json({ ...previous, idempotentReplay: true });
        return;
      }
      throw new AppError(409, 'CASH_SESSION_ALREADY_OPEN', 'Ya hay una caja abierta. Actualiza su estado y realiza el corte antes de abrir otra sesión.');
    }
    await auditSensitive(req, { action: 'CASH_OPEN', entity: 'CASH_SESSION', entityId: session.id, after: session });
    broadcast({ type: 'cash_updated' });
    res.status(201).json(session);
  } catch (error) { next(error); }
});

async function expectedCashForSession(openedAt: string, openingAmount: number): Promise<number> {
  const entries = (await db.getTransactionLedger()).filter((entry) => entry.created_at && new Date(entry.created_at).getTime() >= new Date(openedAt).getTime() && entry.status !== 'deleted');
  return toMoney(entries.reduce((total, entry) => {
    if (entry.type === 'payment' || entry.type === 'manual_income') return total + entry.amount;
    if (entry.type === 'change' || entry.type === 'manual_expense' || entry.type === 'manual_investment' || entry.type === 'refund' || entry.type === 'voucher_payout') return total - entry.amount;
    return total;
  }, openingAmount));
}

app.post('/api/admin/cash/session/close', async (req, res, next) => {
  try {
    const { denominations, notes } = z.object({ denominations: z.record(z.string(), z.number().int().min(0)), notes: z.string().trim().max(500).optional() }).parse(req.body);
    const session = await db.getOpenCashSession();
    if (!session) throw new AppError(409, 'CASH_SESSION_REQUIRED', 'No hay una sesión de caja abierta.');
    const expectedCash = await expectedCashForSession(session.openedAt, session.openingAmount);
    const countedCash = totalDenominations(denominations);
    const close = { expectedCash, countedCash, difference: toMoney(countedCash - expectedCash), closingDenominations: denominations, closedBy: req.principal!.subjectId, closedAt: new Date().toISOString() };
    const stats = await calculateClosureStats();
    const report = buildOperationalReport({
      orders: await db.getOrders(), transactions: await db.getTransactionLedger(), movements: await db.getInventoryMovements(),
      purchases: await db.getPurchases(), waste: await db.getWasteRecords(), start: new Date(session.openedAt).getTime(), end: new Date(close.closedAt).getTime(),
    });
    const closure = {
      id: randomUUID(), closed_at: close.closedAt, total_sales: report.revenue, total_income: report.otherIncome,
      total_costs: toMoney(report.costOfGoodsSold + report.operatingExpenses + report.wasteCost), net_profit: report.operatingResult,
      cash_start: session.openingAmount, cash_end: countedCash, products_sold: stats.products_sold, notes,
      period_start: session.openedAt, period_end: close.closedAt, cash_sales: report.cashSales, card_sales: report.cardSales,
      refunds: report.refunds, discounts: report.discounts, cost_of_goods: report.costOfGoodsSold, expenses: report.operatingExpenses,
      gross_margin: report.grossMargin, operating_result: report.operatingResult, expected_cash: expectedCash,
      counted_cash: countedCash, difference: close.difference, tickets: report.tickets, closed_by: req.principal!.subjectId,
    };
    const closed = await db.closeCashSessionWithClosing(session.id, close, closure);
    if (!closed) throw new AppError(409, 'CASH_SESSION_ALREADY_CLOSED', 'La sesión de caja ya estaba cerrada.');
    await auditSensitive(req, { action: 'CASH_CLOSE', entity: 'CASH_SESSION', entityId: session.id, before: session, after: close });
    broadcast({ type: 'cash_updated' });
    res.json({ ...session, ...close, vouchers: (await voucherLedger(Date.parse(session.openedAt)))?.summary });
  } catch (error) { next(error); }
});

// Direct count overwrites destroy reconciliation history. Counts are accepted only at open/close.
app.post('/api/admin/cash/adjust', (_req, _res, next) => {
  next(new AppError(410, 'USE_CASH_SESSION', 'Usa apertura, movimientos y cierre de caja auditables.'));
});

// Record a manual cash movement (Income / Expense)
app.post('/api/admin/cash/transaction', async (req, res, next) => {
  try {
    const { type, amount, description, denominations, operationId } = z.object({
      type: z.enum(['manual_income', 'manual_expense', 'manual_investment']),
      amount: z.number().positive().max(1_000_000),
      description: z.string().trim().min(3).max(240),
      denominations: z.record(z.string(), z.number().int().min(0)).default({}),
      operationId: z.string().uuid(),
    }).parse(req.body);
    if (Math.abs(totalDenominations(denominations) - amount) > 0.001) throw new AppError(400, 'CASH_TOTAL_MISMATCH', 'Desglosa el efectivo del movimiento; las denominaciones deben sumar el importe.');
    if (!await db.getOpenCashSession()) throw new AppError(409, 'CASH_SESSION_REQUIRED', 'Abre caja antes de registrar movimientos en efectivo.');

    await db.addCashTransaction({
      type: type as 'manual_income' | 'manual_expense' | 'manual_investment',
      amount,
      description,
      denominations: denominations || {},
      operationId,
      createdBy: req.principal!.subjectId,
    });
    await auditSensitive(req, { action: 'CASH_MOVEMENT', entity: 'CASH_TRANSACTION', after: { type, amount, description, denominations: denominations || {} } });
    broadcast({ type: 'cash_updated' });

    res.json({ message: 'Movimiento de caja registrado con éxito.' });
  } catch (error) {
    next(error);
  }
});

// Get manual cash ledger transactions
app.get('/api/admin/transactions', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let ledger = await db.getTransactionLedger();
    
    if (startDate) {
      const start = new Date(startDate as string).getTime();
      ledger = ledger.filter(t => new Date(t.created_at!).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate as string).getTime();
      ledger = ledger.filter(t => new Date(t.created_at!).getTime() <= end);
    }

    res.json(ledger);
  } catch (error) {
    console.error('Error al obtener historial de movimientos:', error);
    res.status(500).json({ error: 'Error al obtener movimientos.' });
  }
});

// Audit a cash transaction (modify or delete)
app.post('/api/admin/transactions/:id/audit', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, auditReason, newAmount } = z.object({
      status: z.enum(['deleted', 'modified']),
      auditReason: z.string().trim().min(5).max(240),
      newAmount: z.number().positive().max(1_000_000).optional(),
    }).parse(req.body);
    if (status === 'modified' && newAmount === undefined) throw new AppError(400, 'NEW_AMOUNT_REQUIRED', 'Indica el importe corregido.');

    const transaction = (await db.getTransactionLedger()).find((entry) => entry.id === Number(id));
    if (!transaction) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Movimiento no encontrado.');
    const isIncome = ['payment', 'card_payment', 'manual_income'].includes(transaction.type);
    const reverseType = isIncome ? 'manual_expense' : 'manual_income';
    const replacementType = isIncome ? 'manual_income' : 'manual_expense';
    await db.addCashTransaction({
      type: reverseType,
      amount: transaction.amount,
      description: `Reverso de movimiento #${id}: ${auditReason}`,
      denominations: {},
      operationId: randomUUID(),
      createdBy: req.principal!.subjectId,
    });
    if (status === 'modified' && newAmount !== undefined) {
      await db.addCashTransaction({
        type: replacementType,
        amount: newAmount,
        description: `Corrección de movimiento #${id}: ${auditReason}`,
        denominations: {},
        operationId: randomUUID(),
        createdBy: req.principal!.subjectId,
      });
    }
    await auditSensitive(req, { action: 'CASH_ADJUSTMENT', entity: 'CASH_TRANSACTION', entityId: id, before: transaction, after: { correction: status, auditReason, newAmount, immutableOriginal: true } });
    broadcast({ type: 'cash_updated' });
    res.json({ message: 'Corrección compensatoria registrada; el movimiento original se conservó.' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/bakery-batches', (_req, _res, next) => {
  next(new AppError(410, 'USE_PRODUCTION_API', 'Usa /api/admin/production para lotes con receta, costo e idempotencia.'));
});

app.post('/api/admin/bakery-batches', (_req, _res, next) => {
  next(new AppError(410, 'USE_PRODUCTION_API', 'Usa /api/admin/production para lotes con receta, costo e idempotencia.'));
});

app.get('/api/admin/inventory', async (_req, res) => {
  try {
    const inventory = await db.getInventory();
    res.json(inventory);
  } catch (error) {
    console.error('Error al obtener inventario:', error);
    res.status(500).json({ error: 'Error al obtener inventario.' });
  }
});

// Update product stock and cost (Legacy)
app.post('/api/admin/inventory', (_req, _res, next) => {
  next(new AppError(410, 'USE_PRODUCTION_API', 'El inventario terminado se modifica mediante producción auditable.'));
});

// --- NEW V2 ENDPOINTS ---
registerCatalogRoutes(app, { env, requireAuth, audit: auditSensitive, broadcast });

app.get('/api/admin/raw-inventory', async (_req, res) => {
  try {
    const inv = await db.getRawInventory();
    res.json(inv);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener inventario de insumos.' });
  }
});

app.get('/api/admin/inventory-movements', async (_req, res, next) => {
  try { res.json(await db.getInventoryMovements()); } catch (error) { next(error); }
});

app.get('/api/admin/suppliers', async (_req, res, next) => {
  try { res.json(await db.getSuppliers()); } catch (error) { next(error); }
});

app.post('/api/admin/suppliers', async (req, res, next) => {
  try {
    const input = supplierSchema.parse(req.body);
    const supplier = { id: randomUUID(), ...input, active: true, createdAt: new Date().toISOString() };
    await db.createSupplier(supplier);
    await auditSensitive(req, { action: 'SUPPLIER_CHANGE', entity: 'SUPPLIER', entityId: supplier.id, after: supplier });
    res.status(201).json(supplier);
  } catch (error) { next(error); }
});

app.get('/api/admin/purchases', async (_req, res, next) => {
  try { res.json(await db.getPurchases()); } catch (error) { next(error); }
});

app.post('/api/admin/purchases', async (req, res, next) => {
  try {
    const input = purchaseSchema.parse(req.body);
    const existing = (await db.getPurchases()).find((entry) => entry.operationId === input.operationId);
    if (existing) { res.json({ purchase: existing, idempotentReplay: true }); return; }
    const duplicateIngredients = new Set<string>();
    for (const line of input.items) {
      if (duplicateIngredients.has(line.ingredientId)) throw new AppError(400, 'DUPLICATE_PURCHASE_LINE', 'Cada insumo debe aparecer una sola vez por compra.');
      duplicateIngredients.add(line.ingredientId);
    }
    const inventory = await db.getRawInventory();
    const inventoryMap = new Map(inventory.map((item) => [item.id, item]));
    const items = input.items.map((line) => {
      const ingredient = inventoryMap.get(line.ingredientId);
      if (!ingredient) throw new AppError(404, 'INVENTORY_ITEM_NOT_FOUND', `No existe el insumo ${line.ingredientId}.`);
      const subtotal = toMoney(line.quantity * line.unitCost);
      return { ...line, unit: ingredient.unit, unitCost: Math.round(line.unitCost * 1_000_000) / 1_000_000, subtotal };
    });
    if (input.supplierId && !(await db.getSuppliers()).some((supplier) => supplier.id === input.supplierId && supplier.active)) {
      throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'Proveedor no encontrado o inactivo.');
    }
    const purchase = {
      id: randomUUID(),
      ...input,
      total: toMoney(items.reduce((sum, item) => sum + item.subtotal, 0)),
      purchasedAt: new Date().toISOString(),
      createdBy: req.principal!.subjectId,
      items,
    };
    if (purchase.paymentMethod === 'cash') {
      if (!await db.getOpenCashSession()) throw new AppError(409, 'CASH_SESSION_REQUIRED', 'Abre caja antes de pagar una compra en efectivo.');
      if (Math.abs(totalDenominations(purchase.cashDenominations ?? {}) - purchase.total) > 0.001) throw new AppError(400, 'CASH_TOTAL_MISMATCH', 'Desglosa el efectivo de la compra; debe sumar el costo total.');
    }
    const inserted = await db.recordPurchase(purchase);
    const persisted = inserted ? purchase : (await db.getPurchases()).find((entry) => entry.operationId === input.operationId);
    await auditSensitive(req, { action: 'INVENTORY_PURCHASE', entity: 'PURCHASE', entityId: persisted?.id, after: persisted });
    broadcast({ type: 'inventory_updated' });
    res.status(inserted ? 201 : 200).json({ purchase: persisted, idempotentReplay: !inserted });
  } catch (error) { next(error); }
});

app.get('/api/admin/waste', async (_req, res, next) => {
  try { res.json(await db.getWasteRecords()); } catch (error) { next(error); }
});

app.post('/api/admin/waste', async (req, res, next) => {
  try {
    const input = wasteSchema.parse(req.body);
    const record = { id: randomUUID(), ...input, costSnapshot: 0, userId: req.principal!.subjectId, createdAt: new Date().toISOString() };
    const inserted = await db.recordWaste(record);
    const persisted = inserted ? (await db.getWasteRecords()).find((entry) => entry.operationId === input.operationId) : (await db.getWasteRecords()).find((entry) => entry.operationId === input.operationId);
    await auditSensitive(req, { action: 'INVENTORY_WASTE', entity: 'WASTE', entityId: persisted?.id, after: persisted });
    broadcast({ type: 'inventory_updated' });
    res.status(inserted ? 201 : 200).json({ waste: persisted, idempotentReplay: !inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('insufficient_inventory')) return next(new AppError(409, 'INSUFFICIENT_INVENTORY', 'No hay inventario suficiente para registrar la merma.'));
    next(error);
  }
});

app.get('/api/admin/production', async (_req, res, next) => {
  try { res.json(await db.getProductionBatches()); } catch (error) { next(error); }
});

app.post('/api/admin/production', async (req, res, next) => {
  try {
    const input = productionSchema.parse(req.body);
    const products = await db.getProducts();
    const product = products.find((entry) => entry.id === input.productId);
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado.');
    if (!product.recipe || Object.keys(product.recipe).length === 0) throw new AppError(409, 'RECIPE_REQUIRED', 'Configura la receta antes de registrar producción.');
    const priced = priceOrder(products, [{
      productId: product.id,
      quantity: input.quantityProduced,
      customization: { size: 'regular' as const, milk: 'none' as const, sweetness: 'none' as const, temp: 'hot' as const, extraShot: false },
    }]);
    const batch = {
      id: randomUUID(), ...input, totalCost: 0, responsibleUserId: req.principal!.subjectId,
      producedAt: new Date().toISOString(), consumption: calculateRecipeConsumption(priced.items),
    };
    const inserted = await db.recordProductionBatch(batch);
    const persisted = (await db.getProductionBatches()).find((entry) => entry.operationId === input.operationId);
    await auditSensitive(req, { action: 'PRODUCTION_BATCH', entity: 'PRODUCTION_BATCH', entityId: persisted?.id, after: persisted });
    broadcast({ type: 'inventory_updated' });
    res.status(inserted ? 201 : 200).json({ batch: persisted, idempotentReplay: !inserted });
  } catch (error) { next(error); }
});

app.post('/api/admin/raw-inventory', async (req, res, next) => {
  next(new AppError(410, 'USE_AUDITED_ADJUSTMENT', 'Usa el endpoint de ajuste auditable por insumo.'));
});

app.post('/api/admin/raw-inventory/:id/adjust', async (req, res, next) => {
  try {
    const input = z.object({
      stock: z.number().min(0).max(1_000_000_000),
      cost: z.number().min(0).max(1_000_000_000),
      reason: z.string().trim().min(5).max(240),
      operationId: z.string().uuid(),
    }).parse(req.body);
    const id = z.string().min(1).max(100).parse(req.params.id);
    const before = (await db.getRawInventory()).find((item) => item.id === id);
    if (!before) throw new AppError(404, 'INVENTORY_ITEM_NOT_FOUND', 'Insumo no encontrado.');
    const inserted = await db.adjustRawInventory({ id, ...input, userId: req.principal!.subjectId });
    const after = (await db.getRawInventory()).find((item) => item.id === id);
    await auditSensitive(req, { action: 'INVENTORY_ADJUSTMENT', entity: 'RAW_INVENTORY', entityId: id, before, after: { ...after, reason: input.reason } });
    broadcast({ type: 'inventory_updated' });
    res.json({ inventory: after, idempotentReplay: !inserted });
  } catch (error) { next(error); }
});

app.post('/api/admin/raw-inventory/add-item', async (req, res, next) => {
  try {
    const { id, name, unit, stock, cost } = z.object({
      id: z.string().regex(/^[a-z0-9_-]+$/).max(100),
      name: z.string().trim().min(2).max(160),
      unit: z.enum(['kg', 'g', 'L', 'ml', 'piece', 'pieza', 'un']),
      stock: z.number().min(0).default(0),
      cost: z.number().min(0).default(0),
    }).parse(req.body);
    if (stock !== 0 || cost !== 0) throw new AppError(409, 'INITIAL_STOCK_REQUIRES_PURCHASE', 'Crea el insumo en cero y registra la existencia inicial como compra.');
    await db.createRawInventoryItem({
      id, name, unit,
      stock: stock || 0,
      cost: cost || 0
    });
    await auditSensitive(req, { action: 'INVENTORY_ADJUSTMENT', entity: 'RAW_INVENTORY', entityId: id, after: { id, name, unit, stock: stock || 0, cost: cost || 0 } });
    
    broadcast({ type: 'inventory_updated' });
    res.json({ message: 'Insumo creado con éxito.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/raw-inventory/purchase', (_req, res) => {
  res.status(410).json({ error: { code: 'USE_PURCHASES_API', message: 'Este flujo fue reemplazado por /api/admin/purchases para garantizar movimientos e idempotencia.' } });
});

// --- CORTE DE CAJA ---

async function calculateClosureStats() {
  const closures = await db.getDailyClosures();
  const lastClosureDate = closures.length > 0 ? new Date(closures[0].closed_at).getTime() : 0;
  const paidStatuses = new Set(['PAID', 'IN_PREPARATION', 'READY', 'COMPLETED', 'paid', 'preparing', 'ready', 'completed']);
  const orders = (await db.getOrders()).filter((order) =>
    new Date(order.createdAt).getTime() > lastClosureDate && paidStatuses.has(order.status));
  const transactions = (await db.getTransactionLedger()).filter((transaction) =>
    transaction.created_at && new Date(transaction.created_at).getTime() > lastClosureDate && transaction.status !== 'deleted');

  const products_sold: Record<string, number> = {};
  const total_sales = orders.reduce((sum, order) => {
    for (const item of order.items) {
      const name = item.product?.name || item.productName || item.productId || 'Producto';
      products_sold[name] = (products_sold[name] || 0) + Number(item.quantity || 0);
    }
    return sum + Number(order.total);
  }, 0);
  const total_income = transactions.filter((entry) => entry.type === 'manual_income').reduce((sum, entry) => sum + entry.amount, 0);
  const total_costs = transactions.filter((entry) => entry.type === 'manual_expense').reduce((sum, entry) => sum + entry.amount, 0);
  const cash_end = totalDenominations(await db.getCashRegister());

  return {
    last_closure_at: closures[0]?.closed_at ?? null,
    total_sales,
    total_income,
    total_costs,
    net_profit: total_sales + total_income - total_costs,
    cash_start: closures[0]?.cash_end ?? 0,
    cash_end,
    products_sold,
  };
}

app.get('/api/admin/closures/stats', async (_req, res, next) => {
  try { res.json(await calculateClosureStats()); } catch (error) { next(error); }
});

app.post('/api/admin/closures', (_req, res) => {
  res.status(410).json({ error: { code: 'USE_CASH_SESSION', message: 'Usa /api/admin/cash/session/close para cerrar una sesión auditable.' } });
});

app.get('/api/admin/closures', async (_req, res, next) => {
  try {
    const closures = await db.getDailyClosures();
    res.json(closures);
  } catch (error) {
    next(error);
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

export { app };

async function start(): Promise<void> {
  await ensureReady();
  const server = app.listen(PORT, env.HOST ?? '0.0.0.0', () => {
    console.log(JSON.stringify({ level: 'info', event: 'server_started', port: PORT, environment: env.NODE_ENV }));
  });

  const pickupTimer = setInterval(() => void reconcilePendingPickup(), 60_000);
  pickupTimer.unref();
  void reconcilePendingPickup();

  const shutdown = (signal: string) => {
    clearInterval(pickupTimer);
    console.log(JSON.stringify({ level: 'info', event: 'server_stopping', signal }));
    for (const client of clients) client.response.end();
    server.close((error) => {
      if (error) {
        console.error(JSON.stringify({ level: 'error', event: 'server_shutdown_failed', message: error.message }));
        process.exitCode = 1;
      }
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

if (env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  start().catch((error: unknown) => {
    console.error(JSON.stringify({ level: 'error', event: 'startup_failed', message: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  });
}
