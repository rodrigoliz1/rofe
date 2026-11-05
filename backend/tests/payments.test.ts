import { createHmac } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../src/config/env';
import { MercadoPagoService } from '../src/payments/mercadoPago';

const secret = 'webhook-secret-value-that-is-long';
const env = {
  NODE_ENV: 'test', API_RATE_LIMIT_MAX: 180, PORT: 3000, ALLOWED_ORIGINS: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40),
  AUTH_BOOTSTRAP_ADMIN_EMAIL: 'admin@rofe.local', AUTH_BOOTSTRAP_BARISTA_EMAIL: 'barista@rofe.local',
  MERCADO_PAGO_WEBHOOK_SECRET: secret, ENABLE_PAYMENT_SIMULATION: false, LOG_LEVEL: 'info', TRUST_PROXY: 1,
} satisfies AppEnv;

describe('Mercado Pago webhook signature', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('accepts the documented HMAC manifest', () => {
    const timestamp = String(Date.now());
    const dataId = 'ORD01ABC';
    const requestId = 'request-123';
    const signature = createHmac('sha256', secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`).digest('hex');
    const service = new MercadoPagoService(env);
    expect(service.validateWebhookSignature({ xSignature: `ts=${timestamp},v1=${signature}`, xRequestId: requestId, dataId })).toBe(true);
  });

  it('rejects fake and stale signatures', () => {
    const service = new MercadoPagoService(env);
    expect(service.validateWebhookSignature({ xSignature: `ts=${Date.now()},v1=${'0'.repeat(64)}`, xRequestId: 'x', dataId: 'ORD1' })).toBe(false);
    expect(service.validateWebhookSignature({ xSignature: `ts=${Date.now() - 600_000},v1=${'0'.repeat(64)}`, xRequestId: 'x', dataId: 'ORD1' })).toBe(false);
  });

  it('uses the Orders refund endpoint with a provider idempotency key and no body for a full refund', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'ORD1', status: 'refunded' }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new MercadoPagoService({ ...env, MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR_test_access_token_value', POINT_DEVICE_ID: 'PAX_A910__TEST' });
    await service.refundOrder('ORD1', '58e8ff1c-a26b-4a4e-bad7-94971c892706');
    expect(fetchMock).toHaveBeenCalledWith('https://api.mercadopago.com/v1/orders/ORD1/refund', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-Idempotency-Key': '58e8ff1c-a26b-4a4e-bad7-94971c892706' }) }));
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
  });
});


describe('asynchronous Point cancellation', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('keeps HTTP 202 pending rather than claiming the charge was cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'at_terminal' }), { status: 202 })));
    const service = new MercadoPagoService({ ...env, MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR_test_access_token_value', POINT_DEVICE_ID: 'PAX_A910__TEST' });
    await expect(service.cancelOrder('ORD1', 'cancel-order-1')).resolves.toBe(false);
  });
  it('accepts signed timestamps in seconds without changing the signed manifest', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', secret).update(`id:ord1;request-id:req;ts:${ts};`).digest('hex');
    expect(new MercadoPagoService(env).validateWebhookSignature({ xSignature: `ts=${ts},v1=${signature}`, xRequestId: 'req', dataId: 'ORD1' })).toBe(true);
  });
});
