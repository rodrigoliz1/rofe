import { expect, test, type Page } from '@playwright/test';

/*
 * Self-service terminal (/kiosk) on Lenovo Tab M10-class CSS viewports.
 * Runs in the "M10 landscape" (1280×800) and "M10 portrait" (800×1280) projects.
 * These are emulated measurements (desktop Chromium, local servers), not tablet results.
 */

async function authorize(page: Page, name: string, query = '') {
  await page.goto(`/kiosk${query}`);
  await page.getByLabel('Nombre de la terminal').fill(name);
  await page.getByLabel('Clave de registro').fill('e2e-device-enrollment-secret');
  await page.getByRole('button', { name: 'Autorizar terminal' }).click();
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
}

const start = (page: Page) => page.getByRole('button', { name: /ORDENAR AQUÍ/ }).click();
const orderButton = (page: Page) => page.locator('.kiosk-order-button');
const drawer = (page: Page) => page.getByRole('dialog', { name: 'TU PEDIDO' });

async function addSimpleProduct(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).first().click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function openCart(page: Page) {
  await orderButton(page).click();
  await expect(drawer(page)).toBeVisible();
  // Wait for the slide-in to finish before measuring.
  await page.waitForFunction(() => { const panel = document.querySelector('.kiosk-drawer'); return panel && panel.getAnimations().every((animation) => animation.playState !== 'running'); });
  return drawer(page);
}

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
  expect(box!.y).toBeGreaterThanOrEqual(-0.5);
  expect(box!.y + box!.height, `${selector} bottom inside ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.height + 0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

const columns = (page: Page) => page.locator('.kiosk-catalog .products-grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length);

test('the menu uses the whole screen: no persistent order, 3–4 columns landscape, 2 portrait', async ({ page }, testInfo) => {
  await authorize(page, 'M10 layout');
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('user-scalable=no');
  expect(viewport).toContain('maximum-scale=1');
  expect(viewport).toContain('viewport-fit=cover');
  expect(viewport).toContain('interactive-widget=resizes-content');
  await start(page);
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.locator('.cart-sidebar')).toHaveCount(0);
  const { width } = page.viewportSize()!;
  const catalog = (await page.locator('.kiosk-catalog').boundingBox())!;
  expect(catalog.width).toBeGreaterThanOrEqual(width - 1);
  const count = await columns(page);
  if (testInfo.project.name.includes('portrait')) expect(count).toBe(2);
  else expect(count).toBeGreaterThanOrEqual(3);
  await expectNoHorizontalOverflow(page);
  await expect(orderButton(page)).toHaveText(/TU PEDIDO/);
  expect((await orderButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  for (const target of await page.locator('.kiosk-catalog .category-tab').all()) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  // Names and prices are never cut: each card's text fits its box.
  const clipped = await page.locator('.kiosk-catalog .product-card').evaluateAll((cards) => cards.filter((card) => card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1).length);
  expect(clipped).toBe(0);
  await testInfo.attach('menu', { body: await page.screenshot(), contentType: 'image/png' });
});

test('TU PEDIDO opens as an overlay and closes with X, backdrop, Back and Escape', async ({ page }, testInfo) => {
  await authorize(page, 'M10 drawer');
  await start(page);
  const catalogBefore = (await page.locator('.kiosk-catalog').boundingBox())!;
  // An empty order can be opened too.
  await openCart(page);
  await expect(drawer(page).getByText('Comienza tu orden')).toBeVisible();
  await expect(drawer(page)).toHaveAttribute('aria-modal', 'true');
  expect((await page.locator('.kiosk-catalog').boundingBox())!.width).toBe(catalogBefore.width); // overlay, not a column
  await expect(page.locator('.kiosk-catalog')).toHaveAttribute('inert', '');
  await page.getByRole('button', { name: 'Cerrar pedido' }).click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(orderButton(page)).toBeFocused();

  await openCart(page);
  const panel = (await page.locator('.kiosk-drawer').boundingBox())!;
  const viewport = page.viewportSize()!;
  // Tap outside the panel (on the dimmed catalog).
  await page.mouse.click(testInfo.project.name.includes('portrait') ? viewport.width / 2 : panel.x / 2, testInfo.project.name.includes('portrait') ? panel.y / 2 : viewport.height / 2);
  await expect(drawer(page)).toHaveCount(0);

  await openCart(page);
  expect(await page.evaluate(() => window.rofeKiosk?.back())).toBe(true);
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toHaveCount(0); // Back closed only the panel

  await openCart(page);
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
});

test('adding updates the counter without opening the order and keeps the catalog scroll', async ({ page }, testInfo) => {
  await authorize(page, 'M10 contador');
  await start(page);
  await expect(page.locator('.kiosk-order-count')).toHaveCount(0);
  const grid = page.locator('.kiosk-catalog .products-grid');
  await grid.evaluate((element) => element.scrollTo({ top: 200 }));
  // (Playwright scrolls the card into view to click it; measure once the sheet is open.)
  await page.getByRole('button', { name: /Galleta/ }).click();
  const scrolled = await grid.evaluate((element) => element.scrollTop);
  expect(scrolled).toBeGreaterThan(0);
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await expect(page.locator('.kiosk-order-count')).toHaveText('1');
  await expect(page.getByRole('status').filter({ hasText: 'Agregado · Galleta de chocolate' })).toBeVisible();
  await expect(drawer(page)).toHaveCount(0);
  expect(await grid.evaluate((element) => element.scrollTop)).toBe(scrolled);
  await page.getByRole('button', { name: /^Espresso/ }).click();
  await page.getByRole('button', { name: /^\+$/ }).last().click(); // quantity 2 in the sheet
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  await expect(page.locator('.kiosk-order-count')).toHaveText('3');
  await expect(orderButton(page)).toHaveAccessibleName(/3 artículos/);
  const cart = await openCart(page);
  await expect(cart.getByText('Galleta de chocolate')).toBeVisible();
  await cart.getByRole('button', { name: 'Agregar una unidad de Galleta de chocolate' }).click();
  await expect(page.locator('.kiosk-order-count')).toHaveText('4');
  await cart.getByRole('button', { name: 'Quitar una unidad de Espresso' }).click();
  await expect(page.locator('.kiosk-order-count')).toHaveText('3');
  await testInfo.attach('order', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Cerrar pedido' }).click();
  // Closing keeps the order intact.
  await expect(page.locator('.kiosk-order-count')).toHaveText('3');
  const again = await openCart(page);
  await expect(again.getByText('Galleta de chocolate')).toBeVisible();
  await again.locator('.cart-item').filter({ hasText: 'Espresso' }).getByRole('button', { name: 'Eliminar' }).click();
  await expect(again.getByText('Espresso')).toHaveCount(0);
  await expect(page.locator('.kiosk-order-count')).toHaveText('2');
});

test('full order from the panel: name → cash → confirmation → clean session, one request on double tap', async ({ page }) => {
  const orders: string[] = [];
  page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/orders') orders.push(request.url()); });
  await authorize(page, 'M10 flujo', '?confirm=4');
  await start(page);
  await page.getByRole('button', { name: /^Latte/ }).first().click();
  await page.getByRole('button', { name: /Grande/ }).click();
  await page.getByRole('button', { name: /Agregar a la Orden/ }).click();
  const cart = await openCart(page);
  await expectInsideViewport(page, '.kiosk-drawer .checkout-btn');
  await cart.getByRole('button', { name: /CONTINUAR AL PAGO/ }).click();
  await expect(drawer(page)).toHaveCount(0);
  const name = page.getByPlaceholder('Ingresa tu nombre...');
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('autocomplete', 'off');
  await name.fill('Valeria');
  await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click();
  await expect(page.getByRole('button', { name: /descuento/i })).toHaveCount(0);
  await page.getByRole('button', { name: /PAGO EN EFECTIVO/ }).dblclick();
  await expect(page.getByRole('heading', { name: 'PEDIDO REGISTRADO' })).toBeVisible();
  await expect(page.getByText('Valeria')).toBeVisible();
  await expect(page.getByText(/Volvemos al inicio en \d+ s/)).toBeVisible();
  expect(orders).toHaveLength(1);
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible({ timeout: 10_000 });
  await start(page);
  await expect(page.locator('.kiosk-order-count')).toHaveCount(0);
  await expect(page.getByText('Valeria')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('rofe-kiosk-session-v1'))).toBeNull();
});

test('cancelling checkout keeps the order', async ({ page }) => {
  await authorize(page, 'M10 cancelar pago');
  await start(page);
  await addSimpleProduct(page, /Croissant/);
  await (await openCart(page)).getByRole('button', { name: /CONTINUAR AL PAGO/ }).click();
  await page.getByRole('button', { name: 'Cerrar pago' }).click();
  await expect(page.locator('.kiosk-order-count')).toHaveText('1');
  await expect((await openCart(page)).getByText('Croissant de mantequilla')).toBeVisible();
});

test('rotating keeps the open panel, the order and the open product without reloading', async ({ page }) => {
  await authorize(page, 'M10 rotación');
  await page.evaluate(() => { (window as Window & { rofeNoReload?: boolean }).rofeNoReload = true; });
  await start(page);
  await addSimpleProduct(page, /Croissant/);
  const { width, height } = page.viewportSize()!;
  // Closed stays closed.
  await resize(page, { width: height, height: width });
  await expect(drawer(page)).toHaveCount(0);
  await resize(page, { width, height });
  // Open stays open and adapts: drawer ↔ bottom sheet.
  await openCart(page);
  for (const size of [{ width: height, height: width }, { width, height }]) {
    await resize(page, size);
    await expect(drawer(page)).toBeVisible();
    await expect(page.locator('.kiosk-drawer-layer')).toHaveAttribute('data-variant', size.height > size.width ? 'sheet' : 'drawer');
    await expect(drawer(page).getByText('Croissant de mantequilla')).toBeVisible();
    await page.waitForTimeout(260);
    await expectInsideViewport(page, '.kiosk-drawer .checkout-btn');
    await expectInsideViewport(page, '.kiosk-drawer .cart-close-btn');
    await expectNoHorizontalOverflow(page);
  }
  await page.getByRole('button', { name: 'Cerrar pedido' }).click();
  // A product sheet with modifiers survives rotation too.
  await page.getByRole('button', { name: /^Latte/ }).first().click();
  await page.getByRole('button', { name: /Grande/ }).click();
  await resize(page, { width: height, height: width });
  await expect(page.getByRole('dialog', { name: /Personalizar Latte/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Grande/ })).toHaveClass(/active/);
  await resize(page, { width, height });
  expect(await page.evaluate(() => (window as Window & { rofeNoReload?: boolean }).rofeNoReload)).toBe(true);
});

test('the virtual keyboard never flips portrait to landscape nor hides the name field', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await authorize(page, 'M10 teclado');
  await start(page);
  await addSimpleProduct(page, /Croissant/);
  await (await openCart(page)).getByRole('button', { name: /CONTINUAR AL PAGO/ }).click();
  const name = page.getByPlaceholder('Ingresa tu nombre...');
  await expect(name).toBeFocused();
  // Android keyboard: the physical screen stays portrait while the viewport loses ~40%.
  const cdp = await page.context().newCDPSession(page);
  const metrics = { deviceScaleFactor: 1, mobile: true, screenWidth: 800, screenHeight: 1280, screenOrientation: { type: 'portraitPrimary' as const, angle: 0 } };
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 760, ...metrics });
  await expect(page.locator('.kiosk-terminal')).toHaveAttribute('data-stacked', 'true');
  await expectInsideViewport(page, '.name-input');
  await expectInsideViewport(page, '.confirm-name-btn');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 1280, ...metrics });
  await expectInsideViewport(page, '.confirm-name-btn');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
});

test('inactivity with the panel open asks "¿Sigues ahí?" above it, then clears and closes everything', async ({ page }) => {
  await page.clock.install();
  await authorize(page, 'M10 inactividad', '?idle=30&idlePrompt=10');
  await start(page);
  await addSimpleProduct(page, /Croissant/);
  await openCart(page);
  await page.clock.fastForward(31_000);
  const prompt = page.getByRole('alertdialog', { name: '¿Sigues ahí?' });
  await expect(prompt).toBeVisible();
  // The prompt is on top of the order panel, not underneath it.
  const box = (await prompt.boundingBox())!;
  expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[role="alertdialog"]')), { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true);
  await page.getByRole('button', { name: 'Continuar pedido' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(drawer(page)).toBeVisible();
  await page.clock.fastForward(31_000);
  await expect(prompt).toBeVisible();
  await page.clock.fastForward(11_000);
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
  await start(page);
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.locator('.kiosk-order-count')).toHaveCount(0);
});

test('an empty menu returns to the welcome screen after inactivity without asking', async ({ page }) => {
  await page.clock.install();
  await authorize(page, 'M10 inactividad vacía', '?idle=30');
  await start(page);
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('offline shows a calm reconnecting screen and recovers the same order', async ({ page, context }) => {
  await authorize(page, 'M10 offline');
  await start(page);
  await addSimpleProduct(page, /Croissant/);
  await context.setOffline(true);
  await expect(page.getByRole('alertdialog', { name: 'Sin conexión' })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('alertdialog', { name: 'Sin conexión' })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.kiosk-order-count')).toHaveText('1');
});

test('Back closes dialogs first and never leaves the terminal', async ({ page }) => {
  await authorize(page, 'M10 atrás');
  await start(page);
  await page.getByRole('button', { name: /^Latte/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => window.rofeKiosk?.back())).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.rofeKiosk?.back())).toBe(true);
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
  expect(await page.evaluate(() => window.rofeKiosk?.back())).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(/\/kiosk$/);
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
});

test('cancelling the order asks for confirmation and starts a fresh session', async ({ page }) => {
  await authorize(page, 'M10 cancelar');
  await start(page);
  await addSimpleProduct(page, /Croissant/);
  await (await openCart(page)).getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('alertdialog', { name: '¿Cancelar tu pedido?' })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir pidiendo' }).click();
  await expect(drawer(page).getByText('Croissant de mantequilla')).toBeVisible();
  await drawer(page).getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
  await start(page);
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.locator('.kiosk-order-count')).toHaveCount(0);
});

test('small and short viewports keep the panel header and CTA reachable', async ({ page }) => {
  await authorize(page, 'M10 pequeña');
  await start(page);
  await addSimpleProduct(page, /Croissant/);
  await openCart(page);
  for (const size of [{ width: 600, height: 960 }, { width: 1024, height: 600 }, { width: 390, height: 700 }, { width: 960, height: 540 }]) {
    await resize(page, size);
    await page.waitForTimeout(260);
    await expectInsideViewport(page, '.kiosk-drawer .checkout-btn');
    await expectInsideViewport(page, '.kiosk-drawer .cart-close-btn');
    await expectNoHorizontalOverflow(page);
  }
});

test('every product shows its own photo or the brand illustration — never a wrong or broken image', async ({ page }) => {
  await authorize(page, 'M10 fotos');
  await start(page);
  const cards = page.locator('.kiosk-catalog .product-card');
  await expect(cards).toHaveCount(8);
  const photos = await cards.evaluateAll((elements) => elements.map((card) => {
    const image = card.querySelector('img');
    return { name: card.querySelector('.product-card-name')?.textContent, source: card.querySelector('[data-photo]')?.getAttribute('data-photo'), src: image?.getAttribute('src') ?? null };
  }));
  const bySrc = new Map<string, string[]>();
  for (const photo of photos) {
    if (photo.name === 'Latte' || photo.name === 'Croissant de mantequilla') { expect(photo.source, `${photo.name} waits for an approved photo`).toBe('pending'); expect(photo.src).toBeNull(); continue; }
    expect(photo.source, `${photo.name}`).toBe('catalog');
    expect(photo.src).toMatch(/^\/products\/[a-z-]+-\d+\.[0-9a-f]{10}\.webp$/);
    bySrc.set(photo.src!, [...(bySrc.get(photo.src!) ?? []), photo.name!]);
  }
  // No two products share the same picture.
  for (const [src, names] of bySrc) expect(names, src).toHaveLength(1);
  for (const src of bySrc.keys()) {
    const response = await page.request.get(src);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');
    expect((await response.body()).byteLength).toBeLessThan(80_000);
  }
  await page.locator('.kiosk-catalog .products-grid').evaluate((grid) => grid.scrollTo({ top: grid.scrollHeight }));
  await expect.poll(() => cards.locator('img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
});

test('a photo that fails to load falls back to the brand illustration', async ({ page }) => {
  await page.route(/\/products\/espresso-/, (route) => route.abort());
  await authorize(page, 'M10 foto rota');
  await start(page);
  const espresso = page.locator('.kiosk-catalog .product-card').filter({ has: page.getByRole('heading', { name: 'Espresso', exact: true }) });
  await expect(espresso.locator('.product-card-icon-wrapper')).toBeVisible();
  await expect(espresso.locator('img')).toHaveCount(0);
});

test('photos are downloaded and decoded on the welcome screen, ready when the menu opens', async ({ page }, testInfo) => {
  await authorize(page, 'M10 precarga');
  await page.reload();
  await expect(page.getByRole('button', { name: /ORDENAR AQUÍ/ })).toBeVisible();
  // The welcome screen preloads the first screen without being touched.
  await page.waitForFunction(() => Boolean(window.__rofeKioskPreload));
  const preload = await page.evaluate(() => window.__rofeKioskPreload!);
  expect(preload.total).toBe(6);
  const clickedAt = await page.evaluate(() => performance.now());
  await start(page);
  // First screen: every visible card image is painted (loaded class) almost immediately.
  await page.waitForFunction(() => {
    const visible = [...document.querySelectorAll('.kiosk-catalog .product-card-image-wrapper')].filter((wrapper) => { const box = wrapper.getBoundingClientRect(); return box.top < innerHeight && box.bottom > 0; });
    return visible.length > 0 && visible.every((wrapper) => wrapper.classList.contains('is-loaded'));
  });
  const paintedMs = (await page.evaluate(() => performance.now())) - clickedAt;
  const report = { firstScreenPreloadMs: Math.round(preload.firstScreenMs), allPreloadMs: Math.round(preload.allMs), photos: preload.total, menuPhotosPaintedAfterTapMs: Math.round(paintedMs), environment: 'emulated: desktop Chromium, local preview server, no network throttling' };
  await testInfo.attach('preload-metrics.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  console.log(`[kiosk metrics ${testInfo.project.name}]`, JSON.stringify(report));
  expect(paintedMs).toBeLessThan(500);
  // No photo was requested twice (preloader and <img> share the same URL).
  const requested = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/products/')));
  const counts = new Map<string, number>();
  for (const name of requested) counts.set(name, (counts.get(name) ?? 0) + 1);
  for (const [name, count] of counts) expect(count, name).toBe(1);
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
