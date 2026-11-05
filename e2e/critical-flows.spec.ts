import { expect, test, type Page } from '@playwright/test';

async function authorizeDevice(page: Page, name: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Autoriza esta terminal' })).toBeVisible();
  await page.getByLabel('Nombre de la terminal').fill(name);
  await page.getByLabel('Clave de registro').fill('e2e-device-enrollment-secret');
  await page.getByRole('button', { name: 'Autorizar terminal' }).click();
  await expect(page.getByText('ORDENAR AQUÍ')).toBeVisible();
}

async function staffLogin(page: Page, email: string, password: string) {
  await page.getByTitle('Panel Barista').click();
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña o PIN').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

test('POS card mock → KDS prepare → ready → delivered', async ({ page }) => {
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = function () { (window as Window & { playedAudio?: string[] }).playedAudio ??= []; (window as Window & { playedAudio: string[] }).playedAudio.push(this.currentSrc || this.getAttribute('src') || ''); return Promise.resolve(); }; });
  await authorizeDevice(page, 'iPad E2E caja');
  await page.getByText('ORDENAR AQUÍ').click();
  await page.getByRole('button', { name: /Latte.*55\.00/s }).click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await page.getByRole('button', { name: /CONTINUAR AL PAGO/ }).click();
  await page.getByPlaceholder('Ingresa tu nombre...').fill('Prueba KDS');
  await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click();
  await page.getByRole('button', { name: /TARJETA DE DÉBITO/ }).click();
  await page.getByRole('button', { name: 'Simular Pago Exitoso' }).click();
  await expect(page.getByRole('heading', { name: 'PAGO APROBADO' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { playedAudio?: string[] }).playedAudio?.filter((src) => src.includes('exito')).length)).toBe(1);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'PAGO APROBADO' })).toBeVisible();
  await page.getByRole('button', { name: 'Entendido' }).click();
  await expect(page.getByText('ORDENAR AQUÍ')).toBeVisible();
  await staffLogin(page, 'barista@rofe.test', '12345678');
  await expect(page.getByRole('heading', { name: /Pendientes 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'ACEPTAR' }).click();
  await expect(page.getByRole('heading', { name: /En Preparación 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'LISTO' }).click();
  await expect(page.getByRole('heading', { name: /Listos 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'ENTREGAR' }).click();
  await expect(page.getByRole('heading', { name: /Listos 0/ })).toBeVisible();
});

test('payment error displays failure feedback and plays its sound', async ({ page }) => {
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = function () { (window as Window & { playedAudio?: string[] }).playedAudio ??= []; (window as Window & { playedAudio: string[] }).playedAudio.push(this.currentSrc || this.getAttribute('src') || ''); return Promise.resolve(); }; });
  await authorizeDevice(page, 'iPad E2E error');
  await page.getByText('ORDENAR AQUÍ').click();
  await page.getByRole('button', { name: /Latte.*55\.00/s }).click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await page.getByRole('button', { name: /CONTINUAR AL PAGO/ }).click();
  await page.getByPlaceholder('Ingresa tu nombre...').fill('Prueba');
  await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click();
  await page.route('**/api/orders', (route) => route.fulfill({ status: 503, json: { error: { message: 'No se pudo iniciar el pago.' } } }));
  await page.getByRole('button', { name: /TARJETA DE DÉBITO/ }).click();
  await expect(page.getByRole('heading', { name: 'No pudimos completar el pago' })).toBeVisible();
  await expect(page.locator('.payment-outcome-icon--failure')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { playedAudio?: string[] }).playedAudio?.filter((src) => src.includes('fallido')).length)).toBe(1);
});

test('admin login is server-authenticated and renders the application shell', async ({ page }) => {
  await authorizeDevice(page, 'iPad E2E admin');
  await staffLogin(page, 'admin@rofe.test', 'TestAdmin123!');
  await expect(page.getByRole('heading', { name: 'ROFE Admin' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dashboard/ })).toBeVisible();
  await expect(page.getByText('Ventas hoy', { exact: true })).toBeVisible();
});

test('all catalog keeps product prices on the same baseline', async ({ page }) => {
  await authorizeDevice(page, 'iPad E2E catalog alignment');
  await page.getByText('ORDENAR AQUÍ').click();
  const pricePositions = await page.locator('.product-card').evaluateAll((cards) => {
    const firstRowY = cards[0]!.getBoundingClientRect().y;
    return cards
      .filter((card) => Math.abs(card.getBoundingClientRect().y - firstRowY) < 1)
      .map((card) => card.querySelector('.product-card-price')!.getBoundingClientRect().y);
  });
  expect(Math.max(...pricePositions) - Math.min(...pricePositions)).toBeLessThanOrEqual(1);
});

test('device setup explains when the development API proxy has no backend', async ({ page }) => {
  await page.route('**/api/auth/device/register', (route) => route.fulfill({
    status: 500,
    contentType: 'text/html',
    body: 'http proxy error',
  }));
  await page.goto('/');
  const setup = page.getByRole('region', { name: 'Autoriza esta terminal' });
  await expect(setup.getByLabel('Nombre de la terminal')).toBeVisible();
  await expect(setup.getByLabel('Clave de registro')).toBeVisible();
  await setup.getByLabel('Clave de registro').fill('e2e-device-enrollment-secret');
  await setup.getByRole('button', { name: 'Autorizar terminal' }).click();
  await expect(setup.getByRole('alert')).toHaveText('El servidor de ROFÉ no respondió. Inicia el backend y vuelve a intentarlo.');
});

test('an authorized kiosk offers connection recovery when the backend returns an error', async ({ page }) => {
  await authorizeDevice(page, 'Terminal recuperación');
  await page.route('**/api/auth/device/login', (route) => route.fulfill({ status: 502, body: 'proxy unavailable' }));
  await page.goto('/kiosk');
  await expect(page.getByRole('heading', { name: 'No pudimos conectar la terminal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Autoriza esta terminal' })).toHaveCount(0);
  await page.unroute('**/api/auth/device/login');
  await page.getByRole('button', { name: 'Reintentar conexión' }).click();
  await expect(page.getByText('ORDENAR AQUÍ')).toBeVisible();
});

test('anonymous clients cannot read admin APIs', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3100/api/admin/metrics');
  expect(response.status()).toBe(401);
});

test('barista cannot access admin and POS cannot manipulate prices or duplicate an operation', async ({ request }) => {
  const staffLogin = await request.post('http://127.0.0.1:3100/api/auth/login', { data: { email: 'barista@rofe.test', password: '12345678' } });
  const staffToken = (await staffLogin.json()).accessToken as string;
  expect((await request.get('http://127.0.0.1:3100/api/admin/metrics', { headers: { Authorization: `Bearer ${staffToken}` } })).status()).toBe(403);

  const registration = await request.post('http://127.0.0.1:3100/api/auth/device/register', { data: { name: 'API security test', enrollmentSecret: 'e2e-device-enrollment-secret' } });
  const device = await registration.json() as { deviceId: string; deviceToken: string };
  const deviceLogin = await request.post('http://127.0.0.1:3100/api/auth/device/login', { data: device });
  const deviceToken = (await deviceLogin.json()).accessToken as string;
  const operationId = crypto.randomUUID();
  const payload = { operationId, customerName: 'Precio seguro', paymentMethod: 'cash', total: 0.01, items: [{ productId: 'latte', quantity: 1 }] };
  const [first, second] = await Promise.all([
    request.post('http://127.0.0.1:3100/api/orders', { headers: { Authorization: `Bearer ${deviceToken}` }, data: payload }),
    request.post('http://127.0.0.1:3100/api/orders', { headers: { Authorization: `Bearer ${deviceToken}` }, data: payload }),
  ]);
  const firstBody = await first.json();
  const secondBody = await second.json();
  expect([first.status(), second.status()].sort()).toEqual([200, 201]);
  expect(firstBody.order.total).toBe(55);
  expect(firstBody.order.id).toBe(secondBody.order.id);
  expect(firstBody.idempotentReplay || secondBody.idempotentReplay).toBe(true);
});

test('cash order survives offline → online outbox synchronization', async ({ page, context }) => {
  await authorizeDevice(page, 'iPad E2E offline');
  await page.getByText('ORDENAR AQUÍ').click();
  await page.getByRole('button', { name: /Latte.*55\.00/s }).click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await page.getByRole('button', { name: /CONTINUAR AL PAGO/ }).click();
  await page.getByPlaceholder('Ingresa tu nombre...').fill('Prueba sin red');
  await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: /PAGO EN EFECTIVO/ }).click();
  await expect(page.getByRole('heading', { name: 'PEDIDO REGISTRADO' })).toBeVisible();

  const sync = page.waitForResponse((response) => response.url().endsWith('/api/orders/sync') && response.ok());
  await context.setOffline(false);
  await sync;
  await page.getByRole('button', { name: 'Listo, tomé foto' }).click();
  await page.reload();
  await staffLogin(page, 'barista@rofe.test', '12345678');
  await expect(page.getByText('Prueba sin red')).toBeVisible();
});

test('admin records an idempotent purchase and an auditable waste movement', async ({ request }) => {
  const login = await request.post('http://127.0.0.1:3100/api/auth/login', { data: { email: 'admin@rofe.test', password: 'TestAdmin123!' } });
  const token = (await login.json()).accessToken as string;
  const headers = { Authorization: `Bearer ${token}` };
  const before = await (await request.get('http://127.0.0.1:3100/api/admin/raw-inventory', { headers })).json() as Array<{ id: string; stock: number }>;
  const initialStock = before.find((item) => item.id === 'coffee_beans')!.stock;

  const supplierResponse = await request.post('http://127.0.0.1:3100/api/admin/suppliers', { headers, data: { name: 'Café de prueba', contactName: 'Calidad E2E' } });
  expect(supplierResponse.status()).toBe(201);
  const supplier = await supplierResponse.json() as { id: string };
  const operationId = crypto.randomUUID();
  const purchasePayload = { operationId, supplierId: supplier.id, paymentMethod: 'transfer', invoiceReference: 'E2E-001', items: [{ ingredientId: 'coffee_beans', quantity: 100, unitCost: 0.5 }] };
  const purchase = await request.post('http://127.0.0.1:3100/api/admin/purchases', { headers, data: purchasePayload });
  const purchaseReplay = await request.post('http://127.0.0.1:3100/api/admin/purchases', { headers, data: purchasePayload });
  expect(purchase.status()).toBe(201);
  expect(purchaseReplay.status()).toBe(200);
  expect((await purchaseReplay.json()).idempotentReplay).toBe(true);

  const waste = await request.post('http://127.0.0.1:3100/api/admin/waste', { headers, data: { operationId: crypto.randomUUID(), ingredientId: 'coffee_beans', quantity: 10, reason: 'Calibración del molino E2E' } });
  expect(waste.status()).toBe(201);
  const after = await (await request.get('http://127.0.0.1:3100/api/admin/raw-inventory', { headers })).json() as Array<{ id: string; stock: number }>;
  expect(after.find((item) => item.id === 'coffee_beans')!.stock).toBe(initialStock + 90);
  const movements = await (await request.get('http://127.0.0.1:3100/api/admin/inventory-movements', { headers })).json() as Array<{ movementType: string }>;
  expect(movements.map((entry) => entry.movementType)).toEqual(expect.arrayContaining(['PURCHASE', 'WASTE']));
});

test('manager-authorized discount is bound to one operation and inventory operations are idempotent', async ({ request }) => {
  const login = await request.post('http://127.0.0.1:3100/api/auth/login', { data: { email: 'admin@rofe.test', password: 'TestAdmin123!' } });
  const adminToken = (await login.json()).accessToken as string;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const operationId = crypto.randomUUID();
  const registration = await request.post('http://127.0.0.1:3100/api/auth/device/register', { data: { name: 'Caja descuento E2E', enrollmentSecret: 'e2e-device-enrollment-secret' } });
  const device = await registration.json() as { deviceId: string; deviceToken: string };
  const deviceLogin = await request.post('http://127.0.0.1:3100/api/auth/device/login', { data: device });
  const deviceToken = (await deviceLogin.json()).accessToken as string;
  const deviceHeaders = { Authorization: `Bearer ${deviceToken}` };
  const authorization = await request.post('http://127.0.0.1:3100/api/orders/discount-authorization', {
    headers: deviceHeaders,
    data: { operationId, type: 'PERCENTAGE', value: 10, reason: 'Promoción autorizada E2E', email: 'admin@rofe.test', password: 'TestAdmin123!' },
  });
  expect(authorization.status()).toBe(201);
  const discountAuthorizationToken = (await authorization.json()).token as string;
  const discounted = await request.post('http://127.0.0.1:3100/api/orders', {
    headers: deviceHeaders,
    data: { operationId, customerName: 'Descuento E2E', paymentMethod: 'cash', discountAuthorizationToken, items: [{ productId: 'latte', quantity: 1 }] },
  });
  expect(discounted.status()).toBe(201);
  expect((await discounted.json()).order).toMatchObject({ subtotal: 55, discount: 5.5, total: 49.5, discountReason: 'Promoción autorizada E2E' });
  const mismatched = await request.post('http://127.0.0.1:3100/api/orders', {
    headers: deviceHeaders,
    data: { operationId: crypto.randomUUID(), customerName: 'Token ajeno', paymentMethod: 'cash', discountAuthorizationToken, items: [{ productId: 'latte', quantity: 1 }] },
  });
  expect(mismatched.status()).toBe(403);

  const beforeAdjustment = await (await request.get('http://127.0.0.1:3100/api/admin/raw-inventory', { headers: adminHeaders })).json() as Array<{ id: string; stock: number; cost: number }>;
  const coffee = beforeAdjustment.find((item) => item.id === 'coffee_beans')!;
  const adjustmentId = crypto.randomUUID();
  const adjustmentPayload = { stock: coffee.stock + 5, cost: coffee.cost + 2.5, reason: 'Conteo físico de control E2E', operationId: adjustmentId };
  expect((await request.post('http://127.0.0.1:3100/api/admin/raw-inventory/coffee_beans/adjust', { headers: adminHeaders, data: adjustmentPayload })).status()).toBe(200);
  const adjustmentReplay = await request.post('http://127.0.0.1:3100/api/admin/raw-inventory/coffee_beans/adjust', { headers: adminHeaders, data: adjustmentPayload });
  expect((await adjustmentReplay.json()).idempotentReplay).toBe(true);

  const beforeProduction = await (await request.get('http://127.0.0.1:3100/api/admin/raw-inventory', { headers: adminHeaders })).json() as Array<{ id: string; stock: number }>;
  const productionId = crypto.randomUUID();
  const productionPayload = { operationId: productionId, productId: 'latte', quantityProduced: 2, wasteQuantity: 0 };
  expect((await request.post('http://127.0.0.1:3100/api/admin/production', { headers: adminHeaders, data: productionPayload })).status()).toBe(201);
  const productionReplay = await request.post('http://127.0.0.1:3100/api/admin/production', { headers: adminHeaders, data: productionPayload });
  expect((await productionReplay.json()).idempotentReplay).toBe(true);
  const afterProduction = await (await request.get('http://127.0.0.1:3100/api/admin/raw-inventory', { headers: adminHeaders })).json() as Array<{ id: string; stock: number }>;
  expect(afterProduction.find((item) => item.id === 'coffee_beans')!.stock).toBeLessThan(beforeProduction.find((item) => item.id === 'coffee_beans')!.stock);
});

test('cash session opens, receives a sale and closes with zero difference', async ({ request }) => {
  const adminLogin = await request.post('http://127.0.0.1:3100/api/auth/login', { data: { email: 'admin@rofe.test', password: 'TestAdmin123!' } });
  const adminToken = (await adminLogin.json()).accessToken as string;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const opened = await request.post('http://127.0.0.1:3100/api/admin/cash/session/open', { headers: adminHeaders, data: { denominations: { bill_100: 1 } } });
  expect(opened.status()).toBe(201);

  const registration = await request.post('http://127.0.0.1:3100/api/auth/device/register', { data: { name: 'Caja cash E2E', enrollmentSecret: 'e2e-device-enrollment-secret' } });
  const device = await registration.json() as { deviceId: string; deviceToken: string };
  const deviceLogin = await request.post('http://127.0.0.1:3100/api/auth/device/login', { data: device });
  const deviceToken = (await deviceLogin.json()).accessToken as string;
  const orderResponse = await request.post('http://127.0.0.1:3100/api/orders', { headers: { Authorization: `Bearer ${deviceToken}` }, data: { operationId: crypto.randomUUID(), customerName: 'Efectivo E2E', paymentMethod: 'cash', items: [{ productId: 'latte', quantity: 1 }] } });
  const order = (await orderResponse.json()).order as { id: string };

  const baristaLogin = await request.post('http://127.0.0.1:3100/api/auth/login', { data: { email: 'barista@rofe.test', password: '12345678' } });
  const baristaToken = (await baristaLogin.json()).accessToken as string;
  const paid = await request.post(`http://127.0.0.1:3100/api/orders/${order.id}/cash-payment`, {
    headers: { Authorization: `Bearer ${baristaToken}` },
    data: { receivedDenominations: { bill_50: 1, coin_5: 1 }, changeDenominations: {}, receivedAmount: 55, changeAmount: 0 },
  });
  expect(paid.status()).toBe(200);
  expect((await paid.json()).order.paymentStatus).toBe('APPROVED');

  const closed = await request.post('http://127.0.0.1:3100/api/admin/cash/session/close', { headers: adminHeaders, data: { denominations: { bill_100: 1, bill_50: 1, coin_5: 1 } } });
  expect(closed.status()).toBe(200);
  expect(await closed.json()).toMatchObject({ expectedCash: 155, countedCash: 155, difference: 0 });
});

test('admin manages a user and deactivation revokes active sessions', async ({ request }) => {
  const adminLogin = await request.post('http://127.0.0.1:3100/api/auth/login', { data: { email: 'admin@rofe.test', password: 'TestAdmin123!' } });
  const adminToken = (await adminLogin.json()).accessToken as string;
  const headers = { Authorization: `Bearer ${adminToken}` };
  const email = 'turno.e2e@rofe.test';
  const created = await request.post('http://127.0.0.1:3100/api/admin/users', { headers, data: { email, password: 'BaristaE2E!2026', role: 'BARISTA' } });
  expect(created.status()).toBe(201);
  const staffLogin = await request.post('http://127.0.0.1:3100/api/auth/login', { data: { email, password: 'BaristaE2E!2026' } });
  const staffToken = (await staffLogin.json()).accessToken as string;
  expect((await request.get('http://127.0.0.1:3100/api/orders', { headers: { Authorization: `Bearer ${staffToken}` } })).status()).toBe(200);
  expect((await request.get('http://127.0.0.1:3100/api/admin/users', { headers: { Authorization: `Bearer ${staffToken}` } })).status()).toBe(403);
  expect((await request.patch(`http://127.0.0.1:3100/api/admin/users/${encodeURIComponent(email)}`, { headers, data: { active: false } })).status()).toBe(200);
  expect((await request.get('http://127.0.0.1:3100/api/orders', { headers: { Authorization: `Bearer ${staffToken}` } })).status()).toBe(401);
});

test('admin refunds a paid card mock idempotently and restores inventory', async ({ request }) => {
  const login = await request.post('http://127.0.0.1:3100/api/auth/login', { data: { email: 'admin@rofe.test', password: 'TestAdmin123!' } });
  const token = (await login.json()).accessToken as string;
  const headers = { Authorization: `Bearer ${token}` };
  const orders = await (await request.get('http://127.0.0.1:3100/api/orders', { headers })).json() as Array<{ id: string; customerName: string; status: string }>;
  const order = orders.find((entry) => entry.customerName === 'Prueba KDS')!;
  const operationId = crypto.randomUUID();
  const payload = { operationId, reason: 'Devolución completa de prueba E2E' };
  const refunded = await request.post(`http://127.0.0.1:3100/api/orders/${order.id}/refund`, { headers, data: payload });
  const replay = await request.post(`http://127.0.0.1:3100/api/orders/${order.id}/refund`, { headers, data: payload });
  expect(refunded.status()).toBe(200);
  expect((await refunded.json()).order).toMatchObject({ status: 'REFUNDED', paymentStatus: 'REFUNDED' });
  expect((await replay.json()).idempotentReplay).toBe(true);
  const movements = await (await request.get('http://127.0.0.1:3100/api/admin/inventory-movements', { headers })).json() as Array<{ orderId?: string; movementType: string }>;
  expect(movements.some((entry) => entry.orderId === order.id && entry.movementType === 'RETURN')).toBe(true);
});

test('POS remains usable in iPad portrait', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await authorizeDevice(page, 'iPad E2E portrait');
  await page.getByText('ORDENAR AQUÍ').click();
  await expect(page.getByRole('heading', { name: 'MENÚ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'TU PEDIDO' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('pos-ipad-portrait.png'), fullPage: true });
});

test('a server rejection never becomes an offline cash order', async ({ page }) => {
  await authorizeDevice(page, 'Caja validación');
  await page.getByText('ORDENAR AQUÍ').click();
  await page.getByRole('button', { name: /Latte.*55\.00/s }).click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await page.getByRole('button', { name: /CONTINUAR AL PAGO/ }).click();
  await page.getByLabel('Tu nombre').fill('Validación');
  await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click();
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { message: 'No hay inventario suficiente.' } }) });
    else await route.continue();
  });
  await page.getByRole('button', { name: /PAGO EN EFECTIVO/ }).click();
  await expect(page.getByRole('alert')).toContainText('No hay inventario suficiente.');
  await expect(page.getByRole('heading', { name: 'PEDIDO REGISTRADO' })).not.toBeVisible();
  const queued = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('rofe-pos'); request.onsuccess = () => resolve(request.result); });
    return new Promise<number>((resolve) => { const request = db.transaction('outbox').objectStore('outbox').count(); request.onsuccess = () => { db.close(); resolve(request.result); }; });
  });
  expect(queued).toBe(0);
});

test('pending payment recovers after reload without sending a second charge', async ({ page }) => {
  await authorizeDevice(page, 'Caja recuperación');
  await page.route('**/api/events', (route) => route.abort());
  await page.getByText('ORDENAR AQUÍ').click();
  await page.getByRole('button', { name: /Latte.*55\.00/s }).click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await page.getByRole('button', { name: /CONTINUAR AL PAGO/ }).click();
  await page.getByLabel('Tu nombre').fill('Recuperación');
  await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click();
  let submissions = 0;
  page.on('request', (request) => { if (request.url().endsWith('/api/orders') && request.method() === 'POST') submissions += 1; });
  const creation = page.waitForResponse((response) => response.url().endsWith('/api/orders') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /TARJETA DE DÉBITO/ }).click();
  const response = await creation;
  const { order } = await response.json();
  const restoration = page.waitForResponse((response) => response.url().endsWith('/api/auth/refresh') && response.ok());
  await page.reload();
  const authorization = `Bearer ${((await (await restoration).json()) as { accessToken: string }).accessToken}`;
  await expect(page.getByRole('heading', { name: 'Continúa en la terminal' })).toBeVisible();
  await page.request.post(`http://127.0.0.1:3100/api/orders/${order.id}/simulate-payment`, { headers: { Authorization: authorization } });
  await expect(page.getByRole('heading', { name: 'PAGO APROBADO' })).toBeVisible();
  expect(submissions).toBe(1);
  await page.getByRole('button', { name: 'Entendido' }).click();
});

test('product editor creates, updates and removes a product through the real API', async ({ page }) => {
  await authorizeDevice(page, 'Caja catálogo');
  await staffLogin(page, 'admin@rofe.test', 'TestAdmin123!');
  await page.getByRole('button', { name: 'Productos', exact: true }).click();
  await page.getByRole('button', { name: '+ Nuevo Producto' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Bebida verificación');
  await page.getByLabel('Precio Base ($)', { exact: true }).fill('42.50');
  await page.locator('input[type="file"]').setInputFiles('public/icon-192.png');
  await page.getByRole('button', { name: 'Guardar Cambios' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Bebida verificación', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar Productos' }).click();
  await page.locator('.product-admin-card').filter({ hasText: 'Bebida verificación' }).getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByLabel('Precio Base ($)', { exact: true }).fill('43.50');
  const update = page.waitForResponse((response) => response.url().includes('/api/products/') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Guardar Cambios' }).click();
  expect((await update).status()).toBe(200);
  await expect(page.locator('.product-admin-card').filter({ hasText: 'Bebida verificación' })).toContainText('$43.50');
  await page.locator('.product-admin-card').filter({ hasText: 'Bebida verificación' }).getByRole('button', { name: 'Editar', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remover Producto' }).click();
  await expect(page.getByText('Bebida verificación', { exact: true })).not.toBeVisible();
});

test('Point configuration reports an honest unavailable state and staff logout restores POS authorization', async ({ page }) => {
  await authorizeDevice(page, 'Caja Point');
  await staffLogin(page, 'admin@rofe.test', 'TestAdmin123!');
  await page.getByRole('button', { name: 'Terminal Point', exact: true }).click();
  await expect(page.getByText('Sin terminal vinculada', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verificar conexión' })).toBeDisabled();
  await page.getByRole('button', { name: /Salir del panel/ }).click();
  await expect(page.getByText('ORDENAR AQUÍ')).toBeVisible();
  await page.getByText('ORDENAR AQUÍ').click();
  await page.getByRole('button', { name: /Latte.*55\.00/s }).click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await page.getByRole('button', { name: /CONTINUAR AL PAGO/ }).click();
  await page.getByLabel('Tu nombre').fill('Sesión POS');
  await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click();
  await page.getByRole('button', { name: /PAGO EN EFECTIVO/ }).click();
  await expect(page.getByRole('heading', { name: 'PEDIDO REGISTRADO' })).toBeVisible();
});

test('installed PWA reloads offline with the saved catalog', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'allow' });
  const page = await context.newPage();
  await authorizeDevice(page, 'Caja PWA');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('ORDENAR AQUÍ')).toBeVisible();
  await page.getByText('ORDENAR AQUÍ').click();
  await expect(page.getByRole('button', { name: /Latte.*55\.00/s })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/Menú guardado en el dispositivo|Sin conexión con el servidor/);
  await context.close();
});

test('layout evidence: desktop, mobile and administration', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await authorizeDevice(page, 'Caja visual');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: test.info().outputPath('welcome-desktop.png') });
  await page.getByText('ORDENAR AQUÍ').click();
  await page.screenshot({ path: test.info().outputPath('pos-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'MENÚ' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('pos-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 960 });
  await staffLogin(page, 'admin@rofe.test', 'TestAdmin123!');
  await expect(page.getByText('Ventas hoy', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('admin-desktop.png') });
  await page.getByRole('button', { name: 'Abastecimiento' }).click();
  await expect(page.getByRole('heading', { name: 'Registrar compra' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('operations-desktop.png') });
  expect(errors).toEqual([]);
});

test('POS can cancel its own pending payment and cannot read another terminal order', async ({ request }) => {
  const enroll = async (name: string) => {
    const device = await (await request.post('http://127.0.0.1:3100/api/auth/device/register', { data: { name, enrollmentSecret: 'e2e-device-enrollment-secret' } })).json();
    return (await (await request.post('http://127.0.0.1:3100/api/auth/device/login', { data: device })).json()).accessToken as string;
  };
  const first = await enroll('Propietario'); const second = await enroll('Otra caja');
  const created = await request.post('http://127.0.0.1:3100/api/orders', { headers: { Authorization: `Bearer ${first}` }, data: { operationId: crypto.randomUUID(), customerName: 'Cancelación', paymentMethod: 'card', items: [{ productId: 'latte', quantity: 1 }] } });
  const { order } = await created.json();
  expect((await request.get(`http://127.0.0.1:3100/api/orders/${order.id}`, { headers: { Authorization: `Bearer ${second}` } })).status()).toBe(404);
  const cancelled = await request.post(`http://127.0.0.1:3100/api/orders/${order.id}/cancel-payment`, { headers: { Authorization: `Bearer ${first}` } });
  expect(cancelled.status()).toBe(200);
  expect((await cancelled.json()).order.status).toBe('CANCELLED');
  const replay = await request.post(`http://127.0.0.1:3100/api/orders/${order.id}/cancel-payment`, { headers: { Authorization: `Bearer ${first}` } });
  expect((await replay.json()).order.status).toBe('CANCELLED');
});

test('cash purchases update drawer and inventory together, and a failed purchase changes neither', async ({ request }) => {
  const session = await (await request.post('http://127.0.0.1:3100/api/auth/login', { data: { email: 'admin@rofe.test', password: 'TestAdmin123!' } })).json();
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  expect((await request.post('http://127.0.0.1:3100/api/admin/cash/session/open', { headers, data: { denominations: { bill_50: 2 } } })).status()).toBe(201);
  const purchase = { operationId: crypto.randomUUID(), paymentMethod: 'cash', cashDenominations: { bill_50: 1 }, items: [{ ingredientId: 'coffee_beans', quantity: 100, unitCost: 0.5 }] };
  expect((await request.post('http://127.0.0.1:3100/api/admin/purchases', { headers, data: purchase })).status()).toBe(201);
  expect((await request.post('http://127.0.0.1:3100/api/admin/purchases', { headers, data: purchase })).status()).toBe(200);
  const register = await (await request.get('http://127.0.0.1:3100/api/admin/cash', { headers })).json();
  expect(register.bill_50).toBe(1);
  const before = await (await request.get('http://127.0.0.1:3100/api/admin/raw-inventory', { headers })).json();
  const rejected = await request.post('http://127.0.0.1:3100/api/admin/purchases', { headers, data: { ...purchase, operationId: crypto.randomUUID(), cashDenominations: { bill_50: 10 }, items: [{ ingredientId: 'coffee_beans', quantity: 1000, unitCost: 0.5 }] } });
  expect(rejected.status()).toBe(409);
  expect(await (await request.get('http://127.0.0.1:3100/api/admin/raw-inventory', { headers })).json()).toEqual(before);
  const closed = await request.post('http://127.0.0.1:3100/api/admin/cash/session/close', { headers, data: { denominations: { bill_50: 1 } } });
  expect(closed.status()).toBe(200);
  expect(await closed.json()).toMatchObject({ expectedCash: 50, countedCash: 50, difference: 0 });
});
