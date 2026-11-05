import { expect, test, type Page } from '@playwright/test';

/*
 * Self-service terminal (/kiosk) on Lenovo Tab M10-class CSS viewports.
 * Runs in the "M10 landscape" and "M10 portrait" projects (playwright.config.ts).
 */

async function authorize(page: Page, name: string, query = '') {
  await page.goto(`/kiosk${query}`);
  await page.getByLabel('Nombre de la terminal').fill(name);
  await page.getByLabel('Clave de registro').fill('e2e-device-enrollment-secret');
  await page.getByRole('button', { name: 'Autorizar terminal' }).click();
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
}

async function addSimpleProduct(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).first().click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** The visible checkout entry point: order column in landscape, order bar in portrait. */
const checkoutButton = (page: Page) => page.locator('.kiosk-terminal[data-stacked="true"]').count().then((stacked) =>
  stacked ? page.locator('.kiosk-cart-cta') : page.getByRole('button', { name: /CONTINUAR AL PAGO/ }));

/** Waits until the layout reflects the viewport (React re-renders after `resize`). */
async function resize(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  const stacked = size.width < 760 || size.height > size.width;
  await expect(page.locator('.kiosk-terminal')).toHaveAttribute('data-stacked', String(stacked));
}

async function expectInsideViewport(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, `${selector} is rendered`).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

test('locks zoom, keeps the CTA on screen and has no horizontal overflow', async ({ page }) => {
  await authorize(page, 'M10 layout');
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('user-scalable=no');
  expect(viewport).toContain('maximum-scale=1');
  expect(viewport).toContain('viewport-fit=cover');
  expect(viewport).toContain('interactive-widget=resizes-content');
  await expectInsideViewport(page, '.kiosk-welcome-start');
  await page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
  await addSimpleProduct(page, /Croissant/);
  const cta = await checkoutButton(page);
  await expect(cta).toBeEnabled();
  const box = (await cta.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(48);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expectNoHorizontalOverflow(page);
  // Touch targets: category chips and product cards are comfortably large.
  for (const target of await page.locator('.kiosk-catalog .category-tab').all()) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(48);
});

test('full order: product → modifiers → order → name → cash → confirmation → clean session', async ({ page }) => {
  const orders: string[] = [];
  page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/orders') orders.push(request.url()); });
  await authorize(page, 'M10 flujo', '?confirm=4');
  await page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
  await page.getByRole('button', { name: /^Latte/ }).first().click();
  await page.getByRole('button', { name: /Grande/ }).click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await (await checkoutButton(page)).click();
  const name = page.getByPlaceholder('Ingresa tu nombre...');
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('autocomplete', 'off');
  await name.fill('Valeria');
  await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click();
  // The self-service terminal never offers the staff discount form.
  await expect(page.getByRole('button', { name: /descuento/i })).toHaveCount(0);
  // Double tap on a slow network creates exactly one order.
  await page.getByRole('button', { name: /PAGO EN EFECTIVO/ }).dblclick();
  await expect(page.getByRole('heading', { name: 'PEDIDO REGISTRADO' })).toBeVisible();
  await expect(page.getByText('Valeria')).toBeVisible();
  await expect(page.getByText(/Volvemos al inicio en \d+ s/)).toBeVisible();
  expect(orders).toHaveLength(1);
  // Automatic reset: back to welcome, nothing of the previous customer survives.
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
  await expect((await checkoutButton(page))).toBeDisabled();
  await expect(page.getByText('Valeria')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('rofe-kiosk-session-v1'))).toBeNull();
});

test('rotating keeps the order, the open product and its modifiers without reloading', async ({ page }) => {
  await authorize(page, 'M10 rotación');
  await page.evaluate(() => { (window as Window & { rofeNoReload?: boolean }).rofeNoReload = true; });
  await page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
  await addSimpleProduct(page, /Croissant/);
  await page.getByRole('button', { name: /^Latte/ }).first().click();
  await page.getByRole('button', { name: /Grande/ }).click();
  const { width, height } = page.viewportSize()!;
  for (const size of [{ width: height, height: width }, { width, height }]) {
    await resize(page, size);
    await expect(page.getByRole('dialog', { name: /Personalizar Latte/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Grande/ })).toHaveClass(/active/);
    await expectNoHorizontalOverflow(page);
  }
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await resize(page, { width: 800, height: 1280 });
  await expect(page.locator('.kiosk-cart-count')).toHaveText('2');
  await page.locator('.kiosk-cart-summary').click();
  await expect(page.locator('.kiosk-cart').getByText('Croissant de mantequilla')).toBeVisible();
  await expect(page.locator('.kiosk-cart')).toHaveCSS('transform', 'none'); // sheet finished opening
  await expectInsideViewport(page, '.kiosk-cart .checkout-btn');
  await resize(page, { width: 1280, height: 800 });
  await expect(page.locator('.kiosk-cart').getByText('Croissant de mantequilla')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { rofeNoReload?: boolean }).rofeNoReload)).toBe(true);
});

test('the virtual keyboard never flips portrait to landscape nor hides the name field', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto('/kiosk');
  await authorize(page, 'M10 teclado');
  await page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
  await addSimpleProduct(page, /Croissant/);
  await page.locator('.kiosk-cart-cta').click();
  const name = page.getByPlaceholder('Ingresa tu nombre...');
  await expect(name).toBeFocused();
  // Android keyboard: the physical screen stays portrait while the viewport loses ~40%.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 760, deviceScaleFactor: 1, mobile: true, screenWidth: 800, screenHeight: 1280, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
  await expect(page.locator('.kiosk-terminal')).toHaveAttribute('data-stacked', 'true');
  await expectInsideViewport(page, '.name-input');
  await expectInsideViewport(page, '.confirm-name-btn');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 1280, deviceScaleFactor: 1, mobile: true, screenWidth: 800, screenHeight: 1280, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
  await expectInsideViewport(page, '.confirm-name-btn');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
});

test('inactivity asks "¿Sigues ahí?" and then clears the order', async ({ page }) => {
  await page.clock.install();
  await authorize(page, 'M10 inactividad', '?idle=30&idlePrompt=10');
  await page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
  await addSimpleProduct(page, /Croissant/);
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('alertdialog', { name: '¿Sigues ahí?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar pedido' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(await checkoutButton(page)).toBeEnabled();
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('alertdialog', { name: '¿Sigues ahí?' })).toBeVisible();
  await page.clock.fastForward(11_000);
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
  await page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
  await expect(await checkoutButton(page)).toBeDisabled();
});

test('an empty menu returns to the welcome screen after inactivity without asking', async ({ page }) => {
  await page.clock.install();
  await authorize(page, 'M10 inactividad vacía', '?idle=30');
  await page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('offline shows a calm reconnecting screen and recovers the same order', async ({ page, context }) => {
  await authorize(page, 'M10 offline');
  await page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
  await addSimpleProduct(page, /Croissant/);
  await context.setOffline(true);
  await expect(page.getByRole('alertdialog', { name: 'Sin conexión' })).toBeVisible();
  await expect(page.getByText('Estamos intentando reconectar.', { exact: false })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('alertdialog', { name: 'Sin conexión' })).toHaveCount(0, { timeout: 15_000 });
  await expect(await checkoutButton(page)).toBeEnabled();
});

test('Back closes dialogs first and never leaves the terminal', async ({ page }) => {
  await authorize(page, 'M10 atrás');
  await page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
  await page.getByRole('button', { name: /^Latte/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // The Android shell calls window.rofeKiosk.back(); it always reports "handled".
  expect(await page.evaluate(() => window.rofeKiosk?.back())).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // With an empty order Back returns to the welcome screen…
  expect(await page.evaluate(() => window.rofeKiosk?.back())).toBe(true);
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
  // …and at the root it is consumed: the page never navigates away.
  expect(await page.evaluate(() => window.rofeKiosk?.back())).toBe(true);
  // Browser/PWA Back is routed to the same stack.
  await page.goBack();
  await expect(page).toHaveURL(/\/kiosk$/);
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
});

test('cancelling asks for confirmation and starts a fresh session', async ({ page }) => {
  await authorize(page, 'M10 cancelar');
  await page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
  await addSimpleProduct(page, /Croissant/);
  if (await page.locator('.kiosk-terminal[data-stacked="true"]').count()) await page.locator('.kiosk-cart-summary').click();
  await page.locator('.kiosk-cart').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('alertdialog', { name: '¿Cancelar tu pedido?' })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir pidiendo' }).click();
  await expect(page.locator('.kiosk-cart').getByText('Croissant de mantequilla')).toBeAttached();
  if (await page.locator('.kiosk-terminal[data-stacked="true"]').count() && !(await page.locator('.kiosk-terminal[data-cart-open="true"]').count())) await page.locator('.kiosk-cart-summary').click();
  await page.locator('.kiosk-cart').getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
});

test('small and short viewports keep the order and CTA reachable', async ({ page }) => {
  await authorize(page, 'M10 pequeña');
  await page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
  await addSimpleProduct(page, /Croissant/);
  for (const size of [{ width: 600, height: 960 }, { width: 1024, height: 600 }, { width: 390, height: 700 }, { width: 960, height: 540 }]) {
    await resize(page, size);
    const cta = await checkoutButton(page);
    await expect(cta).toBeVisible();
    const box = (await cta.boundingBox())!;
    expect(box.y + box.height, `CTA inside ${size.width}x${size.height}`).toBeLessThanOrEqual(size.height);
    await expectNoHorizontalOverflow(page);
  }
});

test('long-press on the logo opens staff access in a browser (no native shell)', async ({ page }) => {
  await authorize(page, 'M10 admin');
  const logo = page.locator('.kiosk-logo').first();
  const box = (await logo.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1_000);
  await page.mouse.up();
  await expect(page.getByLabel('Correo')).toHaveCount(0);
  await page.mouse.down();
  await page.waitForTimeout(5_300);
  await page.mouse.up();
  await expect(page.getByLabel('Correo')).toBeVisible();
});
