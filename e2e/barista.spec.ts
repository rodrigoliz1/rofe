import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
const API = 'http://127.0.0.1:3100';
const auth = async (request: APIRequestContext, email: string, password: string) => ({ Authorization: `Bearer ${(await (await request.post(`${API}/api/auth/login`, { data: { email, password } })).json()).accessToken}` });
async function staffLogin(page: Page) {
  await page.goto('/barista');
  await page.getByLabel('Correo').fill('barista@rofe.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('12345678');
  await page.getByRole('button', { name: 'Iniciar turno', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pedidos', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'En vivo' })).toBeVisible();
}
test('dedicated Barista receives concurrent orders, alerts once, collects cash and recovers missed orders', async ({ page, browser, request }) => {
  test.setTimeout(90_000); await page.setViewportSize({ width: 1280, height: 800 });
  const admin = await auth(request, 'admin@rofe.test', 'TestAdmin123!');
  const barista = await auth(request, 'barista@rofe.test', '12345678');
  const registered = await (await request.post(`${API}/api/auth/device/register`, { data: { name: 'M10 sincronización', enrollmentSecret: 'e2e-device-enrollment-secret' } })).json();
  const device = { Authorization: `Bearer ${(await (await request.post(`${API}/api/auth/device/login`, { data: registered })).json()).accessToken}` };
  expect((await request.get(`${API}/api/barista/session`)).status()).toBe(401);
  expect((await request.get(`${API}/api/barista/session`, { headers: device })).status()).toBe(403);
  expect((await request.get(`${API}/api/admin/raw-inventory`, { headers: barista })).status()).toBe(403);
  for (const headers of [admin, barista]) expect((await request.get(`${API}/api/barista/session`, { headers })).status()).toBe(200);
  const current = await (await request.get(`${API}/api/admin/cash/session`, { headers: admin })).json();
  if (current.current) await request.post(`${API}/api/admin/cash/session/close`, { headers: admin, data: { sessionId: (await (await request.get('http://127.0.0.1:3100/api/admin/cash/session', { headers: admin })).json()).current.id, denominations: await (await request.get(`${API}/api/admin/cash`, { headers: admin })).json() } });
  expect((await request.post(`${API}/api/admin/cash/session/open`, { headers: admin, data: { operationId: crypto.randomUUID(), denominations: { bill_20: 20, coin_5: 20, coin_2: 20, coin_1: 20 } } })).status()).toBe(201);
  await page.goto('/barista'); await expect(page.getByRole('heading', { name: 'Inicia tu turno' })).toBeVisible(); await page.screenshot({ path: 'docs/evidence/barista-login.png' });
  const soundHashes: string[] = [];
  page.on('response', async response => {
    if (response.url().includes('nuevo_pedido') && response.status() === 200) soundHashes.push(createHash('sha256').update(await response.body()).digest('hex'));
  });
  await page.addInitScript(() => {
    const state = window as Window & { baristaAudioDurations: number[] };
    state.baristaAudioDurations = [];
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      state.baristaAudioDurations.push(this.buffer?.duration ?? 0);
      return original.apply(this, args);
    };
  });
  await staffLogin(page);
  await expect(page.getByRole('button', { name: 'Sonido activo', exact: true })).toBeVisible();
  await expect.poll(() => soundHashes.length).toBe(1);
  expect(soundHashes[0]).toBe(createHash('sha256').update(readFileSync('src/assets/audio/nuevo_pedido.mp3')).digest('hex'));
  await page.evaluate(() => { (window as unknown as { alertIds: string[] }).alertIds = []; window.addEventListener('rofe:barista-alert', event => { (window as unknown as { alertIds: string[] }).alertIds.push(...(event as CustomEvent<{ orderIds: string[] }>).detail.orderIds); }); });
  const created: string[] = [];
  const create = async (name: string, source: 'KIOSK' | 'POS' = 'KIOSK') => {
    const payload = { operationId: crypto.randomUUID(), customerName: name, source, paymentMethod: 'cash', items: [{ productId: 'espresso', quantity: 1 }] };
    const response = await request.post(`${API}/api/orders`, { headers: device, data: payload }); expect(response.status(), await response.text()).toBe(201);
    const order = (await response.json()).order; created.push(order.id);
    // Replaying the same submission must neither insert nor alert twice.
    expect((await request.post(`${API}/api/orders`, { headers: device, data: payload })).status()).toBe(200);
    return order;
  };
  const [one, two] = await Promise.all([create('M10 Uno'), create('M10 Dos', 'POS')]);
  for (const name of ['M10 Uno', 'M10 Dos']) await expect(page.locator('.barista-order-card', { hasText: name })).toBeVisible();
  await expect.poll(() => page.evaluate(ids => (window as unknown as { alertIds: string[] }).alertIds.filter(id => ids.includes(id)).length, [one.id, two.id])).toBe(2);
  const playedDurations = await page.evaluate(() => (window as Window & { baristaAudioDurations: number[] }).baristaAudioDurations);
  expect(playedDurations.length).toBeGreaterThanOrEqual(1);
  expect(playedDurations.length).toBeLessThanOrEqual(2); // A simultaneous snapshot may group two arrivals.
  expect(playedDurations.every(duration => duration > 1 && duration < 2)).toBe(true);
  await page.screenshot({ path: 'docs/evidence/barista-tablet-queue.png' });
  const card = () => page.locator('.barista-order-card', { hasText: 'M10 Uno' });
  await expect(card()).toContainText('Kiosco');
  await card().getByRole('button', { name: 'COBRAR', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Pago en efectivo' });
  await panel.getByRole('button', { name: /Billete de \$50: 0 recibidos/ }).click();
  await panel.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(card().getByRole('button', { name: 'ACEPTAR', exact: true })).toBeVisible();
  await card().getByRole('button', { name: 'ACEPTAR', exact: true }).click();
  await card().getByRole('button', { name: 'LISTO', exact: true }).click();
  await card().getByRole('button', { name: 'ENTREGAR', exact: true }).click();
  await expect(card()).toHaveCount(0);
  await page.context().setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Sin conexión' }).first()).toBeVisible();
  const missed = await create('M10 Reconexión');
  await page.context().setOffline(false);
  await expect(page.locator('.barista-order-card', { hasText: 'M10 Reconexión' })).toBeVisible();
  await expect.poll(() => page.evaluate(id => (window as unknown as { alertIds: string[] }).alertIds.filter(value => value === id).length, missed.id)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('rofe:resume')));
  await expect(page.getByRole('status').filter({ hasText: 'En vivo' })).toBeVisible();
  expect(await page.evaluate(id => (window as unknown as { alertIds: string[] }).alertIds.filter(value => value === id).length, one.id)).toBe(1);
  // Browser restart / app reload recovers authentication and queue, retains alert ledger.
  await page.reload(); await expect(page.getByRole('heading', { name: 'Pedidos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activar sonido', exact: true }).click();
  const persisted = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('rofe.barista.alerts:')).flatMap(key => JSON.parse(localStorage.getItem(key) || '[]') as string[]));
  expect(persisted).toEqual(expect.arrayContaining([one.id, two.id, missed.id]));
  await page.getByRole('button', { name: 'Cupones', exact: true }).click(); await expect(page.getByRole('button', { name: 'Escanear QR' })).toBeVisible();
  const other = await browser.newContext(); const tablet = await other.newPage(); await staffLogin(tablet); await expect(tablet.locator('.barista-order-card', { hasText: 'M10 Dos' })).toBeVisible(); await other.close();
  for (const id of created.filter(id => id !== one.id)) expect((await request.post(`${API}/api/orders/${id}/cancel-insufficient-change`, { headers: barista })).status()).toBe(200);
  await request.post(`${API}/api/admin/cash/session/close`, { headers: admin, data: { sessionId: (await (await request.get('http://127.0.0.1:3100/api/admin/cash/session', { headers: admin })).json()).current.id, denominations: await (await request.get(`${API}/api/admin/cash`, { headers: admin })).json() } });
});

test('Barista opens the camera only on demand and stops it when leaving the scanner', async () => {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const context = await browser.newContext({ permissions: ['camera'] }); const page = await context.newPage();
  try {
    await staffLogin(page);
    await expect(page.locator('video')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cupones', exact: true }).click();
    await page.getByRole('button', { name: 'Escanear QR', exact: true }).click();
    const video = page.getByLabel('Cámara para escanear el QR del cupón');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
    await video.evaluate(element => { (window as unknown as { scanStream: MediaStream }).scanStream = (element as HTMLVideoElement).srcObject as MediaStream; });
    await page.evaluate(() => window.dispatchEvent(new Event('rofe:native-pause')));
    await expect(video).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { scanStream: MediaStream }).scanStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
    await expect(page.getByRole('alert')).toContainText('Escaneo pausado');
  } finally { await context.close(); await browser.close(); }
});
