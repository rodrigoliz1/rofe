import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import type { Express } from 'express';
import { MercadoPagoService } from '../src/payments/mercadoPago';
import type { DbAdapter } from '../src/db';
let app: Express; let db: DbAdapter; let directory: string; let admin: string; let barista: string;
const cronSecret = 'isolated-scheduler-secret-fixture-0123456789';
const hash = '$2b$04$JQi.d6Imx6difkoQ44MRpurCCn9m7VqL0U7Amhct090Q9yyJLH9ey';
const getOrder = vi.spyOn(MercadoPagoService.prototype, 'getOrder');
const create = vi.spyOn(MercadoPagoService.prototype, 'createPointOrder').mockRejectedValue(new Error('Financial requests prohibited in this test'));
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'rofe-point-api-'));
  Object.assign(process.env, { DB_FILE_PATH: join(directory, 'db.json'), POINT_RECONCILIATION_ENABLED: 'true', CRON_SECRET: cronSecret,
    AUTH_BOOTSTRAP_ADMIN_EMAIL: 'admin@rofe.test', AUTH_BOOTSTRAP_ADMIN_HASH: hash, AUTH_BOOTSTRAP_BARISTA_EMAIL:'barista@rofe.test',AUTH_BOOTSTRAP_BARISTA_HASH:hash });
  const module=await import('../src/index'); app=module.app; await module.ensureReady(); db=(await import('../src/db')).db;
  for (const email of ['admin@rofe.test','barista@rofe.test']) {
    const login=await request(app).post('/api/auth/login').send({email,password:'TestAdmin123!'}); expect(login.status).toBe(200);
    if(email.startsWith('admin'))admin=`Bearer ${login.body.accessToken}`;else barista=`Bearer ${login.body.accessToken}`;
  }
});
afterAll(async()=>{vi.restoreAllMocks();await rm(directory,{recursive:true,force:true});});
test('scheduler and recovery are protected; admin visibility contains no customer or provider payload',async()=>{
  const id=randomUUID(); await db.createOrder({id,customerName:'Private customer not exposed',items:[],total:55,paymentMethod:'card',paymentStatus:'PENDING',status:'PENDING_PAYMENT',createdAt:new Date(Date.now()-60_000).toISOString()});
  expect((await request(app).get('/api/internal/point-reconciliation')).status).toBe(401);
  expect((await request(app).get('/api/internal/point-reconciliation').set('Authorization',admin)).status).toBe(401);
  for(const path of ['/api/admin/payments/point',`/api/admin/payments/point/${id}/reconcile`]) {
    const method=path.endsWith('reconcile')?'post':'get';
    expect((await request(app)[method](path).set('Authorization',barista).send({})).status).toBe(403);
  }
  const listed=await request(app).get('/api/admin/payments/point').set('Authorization',admin);
  expect(listed.status).toBe(200);expect(JSON.stringify(listed.body)).not.toContain('Private customer');
  expect(listed.body.orders[0]).toMatchObject({id,outcome:'MISSING_REFERENCE',hasProviderReference:false});
  vi.spyOn(MercadoPagoService.prototype,'isConfigured').mockReturnValue(true);
  const scheduled=await request(app).get('/api/internal/point-reconciliation').set('Authorization',`Bearer ${cronSecret}`);
  expect(scheduled.status).toBe(200);expect(scheduled.body).toEqual({claimed:1,resolved:0});expect(getOrder).not.toHaveBeenCalled();
  getOrder.mockResolvedValue({id:'ORD-VERIFIED',external_reference:id,status:'processed',status_detail:'accredited',transactions:{payments:[{paid_amount:'55.00'}]}});
  for(let retry=0;retry<2;retry++) {
    const result=await request(app).post(`/api/admin/payments/point/${id}/reconcile`).set('Authorization',admin).send({providerOrderId:'ORD-VERIFIED'});
    expect(result.status).toBe(200);expect(result.body.changed).toBe(retry===0);
  }
  const after=await request(app).get('/api/admin/payments/point').set('Authorization',admin);
  expect(after.body.orders).toHaveLength(0);expect(after.body.unassigned).toHaveLength(1);expect(after.body.unassigned[0].id).toBe(id);
  expect((await db.getTransactionLedger()).filter(t=>t.type==='card_payment')).toHaveLength(1);expect(create).not.toHaveBeenCalled();
});
