import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const directory = await mkdtemp(join(tmpdir(), 'rofe-entry-'));
// Build-artifact test only: no inherited provider, database or staff credentials.
Object.assign(process.env, {
  NODE_ENV: 'test', VERCEL: '1', VERCEL_ENV: 'preview',
  JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
  SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', MERCADO_PAGO_ACCESS_TOKEN: '',
  MERCADO_PAGO_WEBHOOK_SECRET: '', POINT_DEVICE_ID: '', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '',
  AUTH_BOOTSTRAP_ADMIN_HASH: '', AUTH_BOOTSTRAP_BARISTA_HASH: '', DEVICE_ENROLLMENT_SECRET: '',
  PUBLIC_ORDERING_URL: '', CRON_SECRET: '', POINT_RECONCILIATION_ENABLED: 'false',
  DB_FILE_PATH: join(directory, 'db.json'), SECURITY_DEVICES_FILE_PATH: join(directory, 'devices.json'),
});
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const express = require('express');
const { default: handler } = await import('../api/index.js');
const app = express();
app.use((req, res, next) => Promise.resolve(handler(req, res)).catch(next));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
try {
  const url = `http://127.0.0.1:${server.address().port}`;
  const preview = await fetch(`${url}/health`);
  assert.equal(preview.status, 503);
  assert.equal((await preview.json()).error.code, 'PREVIEW_BACKEND_DISABLED');
  await assert.rejects(access(process.env.DB_FILE_PATH));
  // Production dispatch is exercised against an isolated TEST backend, never live services.
  process.env.VERCEL_ENV = 'production';
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.equal((await fetch(`${url}/ready`)).status, 200);
  console.log('Serverless entry: preview blocked before I/O; compiled backend dispatch verified with isolated data.');
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
