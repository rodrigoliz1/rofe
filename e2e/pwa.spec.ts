import { expect, test, devices } from '@playwright/test';

test('production manifest and installation resources have valid responses', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await response.json();
  expect(manifest).toMatchObject({ id: '/', start_url: '/kiosk', scope: '/', display: 'standalone', orientation: 'any', prefer_related_applications: false });
  expect(JSON.stringify(manifest)).not.toMatch(/localhost|127\.0\.0\.1|192\.168\.|:5173/);
  for (const icon of manifest.icons as Array<{ src: string; sizes: string; type: string; purpose: string }>) {
    const asset = await request.get(icon.src, { maxRedirects: 0 });
    expect(asset.status()).toBe(200); expect(asset.headers()['content-type']).toContain('image/png');
    const bytes = await asset.body();
    expect(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    expect(icon.sizes).toBe(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`);
  }
  expect((await request.get(manifest.start_url, { maxRedirects: 0 })).status()).toBe(200);
  const worker = await request.get('/sw.js', { maxRedirects: 0 });
  expect(worker.status()).toBe(200); expect(worker.headers()['content-type']).toMatch(/javascript/);
  expect(await worker.text()).not.toContain('__ROFE_');
});

test('Chromium Android parses the manifest and the worker controls kiosk offline', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 1280, height: 800 }, baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' && /manifest|service.?worker|sw\.js|\[ROFÉ PWA\]/i.test(message.text())) errors.push(message.text()); });
    await page.goto('/kiosk');
    await expect(page.locator('[data-kiosk="true"]')).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
    expect(await page.evaluate(() => isSecureContext)).toBe(true); // Loopback exemption only, not a production HTTPS claim.
    const registration = await page.evaluate(async () => ({ scope: (await navigator.serviceWorker.ready).scope, script: navigator.serviceWorker.controller?.scriptURL }));
    expect(registration).toEqual({ scope: 'http://127.0.0.1:4173/', script: 'http://127.0.0.1:4173/sw.js' });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const result = await cdp.send('Page.getAppManifest');
    expect(result.errors).toEqual([]);
    expect(JSON.parse(result.data)).toMatchObject({ start_url: '/kiosk', scope: '/', display: 'standalone' });
    expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('[data-kiosk="true"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Autoriza esta terminal' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('kiosk uses the enrolled POS on cold start even after staff access', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/kiosk');
  await page.getByLabel('Nombre de la terminal').fill('M10 terminal PWA');
  await page.getByLabel('Clave de registro').fill('e2e-device-enrollment-secret');
  await page.getByRole('button', { name: 'Autorizar terminal' }).click();
  await expect(page.getByText('ORDENAR AQUÍ')).toBeVisible();
  await page.getByText('ORDENAR AQUÍ').click();
  await expect(page.getByRole('heading', { name: 'MENÚ', exact: true })).toBeVisible();
  await page.getByTitle('Panel Barista').click();
  await page.getByLabel('Correo').fill('admin@rofe.test');
  await page.getByLabel('Contraseña o PIN').fill('TestAdmin123!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ROFE Admin' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('ORDENAR AQUÍ')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ROFE Admin' })).toHaveCount(0);
});
