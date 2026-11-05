import express from 'express';
import request from 'supertest';
import { afterEach, expect, test, vi } from 'vitest';
import { errorHandler } from '../src/utils/errors';

afterEach(() => vi.restoreAllMocks());

test('cash database guard failure has actionable public error and original trace', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const app = express();
  app.post('/api/admin/cash/session/open', (req, _res, next) => {
    req.requestId = 'cash-regression-support';
    next({ code: '21000', message: 'UPDATE requires a WHERE clause', databaseFunction: 'open_cash_session' });
  });
  app.use(errorHandler);
  const response = await request(app).post('/api/admin/cash/session/open');
  expect(response.status).toBe(503);
  expect(response.body.error.code).toBe('CASH_DATABASE_UPDATE_REQUIRED');
  expect(response.body.error.message).toContain('Administración');
  expect(response.body.requestId).toBe('cash-regression-support');
  expect(response.text).not.toContain('UPDATE requires');
  expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ databaseCode: '21000', databaseFunction: 'open_cash_session', message: 'UPDATE requires a WHERE clause', requestId: 'cash-regression-support' });
});

test('unrelated database errors remain failures and redact secrets from diagnostics', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const app = express();
  app.get('/other', (_req, _res, next) => next({ code: '21000', message: `UPDATE requires a WHERE clause Bearer private-credential ${process.env.JWT_ACCESS_SECRET}` }));
  app.use(errorHandler);
  const response = await request(app).get('/other');
  expect(response.status).toBe(500);
  expect(response.body.error.code).toBe('INTERNAL_ERROR');
  expect(String(log.mock.calls[0][0])).not.toContain('private-credential');
  expect(String(log.mock.calls[0][0])).not.toContain(process.env.JWT_ACCESS_SECRET);
});
