import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/*
 * Cash collection by tapping bills/coins, insufficient change → change voucher (QR + code),
 * voucher used in checkout, released on cancellation, paid out in cash, and a cash closing
 * that still balances to zero. One deterministic drawer for the whole scenario.
 */
const API = 'http://127.0.0.1:3100';

async function token(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API}/api/auth/login`, { data: { email, password } });
  expect(response.status()).toBe(200);
  return { Authorization: `Bearer ${(await response.json()).accessToken as string}` };
}

async function deviceHeaders(request: APIRequestContext, name: string) {
  const device = await (await request.post(`${API}/api/auth/device/register`, { data: { name, enrollmentSecret: 'e2e-device-enrollment-secret' } })).json() as { deviceId: string; deviceToken: string };
  const login = await request.post(`${API}/api/auth/device/login`, { data: device });
  return { Authorization: `Bearer ${(await login.json()).accessToken as string}` };
}

async function cashOrder(request: APIRequestContext, headers: Record<string, string>, productId: string, extra: Record<string, unknown> = {}) {
  const response = await request.post(`${API}/api/orders`, { headers, data: { operationId: crypto.randomUUID(), customerName: 'Cliente cupón', paymentMethod: 'cash', items: [{ productId, quantity: 1 }], ...extra } });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).order as { id: string; total: number; discount?: number };
}

async function authorizeDevice(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Nombre de la terminal').fill(name);
  await page.getByLabel('Clave de registro').fill('e2e-device-enrollment-secret');
  await page.getByRole('button', { name: 'Autorizar terminal' }).click();
  await expect(page.getByText('ORDENAR AQUÍ')).toBeVisible();
}

test('insufficient change issues a voucher that can be used, released and paid out — and the drawer still balances', async ({ page, request }) => {
  const admin = await token(request, 'admin@rofe.test', 'TestAdmin123!');
  const barista = await token(request, 'barista@rofe.test', '12345678');
  // A known drawer: $20 bill + $10 coin = $30 of change available.
  const current = (await (await request.get(`${API}/api/admin/cash/session`, { headers: admin })).json()) as { current?: { id: string } };
  if (current.current) {
    const drawer = await (await request.get(`${API}/api/cash/denominations`, { headers: admin })).json() as Record<string, number>;
    expect((await request.post(`${API}/api/admin/cash/session/close`, { headers: admin, data: { denominations: drawer } })).status()).toBe(200);
  }
  expect((await request.post(`${API}/api/admin/cash/session/open`, { headers: admin, data: { denominations: { bill_20: 1, coin_10: 1 } } })).status()).toBe(201);
  const device = await deviceHeaders(request, 'Caja cupones E2E');
  const order = await cashOrder(request, device, 'americano'); // $45

  // Barista collects by tapping: no keyboard.
  await authorizeDevice(page, 'iPad cupones');
  await page.getByTitle('Panel Barista').click();
  await page.getByLabel('Correo').fill('barista@rofe.test');
  await page.getByLabel('Contraseña o PIN').fill('12345678');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.locator('.barista-order-card', { hasText: 'Cliente cupón' }).getByRole('button', { name: 'COBRAR' }).click();
  const panel = page.getByRole('region', { name: 'Pago en efectivo' });
  // Summary and Cobrar/Cerrar sit above the bills.
  const chargeBox = (await panel.getByRole('button', { name: 'Cobrar' }).boundingBox())!;
  const firstTile = (await panel.locator('.cash-tile').first().boundingBox())!;
  expect(chargeBox.y).toBeLessThan(firstTile.y);
  await expect(panel.locator('input')).toHaveCount(0);
  // Anywhere on the tile adds one; "−" appears beside it and removes one.
  const fifty = panel.getByRole('button', { name: /Billete de \$50: \d+ recibidos/ });
  await fifty.click({ position: { x: 10, y: 10 } });
  await fifty.click();
  await expect(panel.getByTestId('cash-received')).toHaveText('$100.00');
  await panel.getByRole('button', { name: 'Quitar un billete de $50' }).click();
  await panel.getByRole('button', { name: 'Quitar un billete de $50' }).click();
  await expect(panel.getByRole('button', { name: 'Quitar un billete de $50' })).toHaveCount(0);
  await panel.getByRole('button', { name: /Billete de \$100: 0 recibidos/ }).click();
  await expect(panel.getByTestId('cash-received')).toHaveText('$100.00');
  await expect(panel.getByTestId('cash-change')).toHaveText('$55.00');
  await panel.getByRole('button', { name: 'Cobrar' }).click();

  // $55 of change, but the drawer can only give $30.
  const insufficient = page.getByRole('alertdialog', { name: 'Cambio insuficiente en caja' });
  await expect(insufficient).toBeVisible();
  await expect(insufficient).toContainText('Faltan $25.00');
  await expect(insufficient.getByRole('button', { name: 'Cancelar transacción' })).toBeVisible();
  await insufficient.getByRole('button', { name: 'Emitir cupón por $25.00' }).click();
  const ticket = page.getByRole('region', { name: 'Cupón de cambio emitido' });
  await expect(ticket).toContainText('Entrega al cliente $30.00');
  await expect(ticket).toContainText('$25.00 MXN');
  await expect(ticket.getByRole('img', { name: /Código QR del cupón/ }).locator('svg')).toBeVisible();
  const code = (await ticket.locator('.cash-voucher-code').textContent())!.trim();
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$/);
  await ticket.getByRole('button', { name: /Listo/ }).click();

  const lookup = async () => (await (await request.get(`${API}/api/vouchers/${code}`, { headers: barista })).json()).voucher as { balance: number; status: string };
  expect(await lookup()).toMatchObject({ balance: 25, status: 'ACTIVE' });
  const paidOrder = (await (await request.get(`${API}/api/orders/${order.id}`, { headers: barista })).json()) as { paymentStatus: string };
  expect(paidOrder.paymentStatus).toBe('APPROVED');
  // Lower-case, without dashes, as a customer would type it.
  expect((await request.get(`${API}/api/vouchers/${code.replaceAll('-', '').toLowerCase()}`, { headers: device })).status()).toBe(200);
  expect((await request.get(`${API}/api/vouchers/ZZZZ-ZZZZ-ZZ`, { headers: device })).status()).toBe(404);

  // The customer uses it on a new order: $25 off a $45 croissant.
  const withVoucher = await cashOrder(request, device, 'croissant-mantequilla', { voucherCode: code });
  expect(withVoucher).toMatchObject({ total: 20, discount: 25 });
  expect(await lookup()).toMatchObject({ balance: 0, status: 'REDEEMED' });
  expect((await request.post(`${API}/api/orders`, { headers: device, data: { operationId: crypto.randomUUID(), paymentMethod: 'cash', items: [{ productId: 'espresso', quantity: 1 }], voucherCode: code } })).status()).toBe(409);
  // That order is cancelled (customer changed their mind): the balance comes back once.
  expect((await request.post(`${API}/api/orders/${withVoucher.id}/cancel-insufficient-change`, { headers: barista })).status()).toBe(200);
  expect((await request.post(`${API}/api/orders/${withVoucher.id}/cancel-insufficient-change`, { headers: barista })).status()).toBe(200);
  expect(await lookup()).toMatchObject({ balance: 25, status: 'ACTIVE' });

  // Barista → Cupones: the drawer has only the $100 bill, so it cannot pay $25 yet.
  await page.getByRole('button', { name: 'Cupones' }).click();
  await page.getByLabel('Código del cupón').fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByTestId('voucher-card')).toContainText('$25.00 MXN');
  await expect(page.getByRole('alert').filter({ hasText: 'Cambio insuficiente en caja' })).toBeVisible();

  // An exact $38 cash sale brings $20, $10, $5, $2 and $1 into the drawer.
  const espresso = await cashOrder(request, device, 'espresso');
  expect((await request.post(`${API}/api/orders/${espresso.id}/cash-payment`, { headers: barista, data: { receivedDenominations: { bill_20: 1, coin_10: 1, coin_5: 1, coin_2: 1, coin_1: 1 }, changeDenominations: {}, receivedAmount: 38, changeAmount: 0 } })).status()).toBe(200);
  await page.getByRole('button', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Cupones' }).click();
  await page.getByLabel('Código del cupón').fill(code);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('button', { name: 'Entregar $25.00 en efectivo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'El cupón quedó utilizado' })).toBeVisible();
  expect(await lookup()).toMatchObject({ balance: 0, status: 'REDEEMED' });
  // A second payout is refused.
  expect((await request.post(`${API}/api/vouchers/${code}/redeem-cash`, { headers: barista, data: { operationId: crypto.randomUUID(), denominations: { bill_20: 1, coin_5: 1 } } })).status()).toBe(409);

  // Cash closing: 30 opening + 100 received − 30 change + 38 sale − 25 voucher payout = 113.
  const drawer = await (await request.get(`${API}/api/cash/denominations`, { headers: admin })).json() as Record<string, number>;
  const closed = await request.post(`${API}/api/admin/cash/session/close`, { headers: admin, data: { denominations: drawer } });
  expect(closed.status()).toBe(200);
  expect(await closed.json()).toMatchObject({ expectedCash: 113, countedCash: 113, difference: 0 });
});

test('the customer can cancel when there is not enough change, and nothing is charged', async ({ request }) => {
  const admin = await token(request, 'admin@rofe.test', 'TestAdmin123!');
  const barista = await token(request, 'barista@rofe.test', '12345678');
  const current = (await (await request.get(`${API}/api/admin/cash/session`, { headers: admin })).json()) as { current?: { id: string } };
  if (!current.current) expect((await request.post(`${API}/api/admin/cash/session/open`, { headers: admin, data: { denominations: {} } })).status()).toBe(201);
  const device = await deviceHeaders(request, 'Caja cancelar E2E');
  const order = await cashOrder(request, device, 'latte');
  const cancelled = await request.post(`${API}/api/orders/${order.id}/cancel-insufficient-change`, { headers: barista });
  expect(cancelled.status()).toBe(200);
  expect((await cancelled.json()).order).toMatchObject({ status: 'CANCELLED' });
  // A paid order can never be cancelled this way, and a POS device cannot use it.
  const paid = await cashOrder(request, device, 'espresso');
  await request.post(`${API}/api/orders/${paid.id}/cash-payment`, { headers: barista, data: { receivedDenominations: { bill_20: 1, coin_10: 1, coin_5: 1, coin_2: 1, coin_1: 1 }, changeDenominations: {}, receivedAmount: 38, changeAmount: 0 } });
  expect((await request.post(`${API}/api/orders/${paid.id}/cancel-insufficient-change`, { headers: barista })).status()).toBe(409);
  expect((await request.post(`${API}/api/orders/${paid.id}/cancel-insufficient-change`, { headers: device })).status()).toBe(403);
});

test('a voucher in checkout lowers the total, and one that covers everything confirms the order', async ({ page, request }) => {
  const admin = await token(request, 'admin@rofe.test', 'TestAdmin123!');
  const barista = await token(request, 'barista@rofe.test', '12345678');
  const current = (await (await request.get(`${API}/api/admin/cash/session`, { headers: admin })).json()) as { current?: { id: string } };
  if (current.current) {
    const drawer = await (await request.get(`${API}/api/cash/denominations`, { headers: admin })).json() as Record<string, number>;
    await request.post(`${API}/api/admin/cash/session/close`, { headers: admin, data: { denominations: drawer } });
  }
  await request.post(`${API}/api/admin/cash/session/open`, { headers: admin, data: { denominations: {} } });
  const device = await deviceHeaders(request, 'Caja checkout cupón E2E');
  // $1000 for a $45 americano with an empty drawer → a $955 voucher.
  const sale = await cashOrder(request, device, 'americano');
  const issued = await request.post(`${API}/api/orders/${sale.id}/cash-payment`, { headers: barista, data: { receivedDenominations: { bill_1000: 1 }, changeDenominations: {}, receivedAmount: 1000, changeAmount: 0, voucherAmount: 955 } });
  expect(issued.status()).toBe(200);
  const voucher = (await issued.json()).voucher as { code: string; amount: number; qr: string };
  expect(voucher).toMatchObject({ amount: 955, qr: `ROFE-VALE:${voucher.code}` });

  await authorizeDevice(page, 'iPad checkout cupón');
  await page.getByText('ORDENAR AQUÍ').click();
  await page.getByRole('button', { name: /Croissant/ }).click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await page.getByRole('button', { name: /CONTINUAR AL PAGO/ }).click();
  await page.getByPlaceholder('Ingresa tu nombre...').fill('Cupón total');
  await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click();
  await page.getByRole('button', { name: '¿Tienes un cupón de cambio?' }).click();
  await page.getByLabel('Código del cupón').fill('ZZZZ-ZZZZ-ZZ');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No encontramos ese cupón' })).toBeVisible();
  await page.getByLabel('Código del cupón').fill(voucher.code);
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Cupón ${voucher.code}` })).toContainText('−$45.00');
  await expect(page.getByRole('heading', { name: 'Tu cupón cubre el pedido' })).toBeVisible();
  await page.getByRole('button', { name: 'CONFIRMAR PEDIDO' }).click();
  await expect(page.getByRole('heading', { name: 'PAGO APROBADO' })).toBeVisible();
  const after = (await (await request.get(`${API}/api/vouchers/${voucher.code}`, { headers: barista })).json()).voucher as { balance: number; status: string };
  expect(after).toMatchObject({ balance: 910, status: 'ACTIVE' });
});
