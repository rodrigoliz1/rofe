import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import type { PickupAttempt, PickupMenu, PickupOrder } from '../src/services/pickup';

const evidence = '.impeccable/review';
async function capturePublic(page: Page, name: string) {
  await mkdir(evidence, { recursive: true });
  const style = await page.addStyleTag({ content: '.pickup-app { height: auto; min-height: 100dvh; overflow: visible; } body { overflow: auto; } #root { height: auto; }' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true });
  await style.evaluate((element) => element.remove());
}
test('QR menu is public, usable on phones and honest when Stripe is not configured', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pedir?stand=entrada');
  await expect(page.getByRole('heading', { name: /Tu café,/ })).toBeVisible();
  await expect(page.getByText('Los pedidos en línea están pausados.')).toBeVisible();
  await expect(page.locator('.pickup-product').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Autoriza esta terminal' })).toHaveCount(0);
  await expect(page.locator('.pickup-app')).toHaveJSProperty('scrollWidth', 390);
  const menu = await (await request.get('http://127.0.0.1:3100/api/pickup/menu')).json() as PickupMenu;
  expect(menu.acceptingOrders).toBe(false);
  expect(menu.products[0]).not.toHaveProperty('recipe');
  await page.locator('.pickup-product').filter({ has: page.getByRole('heading', { name: 'Latte', exact: true }) }).click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await page.getByRole('button', { name: /Ver mi pedido/ }).click();
  await expect(page.getByText('Los pedidos en línea están pausados. Puedes pedir directamente en barra. Tu carrito queda guardado para cuando vuelvan a estar disponibles.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pagar con tarjeta' })).toBeDisabled();
  await capturePublic(page, 'pickup-cart-paused-mobile');
  await page.getByRole('button', { name: 'Seguir eligiendo' }).click();
  await page.getByRole('button', { name: 'Bebidas frías', exact: true }).click();
  await expect(page.locator('.pickup-product').filter({ has: page.getByRole('heading', { name: 'Americano', exact: true }) })).toHaveCount(0);
  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  await mkdir(evidence, { recursive: true });
  await capturePublic(page, 'pickup-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capturePublic(page, 'pickup-desktop');
});

test('mobile pickup checkout and receipt recovery with a mocked Stripe checkout transport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let attempts = 0;
  let receipt: PickupOrder | undefined;
  let returnUrl = '';
  await page.route('**/api/pickup/menu', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json() as PickupMenu, acceptingOrders: true } });
  });
  await page.route('**/api/pickup/checkout', async (route) => {
    const payload = route.request().postDataJSON() as PickupAttempt;
    attempts++;
    receipt = { id: payload.operationId, folio: 'Q-PICKUPTEST', customerName: payload.customerName, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', total: 55, createdAt: new Date().toISOString(), items: [{ productName: 'Latte', quantity: 1, unitPrice: 55, totalPrice: 55 }], pickup: { locationName: 'ROFÉ Espresso Bar', locationAddress: 'Barra principal', expiresAt: new Date(Date.now() + 35 * 60_000).toISOString() } };
    returnUrl = `http://127.0.0.1:4173/pedir?pedido=${payload.operationId}#clave=${payload.accessToken}`;
    await route.fulfill({ json: { order: receipt, checkoutUrl: 'https://checkout.stripe.com/c/pay/rofe-e2e' } });
  });
  await page.route('**/api/pickup/orders/*', (route) => route.fulfill({ json: receipt }));
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><h1>Stripe de prueba</h1></body></html>' }));
  await page.goto('/pedir?stand=entrada');
  await page.locator('.pickup-product').filter({ has: page.getByRole('heading', { name: 'Latte', exact: true }) }).click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await page.getByRole('button', { name: /Ver mi pedido/ }).click();
  await page.getByLabel('¿A nombre de quién?').fill('Andrea QR');
  await mkdir(evidence, { recursive: true });
  await capturePublic(page, 'pickup-cart-mobile');
  await page.getByRole('button', { name: 'Pagar con tarjeta' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  receipt = { ...receipt!, status: 'PAID', paymentStatus: 'APPROVED' };
  await page.goto(returnUrl);
  await expect(page.getByRole('heading', { name: 'Ya recibimos tu pedido.' })).toBeVisible();
  await expect(page.getByText('Q-PICKUPTEST')).toBeVisible();
  await expect(page).not.toHaveURL(/clave/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ya recibimos tu pedido.' })).toBeVisible();
  expect(attempts).toBe(1);
  receipt = { ...receipt, status: 'READY' };
  await expect(page.getByRole('heading', { name: 'Tu café te está esperando.' })).toBeVisible({ timeout: 12_000 });
  await capturePublic(page, 'pickup-receipt-mobile');
});

test('admin configures pickup and downloads an actual printable QR stand', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar con una cuenta de equipo' }).click();
  await page.getByLabel('Correo').fill('admin@rofe.test');
  await page.getByLabel('Contraseña o PIN').fill('TestAdmin123!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.getByRole('button', { name: 'Pedidos QR', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pedidos QR · Pickup' })).toBeVisible();
  await page.getByLabel('Dirección o referencia', { exact: true }).fill('Recoge en la barra principal de ROFÉ');
  await page.getByRole('button', { name: 'Guardar configuración' }).click();
  await expect(page.getByText('Configuración de pickup guardada.')).toBeVisible();
  await page.getByLabel('Identificador del stand').fill('entrada-01');
  await expect(page.getByRole('img', { name: /Código QR.*entrada-01/ })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar letrero' }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('ROFE-pide-aqui-entrada-01.svg');
  const svg = await readFile((await file.path())!, 'utf8');
  expect(svg).toContain('PIDE TU CAFÉ'); expect(svg).toContain('<svg x="130" y="390"'); expect(svg).toContain('VISTA PREVIA LOCAL');
  expect(svg).toContain('data:font/ttf;base64,'); expect(svg).toContain('Bricolage Grotesque'); expect(svg).toContain('SIL Open Font License');
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator('.admin-content').evaluate((element) => element.scrollTo(0, 0));
  await page.screenshot({ path: `${evidence}/pickup-admin-desktop.png`, fullPage: true });
});

test('a changed price requires explicit approval and resumes the same checkout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let creates = 0; let resumes = 0; let orderId = '';
  await page.route('**/api/pickup/menu', async (route) => { const response = await route.fetch(); await route.fulfill({ response, json: { ...await response.json() as PickupMenu, acceptingOrders: true } }); });
  const result = (id: string) => ({ order: { id, folio: 'Q-PRICE', total: 60, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', items: [{ productName: 'Latte', quantity: 1, unitPrice: 60, totalPrice: 60 }] }, checkoutUrl: 'https://checkout.stripe.com/c/pay/price-test' });
  await page.route('**/api/pickup/checkout', (route) => { creates++; orderId = (route.request().postDataJSON() as PickupAttempt).operationId; return route.fulfill({ json: result(orderId) }); });
  await page.route('**/api/pickup/orders/*/resume', (route) => { resumes++; expect(route.request().url()).toContain(orderId); return route.fulfill({ json: result(orderId) }); });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body>Checkout de prueba</body></html>' }));
  await page.goto('/pedir');
  await page.locator('.pickup-product').filter({ has: page.getByRole('heading', { name: 'Latte', exact: true }) }).click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await page.getByRole('button', { name: /Ver mi pedido/ }).click();
  await page.getByLabel('¿A nombre de quién?').fill('Precio confirmado');
  await page.getByRole('button', { name: 'Pagar con tarjeta' }).click();
  await expect(page.locator('.pickup-cart').getByRole('alert')).toContainText('El total confirmado es $60.00 MXN');
  await expect(page).toHaveURL(/\/pedir/);
  await page.getByRole('button', { name: 'Continuar pago · $60.00' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(creates).toBe(1); expect(resumes).toBe(1);
});
