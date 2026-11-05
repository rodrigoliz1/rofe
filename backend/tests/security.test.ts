import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'access-secret-for-tests-only-1234567890';
  process.env.JWT_REFRESH_SECRET = 'refresh-secret-for-tests-only-123456789';
  process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
  process.env.ENABLE_PAYMENT_SIMULATION = 'false';
  ({ app } = await import('../src/index'));
});

describe('API security boundary', () => {
  it('keeps admin and KDS data private', async () => {
    expect((await request(app).get('/api/admin/metrics')).status).toBe(401);
    expect((await request(app).get('/api/orders')).status).toBe(401);
  });

  it('does not expose payment simulation anonymously', async () => {
    expect((await request(app).post('/api/orders/fake/simulate-payment')).status).toBe(401);
  });

  it('rejects unsigned Mercado Pago webhooks', async () => {
    expect((await request(app).post('/api/webhooks/mercadopago').send({ data: { id: 'ORD_FAKE' } })).status).toBe(401);
  });
});
