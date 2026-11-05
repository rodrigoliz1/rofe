import Stripe from 'stripe';
import type { AppEnv } from '../config/env';
import type { DbAdapter, DbOrder } from '../db';
import { calculateRecipeConsumption } from '../domain/inventory';
import type { PricedOrderItem } from '../domain/pricing';
import { AppError } from '../utils/errors';

export class StripePickupService {
  readonly client?: Stripe;
  constructor(readonly env: AppEnv, client?: Stripe) {
    this.client = client ?? (env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20_000 }) : undefined);
  }
  configured(): boolean { return Boolean(this.client && this.env.STRIPE_WEBHOOK_SECRET && this.env.PUBLIC_ORDERING_URL); }
  available(): boolean { return this.configured() && this.env.PICKUP_ENABLED !== false; }
  private requireClient(): Stripe {
    if (!this.client) throw new AppError(503, 'PICKUP_UNAVAILABLE', 'El pago en línea no está disponible en este momento. Puedes pedir directamente en barra.');
    return this.client;
  }
  async createSession(order: DbOrder, token: string): Promise<Stripe.Checkout.Session> {
    const returnUrl = new URL('/pedir', this.env.PUBLIC_ORDERING_URL);
    returnUrl.searchParams.set('pedido', order.id);
    // The receipt capability stays in the fragment: it never reaches access logs or referrers.
    returnUrl.hash = new URLSearchParams({ clave: token }).toString();
    const cancelUrl = new URL(returnUrl); cancelUrl.searchParams.set('pago', 'pendiente');
    return this.requireClient().checkout.sessions.create({
      mode: 'payment', ui_mode: 'hosted_page', allowed_payment_method_types: ['card'], locale: 'es', submit_type: 'pay',
      client_reference_id: order.id,
      metadata: { rofe_order_id: order.id, channel: 'QR_PICKUP' },
      payment_intent_data: { metadata: { rofe_order_id: order.id, channel: 'QR_PICKUP' } },
      line_items: order.items.map((item) => ({
        quantity: item.quantity,
        price_data: { currency: 'mxn', unit_amount: Math.round(item.unitPrice! * 100), product_data: {
          name: item.productName ?? item.product!.name,
          ...(item.modifiers?.length ? { description: item.modifiers.map((modifier) => modifier.name).join(' · ').slice(0, 500) } : {}),
        } },
      })),
      expires_at: Math.floor(Date.parse(order.pickup!.expiresAt) / 1000),
      success_url: returnUrl.toString(), cancel_url: cancelUrl.toString(),
      custom_text: { submit: { message: `Para recoger en ${order.pickup!.locationName}. Espera la confirmación de tu pedido en ROFÉ.` } },
    }, { idempotencyKey: `pickup-${order.id}` });
  }
  retrieveSession(id: string): Promise<Stripe.Checkout.Session> { return this.requireClient().checkout.sessions.retrieve(id); }
  expireSession(id: string): Promise<Stripe.Checkout.Session> { return this.requireClient().checkout.sessions.expire(id); }
  verifyEvent(body: Buffer, signature: string): Stripe.Event {
    if (!this.env.STRIPE_WEBHOOK_SECRET) throw new AppError(503, 'STRIPE_WEBHOOK_UNAVAILABLE', 'El servicio de notificaciones no está configurado.');
    try { return this.requireClient().webhooks.constructEvent(body, signature, this.env.STRIPE_WEBHOOK_SECRET); }
    catch { throw new AppError(400, 'INVALID_STRIPE_SIGNATURE', 'Notificación no válida.'); }
  }
  async recoverSession(order: DbOrder): Promise<Stripe.Checkout.Session | undefined> {
    // Only needed when Stripe accepted a create request but its response was lost.
    let seen = 0;
    for await (const session of this.requireClient().checkout.sessions.list({ limit: 100, created: {
      gte: Math.floor(Date.parse(order.createdAt) / 1000) - 60,
      lte: Math.floor(Date.parse(order.pickup!.expiresAt) / 1000),
    } })) {
      if (session.client_reference_id === order.id && session.metadata?.rofe_order_id === order.id) return session;
      if (++seen >= 1000) throw new AppError(503, 'PICKUP_RECOVERY_PENDING', 'Estamos verificando tu pago. Conserva el folio y vuelve a consultar.');
    }
    return undefined;
  }
  async refund(order: DbOrder): Promise<void> {
    if (!order.paymentId?.startsWith('pi_')) throw new AppError(409, 'STRIPE_PAYMENT_REFERENCE_MISSING', 'No encontramos la referencia del pago para devolverlo.');
    const refund = await this.requireClient().refunds.create({ payment_intent: order.paymentId, amount: Math.round(order.total * 100), metadata: { rofe_order_id: order.id } }, { idempotencyKey: `pickup-refund-${order.id}` });
    if (refund.status !== 'succeeded') throw new AppError(409, 'REFUND_PENDING', 'Stripe está procesando la devolución. Se actualizará cuando confirme el resultado.');
  }
  async fullyRefunded(order: DbOrder): Promise<boolean> {
    if (!order.paymentId) return false;
    const intent = await this.requireClient().paymentIntents.retrieve(order.paymentId, { expand: ['latest_charge'] });
    const charge = intent.latest_charge;
    return Boolean(charge && typeof charge !== 'string' && charge.refunded && charge.amount_refunded === Math.round(order.total * 100) && charge.currency === 'mxn');
  }
}

export async function reconcileStripeSession(db: DbAdapter, session: Stripe.Checkout.Session): Promise<{ order: DbOrder; changed: boolean }> {
  let order = session.client_reference_id ? await db.getOrderById(session.client_reference_id) : undefined;
  if (!order || order.channel !== 'QR_PICKUP' || order.paymentProvider !== 'STRIPE' || session.metadata?.rofe_order_id !== order.id || (order.paymentIntentId && order.paymentIntentId !== session.id)) {
    throw new AppError(409, 'STRIPE_REFERENCE_MISMATCH', 'La referencia de pago no coincide con el pedido.');
  }
  if (session.mode !== 'payment' || session.currency !== 'mxn' || session.amount_total !== Math.round(order.total * 100)) {
    throw new AppError(409, 'STRIPE_AMOUNT_MISMATCH', 'El importe del pago no coincide con el pedido. Solicita ayuda en barra.');
  }
  if (!order.paymentIntentId) {
    await db.attachPaymentIntent(order.id, session.id);
    order = (await db.getOrderById(order.id))!;
    if (order.paymentIntentId !== session.id) throw new AppError(409, 'STRIPE_REFERENCE_MISMATCH', 'El pedido ya tiene otra referencia de pago.');
  }
  let changed = false;
  if (session.payment_status === 'paid' && session.status === 'complete') {
    const paymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!paymentId) throw new AppError(409, 'STRIPE_PAYMENT_REFERENCE_MISSING', 'Stripe aún no confirma la referencia del pago.');
    changed = await db.confirmOrderPayment(order.id, paymentId, calculateRecipeConsumption(order.items as PricedOrderItem[]));
  } else if (session.status === 'expired' && order.status === 'PENDING_PAYMENT' && order.paymentStatus === 'PENDING') {
    await db.updateOrderStatus(order.id, 'CANCELLED', undefined, 'REJECTED', 'El pago en línea expiró sin completarse.');
    changed = true;
  }
  return { order: (await db.getOrderById(order.id))!, changed };
}
